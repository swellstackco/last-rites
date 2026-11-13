import type { EvidenceConfig } from "../config.js";
import type { CacheLayer } from "../http/cache.js";
import type { Source, UnknownReason } from "../types.js";

/** A failed source step: source and category only. The message is built later from these and a public URL. */
export type Failure = Omit<UnknownReason, "message">;

/** Sources return outcomes and never throw. */
export type Outcome<T> = { ok: true; value: T } | { ok: false; reason: Failure };

export interface SourceContext {
  cache: CacheLayer;
  config: EvidenceConfig;
}

export const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
export const fail = (source: Source, category: Failure["category"]): Outcome<never> => ({
  ok: false,
  reason: { source, category },
});

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * A package name as it appears in a user-facing source URL (Requirements 2.4, 5.5, 7.4): the name itself,
 * so `@scope/pkg` stays readable. Only characters that would break the URL are percent-encoded; every valid
 * npm name is returned unchanged. Request URLs (what is fetched) keep full `encodeURIComponent`.
 */
export function urlName(name: string): string {
  return encodeURIComponent(name).replace(/%40/g, "@").replace(/%2F/gi, "/");
}
