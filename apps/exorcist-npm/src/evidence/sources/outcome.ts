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
