import type { FailureCategory, Source } from "../types.js";
import type { CacheLayer } from "./cache.js";
import type { HttpRequest, HttpResponse } from "./types.js";

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

export type FetchJsonResult =
  | { ok: true; json: unknown; fromCache: boolean }
  | { ok: false; category: FailureCategory; /** HTTP status when the failure was an HTTP response. */ status?: number };

/** One cached request, classified: transport/HTTP failures and non-JSON 2xx bodies become categories. Never throws. */
export async function fetchJson(cache: CacheLayer, source: Source, req: HttpRequest): Promise<FetchJsonResult> {
  let result: Awaited<ReturnType<CacheLayer["get"]>>;
  try {
    result = await cache.get(source, req);
  } catch {
    return { ok: false, category: "network_error" };
  }
  if (!result.ok) {
    return result.failure.kind === "transport"
      ? { ok: false, category: result.failure.category }
      : { ok: false, category: classifyStatus(result.failure.response), status: result.failure.response.status };
  }
  const parsed = parseJsonBody(result.response.body);
  return parsed.ok
    ? { ok: true, json: parsed.value, fromCache: result.fromCache }
    : { ok: false, category: "malformed_response" };
}
