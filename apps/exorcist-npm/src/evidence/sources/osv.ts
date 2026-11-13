/**
 * OSV.dev source (Requirements 5.1-5.8). Follows `next_page_token` for up to OSV_MAX_PAGES pages.
 * The caller must not call this without a Resolved_Version.
 */
import { OSV_MAX_PAGES } from "../config.js";
import { fetchJson } from "../http/fetch-json.js";
import { countOpenVulnsNoFix, type OsvVuln } from "../osv-count.js";
import { fail, isRecord, ok, urlName, type Outcome, type SourceContext } from "./outcome.js";

export const OSV_QUERY_URL = "https://api.osv.dev/v1/query";
export const osvListUrl = (name: string): string => `https://osv.dev/list?q=${urlName(name)}`;

/** Key order matters for exact-match fixtures: package{name,ecosystem}, version, page_token. */
export function osvRequestBody(name: string, version: string, pageToken?: string): string {
  return JSON.stringify({
    package: { name, ecosystem: "npm" },
    version,
    ...(pageToken !== undefined ? { page_token: pageToken } : {}),
  });
}

export async function fetchOsv(ctx: SourceContext, name: string, version: string): Promise<Outcome<number>> {
  try {
    const vulns: OsvVuln[] = [];
    let token: string | undefined;
    for (let page = 1; page <= OSV_MAX_PAGES; page++) {
      const res = await fetchJson(ctx.cache, "osv", {
        method: "POST",
        url: OSV_QUERY_URL,
        body: osvRequestBody(name, version, token),
        headers: { "content-type": "application/json" },
        timeoutMs: ctx.config.requestTimeoutMs,
      });
      if (!res.ok) return fail("osv", res.category);
      if (!isRecord(res.json)) return fail("osv", "malformed_response");
      const batch = res.json["vulns"];
      if (batch !== undefined) {
        if (!Array.isArray(batch)) return fail("osv", "malformed_response");
        for (const v of batch) if (isRecord(v)) vulns.push(v as unknown as OsvVuln);
      }
      const next = res.json["next_page_token"];
      token = typeof next === "string" && next !== "" ? next : undefined;
      if (token === undefined) return ok(countOpenVulnsNoFix(vulns, name));
    }
    return fail("osv", "incomplete");
  } catch {
    return fail("osv", "network_error");
  }
}
