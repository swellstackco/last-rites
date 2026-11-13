import type { FailureCategory } from "../types.js";
import type { HttpResponse } from "./types.js";

/** Failure classification table (design: "Failure classification"). */

/** Category for a non-2xx response. */
export function classifyStatus(res: HttpResponse): FailureCategory {
  if (res.status === 404 || res.status === 410) return "not_found";
  if (res.status === 429) return "rate_limited";
  if (res.status === 403 && res.headers["x-ratelimit-remaining"] === "0") return "rate_limited";
  return "network_error";
}

export type JsonParse = { ok: true; value: unknown } | { ok: false };

/** A 2xx body that is not JSON is `malformed_response` (caller maps `ok: false`). */
export function parseJsonBody(body: string): JsonParse {
  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return { ok: false };
  }
}
