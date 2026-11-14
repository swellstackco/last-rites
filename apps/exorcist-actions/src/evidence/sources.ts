// Sources of the action evidence (Requirements 4.3, 4.5, 5.1, 5.4, 6.1, 12.1). Every function returns an
// `Outcome<T>` and never throws. The GitHub token goes only to api.github.com (through `createGithubGet`);
// the raw manifest host never sees it.
import {
  classifyStatus,
  createGithubGet,
  fail,
  fetchOsv,
  isRecord,
  ok,
} from "@graveyard-kit/exorcist-npm/programmatic";
import type { Outcome, SourceContext } from "@graveyard-kit/exorcist-npm/programmatic";
import { parseActionManifest } from "./manifest.js";
import type { ActionManifest } from "./manifest.js";
import { commitUrl, rawManifestUrl, releasesLatestUrl, tagsUrl } from "./urls.js";
import type { ManifestFile } from "./urls.js";

export interface PublishEvidence {
  /** The original timestamp string; assembly turns it into months. */
  timestamp: string;
  via: "release" | "tag";
  warnings: string[];
}

export interface ManifestEvidence {
  manifest: ActionManifest;
  file: ManifestFile;
}

const SHA40 = /^[0-9a-fA-F]{40}$/;

const stringField = (v: unknown, key: string): string | undefined => {
  const x = isRecord(v) ? v[key] : undefined;
  return typeof x === "string" ? x : undefined;
};

/** The commit date of a `commits/{sha}` document: committer date, else author date. */
function commitDate(json: unknown): string | undefined {
  const commit = isRecord(json) ? json["commit"] : undefined;
  return stringField(commit && isRecord(commit) ? commit["committer"] : undefined, "date") ??
    stringField(commit && isRecord(commit) ? commit["author"] : undefined, "date");
}

/** Latest release `published_at`; on 404 the commit date of the first tag; neither gives `not_found`. */
export async function fetchPublish(ctx: SourceContext, owner: string, repo: string): Promise<Outcome<PublishEvidence>> {
  try {
    const { get, warnings } = createGithubGet(ctx);
    const release = await get(releasesLatestUrl(owner, repo));
    if (release.ok) {
      const at = stringField(release.json, "published_at");
      return at === undefined ? fail("github", "malformed_response") : ok({ timestamp: at, via: "release", warnings });
    }
    if (release.status !== 404) return fail("github", release.category);

    const tags = await get(tagsUrl(owner, repo));
    if (!tags.ok) return fail("github", tags.category);
    if (!Array.isArray(tags.json)) return fail("github", "malformed_response");
    if (tags.json.length === 0) return fail("github", "not_found");
    const first: unknown = tags.json[0];
    const sha = stringField(isRecord(first) ? first["commit"] : undefined, "sha");
    if (sha === undefined || !SHA40.test(sha)) return fail("github", "malformed_response");

    const commit = await get(commitUrl(owner, repo, sha));
    if (!commit.ok) return fail("github", commit.category);
    const at = commitDate(commit.json);
    return at === undefined ? fail("github", "malformed_response") : ok({ timestamp: at, via: "tag", warnings });
  } catch {
    return fail("github", "network_error");
  }
}

/** `action.yml`, then `action.yaml` only on a 404. No token is sent; the request goes through the cache directly. */
export async function fetchManifest(
  ctx: SourceContext,
  name: string,
  ref: string,
  path: string | undefined,
): Promise<Outcome<ManifestEvidence>> {
  try {
    for (const file of ["action.yml", "action.yaml"] as const) {
      const res = await ctx.cache.get("github", {
        method: "GET",
        url: rawManifestUrl(name, ref, path, file),
        timeoutMs: ctx.config.requestTimeoutMs,
      });
      if (!res.ok) {
        if (res.failure.kind === "transport") return fail("github", res.failure.category);
        if (res.failure.response.status === 404) continue;
        return fail("github", classifyStatus(res.failure.response));
      }
      const parsed = parseActionManifest(res.response.body);
      return parsed.ok ? ok({ manifest: parsed.manifest, file }) : fail("github", "malformed_response");
    }
    return fail("github", "not_found");
  } catch {
    return fail("github", "network_error");
  }
}

/** `GET /repos/{o}/{r}/commits/{ref}`: the `sha` field, which must be 40 hexadecimal characters. */
export async function resolveCommit(
  ctx: SourceContext,
  owner: string,
  repo: string,
  ref: string,
): Promise<Outcome<string>> {
  try {
    const { get } = createGithubGet(ctx);
    const res = await get(commitUrl(owner, repo, ref));
    if (!res.ok) return fail("github", res.category);
    const sha = stringField(res.json, "sha");
    return sha !== undefined && SHA40.test(sha) ? ok(sha.toLowerCase()) : fail("github", "malformed_response");
  } catch {
    return fail("github", "network_error");
  }
}

/** OSV with ecosystem `GitHub Actions`, package `{owner}/{repo}` and no version. */
export async function fetchActionsOsv(ctx: SourceContext, owner: string, repo: string): Promise<Outcome<number>> {
  try {
    return await fetchOsv(ctx, `${owner}/${repo}`, undefined, "GitHub Actions");
  } catch {
    return fail("osv", "network_error");
  }
}
