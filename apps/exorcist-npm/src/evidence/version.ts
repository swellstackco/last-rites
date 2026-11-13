/**
 * resolveVersion (Requirements 1.3-1.5, 2.8): picks the Resolved_Version from an
 * npm registry document. Pure.
 */
import semver from "semver";

export type ResolvedVersion =
  | { kind: "resolved"; version: string }
  | { kind: "none" }
  | { kind: "no_match" };

export interface NpmDocLike {
  "dist-tags"?: unknown;
  versions?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function resolveVersion(doc: NpmDocLike, range?: string): ResolvedVersion {
  const versions = isRecord(doc.versions) ? doc.versions : {};
  const tags = isRecord(doc["dist-tags"]) ? doc["dist-tags"] : {};
  const hasVersion = (v: unknown): v is string => typeof v === "string" && Object.hasOwn(versions, v);
  const trimmed = range?.trim() ?? "";

  if (trimmed === "") {
    const latest = Object.hasOwn(tags, "latest") ? tags["latest"] : undefined;
    return hasVersion(latest) ? { kind: "resolved", version: latest } : { kind: "none" };
  }

  if (semver.validRange(trimmed) !== null) {
    const best = semver.maxSatisfying(Object.keys(versions), trimmed);
    return best !== null ? { kind: "resolved", version: best } : { kind: "no_match" };
  }

  if (Object.hasOwn(tags, trimmed)) {
    const tagged = tags[trimmed];
    if (hasVersion(tagged)) return { kind: "resolved", version: tagged };
  }
  return { kind: "no_match" };
}
