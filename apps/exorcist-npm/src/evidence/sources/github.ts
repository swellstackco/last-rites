/**
 * GitHub source (Requirements 4.1-4.3, 4.5-4.10, 14.5, 14.6). Repository metadata, then the latest
 * commit on the default branch. The bearer token is sent only to api.github.com and never stored.
 */
import { parseIsoTimestamp } from "../months-since.js";
import { fetchJson } from "../http/fetch-json.js";
import type { HttpRequest } from "../http/types.js";
import type { RepoRef } from "../repo-url.js";
import { fail, isRecord, ok, type Outcome, type SourceContext } from "./outcome.js";

export interface GithubEvidence {
  repoArchived: Outcome<boolean>;
  /** Latest commit date, as the original ISO string. */
  lastCommit: Outcome<string>;
  warnings: string[];
}

export const repoPageUrl = (ref: RepoRef): string => `https://github.com/${ref.owner}/${ref.repo}`;

const TOKEN_REJECTED = "GitHub token rejected (HTTP 401); retried without authentication";

function commitDate(json: unknown): string | undefined {
  if (!Array.isArray(json) || json.length === 0) return undefined;
  const commit: unknown = isRecord(json[0]) ? json[0]["commit"] : undefined;
  if (!isRecord(commit)) return undefined;
  for (const who of ["committer", "author"]) {
    const person = commit[who];
    const date = isRecord(person) ? person["date"] : undefined;
    if (typeof date === "string" && parseIsoTimestamp(date) !== undefined) return date;
  }
  return undefined;
}

/** Metadata failure yields a failed outcome (both signals unknown); a commit failure keeps `repoArchived`. */
export async function fetchGithub(ctx: SourceContext, ref: RepoRef): Promise<Outcome<GithubEvidence>> {
  try {
    const warnings: string[] = [];
    let useToken = ctx.config.githubToken !== undefined && ctx.config.githubToken !== "";

    const get = async (url: string) => {
      const build = (withToken: boolean): HttpRequest => ({
        method: "GET",
        url,
        headers: {
          accept: "application/vnd.github+json",
          ...(withToken ? { authorization: `Bearer ${ctx.config.githubToken}` } : {}),
        },
        timeoutMs: ctx.config.requestTimeoutMs,
      });
      let res = await fetchJson(ctx.cache, "github", build(useToken));
      if (!res.ok && res.status === 401 && useToken) {
        useToken = false;
        if (!warnings.includes(TOKEN_REJECTED)) warnings.push(TOKEN_REJECTED);
        res = await fetchJson(ctx.cache, "github", build(false));
      }
      return res;
    };

    const base = `https://api.github.com/repos/${ref.owner}/${ref.repo}`;
    const meta = await get(base);
    if (!meta.ok) return fail("github", meta.category);
    if (!isRecord(meta.json)) return fail("github", "malformed_response");

    const archived = meta.json["archived"];
    const branch = meta.json["default_branch"];
    const repoArchived: Outcome<boolean> =
      typeof archived === "boolean" ? ok(archived) : fail("github", "malformed_response");

    let lastCommit: Outcome<string>;
    if (typeof branch !== "string" || branch === "") {
      lastCommit = fail("github", "malformed_response");
    } else {
      const commits = await get(`${base}/commits?per_page=1&sha=${encodeURIComponent(branch)}`);
      if (!commits.ok) lastCommit = fail("github", commits.category);
      else {
        const date = commitDate(commits.json);
        lastCommit = date !== undefined ? ok(date) : fail("github", "malformed_response");
      }
    }
    return ok({ repoArchived, lastCommit, warnings });
  } catch {
    return fail("github", "network_error");
  }
}
