/**
 * npm registry source (Requirements 1.5, 1.7, 2.1-2.8, 9.1, 9.7). Each field is parsed
 * independently so one missing field costs only its own signal.
 */
import { parseIsoTimestamp } from "../months-since.js";
import { fetchJson } from "../http/fetch-json.js";
import { resolveVersion, type ResolvedVersion } from "../version.js";
import { fail, isRecord, ok, type Outcome, type SourceContext } from "./outcome.js";

export interface NpmEvidence {
  resolution: ResolvedVersion;
  /** Resolved_Version deprecation flag. */
  deprecated: Outcome<boolean>;
  /** Latest valid `time` entry, as the original ISO string. */
  lastPublish: Outcome<string>;
  maintainerCount: Outcome<number>;
  /** Raw `repository` field for `parseRepoUrl` (undefined when absent). */
  repository: unknown;
}

export const npmDocUrl = (name: string): string => `https://registry.npmjs.org/${encodeURIComponent(name)}`;

function latestPublish(time: unknown): Outcome<string> {
  if (!isRecord(time)) return fail("npm", "malformed_response");
  let best: { raw: string; ms: number } | undefined;
  for (const [key, raw] of Object.entries(time)) {
    if (key === "created" || key === "modified") continue;
    const d = parseIsoTimestamp(raw);
    if (d === undefined) continue;
    if (best === undefined || d.getTime() > best.ms) best = { raw: raw as string, ms: d.getTime() };
  }
  return best ? ok(best.raw) : fail("npm", "malformed_response");
}

function deprecatedFlag(doc: Record<string, unknown>, resolution: ResolvedVersion): Outcome<boolean> {
  if (resolution.kind !== "resolved") return fail("npm", "malformed_response");
  const versions = doc["versions"];
  const entry = isRecord(versions) && Object.hasOwn(versions, resolution.version) ? versions[resolution.version] : undefined;
  if (!isRecord(entry)) return fail("npm", "malformed_response");
  const msg = entry["deprecated"];
  return ok(typeof msg === "string" && msg.trim() !== "");
}

/** `GET https://registry.npmjs.org/<encoded name>` through the cache. 404 is `not_found`. */
export async function fetchNpm(ctx: SourceContext, name: string, versionRange?: string): Promise<Outcome<NpmEvidence>> {
  try {
    const res = await fetchJson(ctx.cache, "npm", {
      method: "GET",
      url: npmDocUrl(name),
      timeoutMs: ctx.config.requestTimeoutMs,
    });
    if (!res.ok) return fail("npm", res.category);
    const doc = res.json;
    if (!isRecord(doc)) return fail("npm", "malformed_response");

    const resolution = resolveVersion(doc, versionRange);
    const maintainers = doc["maintainers"];
    return ok({
      resolution,
      deprecated: deprecatedFlag(doc, resolution),
      lastPublish: latestPublish(doc["time"]),
      maintainerCount: Array.isArray(maintainers) ? ok(maintainers.length) : fail("npm", "malformed_response"),
      repository: doc["repository"],
    });
  } catch {
    return fail("npm", "network_error");
  }
}
