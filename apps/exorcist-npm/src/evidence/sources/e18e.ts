/**
 * e18e module-replacements source (Requirements 6.1-6.6). Three manifests, fetched in fixed order;
 * the first manifest in that order that has the package wins.
 */
import { fetchJson } from "../http/fetch-json.js";
import type { ReplacementInfo } from "../types.js";
import { fail, isRecord, ok, type Failure, type Outcome, type SourceContext } from "./outcome.js";

export const E18E_MANIFESTS = ["native", "micro-utilities", "preferred"] as const;
export const e18eManifestUrl = (file: string): string =>
  `https://raw.githubusercontent.com/e18e/module-replacements/main/manifests/${file}.json`;
/** Source URL when no manifest matches (no single file is accurate). */
export const E18E_DIRECTORY_URL = "https://github.com/e18e/module-replacements/tree/main/manifests";

export interface E18eEvidence {
  known: boolean;
  replacement?: ReplacementInfo;
  sourceUrl: string;
}

export async function fetchE18e(ctx: SourceContext, name: string): Promise<Outcome<E18eEvidence>> {
  try {
    let firstFailure: Failure | undefined;
    for (const file of E18E_MANIFESTS) {
      const url = e18eManifestUrl(file);
      const res = await fetchJson(ctx.cache, "e18e", { method: "GET", url, timeoutMs: ctx.config.requestTimeoutMs });
      const mappings: unknown = res.ok && isRecord(res.json) ? res.json["mappings"] : undefined;
      if (!isRecord(mappings)) {
        firstFailure ??= { source: "e18e", category: res.ok ? "malformed_response" : res.category };
        continue;
      }
      if (!Object.hasOwn(mappings, name)) continue;

      const entry = mappings[name];
      const type = isRecord(entry) ? entry["type"] : undefined;
      if (typeof type !== "string" || type === "") return fail("e18e", "malformed_response");
      const list = isRecord(entry) && Array.isArray(entry["replacements"]) ? entry["replacements"] : [];
      const replacements = list.filter((r): r is string => typeof r === "string");
      const first = replacements[0];
      return ok({
        known: true,
        replacement: { type, ...(first !== undefined ? { replacement: first } : {}), replacements },
        sourceUrl: url,
      });
    }
    // No match: absence is only evidence when every manifest was retrieved.
    return firstFailure ? { ok: false, reason: firstFailure } : ok({ known: false, sourceUrl: E18E_DIRECTORY_URL });
  } catch {
    return fail("e18e", "network_error");
  }
}
