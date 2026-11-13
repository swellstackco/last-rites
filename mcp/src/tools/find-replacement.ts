import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ExorcistDeps } from "../deps.js";
import { checkPackage } from "../guards.js";
import { errorResult, textResult } from "../result.js";

export const FIND_REPLACEMENT_NAME = "find_replacement";
export const FIND_REPLACEMENT_TITLE = "Find a known replacement";
export const FIND_REPLACEMENT_DESCRIPTION =
  "Look up one npm package in the e18e module-replacements lists (makes network requests, cached on disk). " +
  "Returns the replacement entry and its source URL, or \"none\" when every list was retrieved and none matches. " +
  "If a list could not be retrieved the result is an evidence_unavailable error, never \"none\".";

export const FIND_REPLACEMENT_SHAPE = {
  package: z.string().describe("npm package name"),
};

export const FIND_REPLACEMENT_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, openWorldHint: true } as const;

export interface FindReplacementArgs {
  package: unknown;
}

export async function findReplacementImpl(deps: ExorcistDeps, args: FindReplacementArgs): Promise<CallToolResult> {
  const pkg = checkPackage(args.package);
  if (!pkg.ok) return errorResult(pkg.code, pkg.message);
  const outcome = await deps.e18e(pkg.name);
  if (!outcome.ok) {
    return errorResult("evidence_unavailable", `the e18e replacement lists could not be retrieved (${outcome.reason.category})`);
  }
  const ev = outcome.value;
  const replacement = ev.known && ev.replacement !== undefined ? ev.replacement : "none";
  return textResult(JSON.stringify({ package: pkg.name, replacement, sourceUrl: ev.sourceUrl }));
}
