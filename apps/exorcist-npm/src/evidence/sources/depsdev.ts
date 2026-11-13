/**
 * deps.dev gap filler (Requirements 7.1-7.7). Off by default. Fills only `deprecated` and
 * `monthsSinceLastPublish`, only when they are unknown. Field names confirmed against
 * __fixtures__/shared/depsdev-picocolors.json: versions[].versionKey.version, publishedAt,
 * isDefault, isDeprecated.
 *
 * "No retry" (7.6): the stage must give this source a cache over a ResilientClient with
 * maxRetries 0; this module itself issues exactly one request.
 */
import { parseIsoTimestamp } from "../months-since.js";
import { fetchJson } from "../http/fetch-json.js";
import { fail, isRecord, ok, type Outcome, type SourceContext } from "./outcome.js";

export interface DepsDevNeeds {
  deprecated: boolean;
  monthsSinceLastPublish: boolean;
}

export interface DepsDevEvidence {
  deprecated?: boolean;
  /** Latest `publishedAt`, as the original ISO string. */
  lastPublish?: string;
}

export const depsDevApiUrl = (name: string): string =>
  `https://api.deps.dev/v3/systems/npm/packages/${encodeURIComponent(name)}`;
export const depsDevPageUrl = (name: string): string => `https://deps.dev/npm/${name}`;

/**
 * Zero requests when disabled or when neither fillable signal is unknown. Otherwise one GET.
 * A response lacking a needed field simply omits it from the evidence (stays unknown).
 */
export async function fetchDepsDev(
  ctx: SourceContext,
  name: string,
  needs: DepsDevNeeds,
  resolvedVersion?: string,
): Promise<Outcome<DepsDevEvidence>> {
  if (!ctx.config.depsdev.enabled || (!needs.deprecated && !needs.monthsSinceLastPublish)) return ok({});
  try {
    const res = await fetchJson(ctx.cache, "depsdev", {
      method: "GET",
      url: depsDevApiUrl(name),
      timeoutMs: ctx.config.requestTimeoutMs,
    });
    if (!res.ok) return fail("depsdev", res.category);
    if (!isRecord(res.json) || !Array.isArray(res.json["versions"])) return fail("depsdev", "malformed_response");

    const versions = res.json["versions"].filter(isRecord);
    const out: DepsDevEvidence = {};

    if (needs.deprecated) {
      const keyOf = (v: Record<string, unknown>): unknown => {
        const k = v["versionKey"];
        return isRecord(k) ? k["version"] : undefined;
      };
      const target =
        (resolvedVersion !== undefined ? versions.find((v) => keyOf(v) === resolvedVersion) : undefined) ??
        versions.find((v) => v["isDefault"] === true);
      if (target && typeof target["isDeprecated"] === "boolean") out.deprecated = target["isDeprecated"];
    }

    if (needs.monthsSinceLastPublish) {
      let best: { raw: string; ms: number } | undefined;
      for (const v of versions) {
        const raw = v["publishedAt"];
        const d = parseIsoTimestamp(raw);
        if (d !== undefined && (best === undefined || d.getTime() > best.ms)) best = { raw: raw as string, ms: d.getTime() };
      }
      if (best) out.lastPublish = best.raw;
    }
    return ok(out);
  } catch {
    return fail("depsdev", "network_error");
  }
}
