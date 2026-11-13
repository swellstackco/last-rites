import { serializeReport } from "@graveyard-kit/exorcist-npm/programmatic";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ExorcistDeps } from "../deps.js";
import { errorResult, textResult } from "../result.js";
import { obtainScanReport } from "../scan-source.js";

export const SCAN_REPO_NAME = "scan_repo";
export const SCAN_REPO_TITLE = "Scan a repository for dead dependencies";
export const SCAN_REPO_DESCRIPTION =
  "Scan a repository's package.json and package-lock.json and return the Last Rites scan report as JSON " +
  "(one death score with its parts and source links per dependency). `repo` is a demo name (jest, prettier, parse-server, pump; " +
  "served from a cached snapshot, no network), an owner/name on GitHub (makes network requests), or a local directory path " +
  "starting with /, ./ or ../ (reads the checkout, makes network requests for evidence). `ref` is only allowed with owner/name.";

export const SCAN_REPO_SHAPE = {
  repo: z.string().describe("Demo name, owner/name, or a local path starting with /, ./ or ../"),
  ref: z.string().optional().describe("Branch, tag or commit; only for owner/name"),
};

export const SCAN_REPO_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, openWorldHint: true } as const;

export interface ScanRepoArgs {
  repo: unknown;
  ref?: unknown;
}

/** Guard, one call into the scan source, canonical output (Requirement 4). */
export async function scanRepoImpl(deps: ExorcistDeps, args: ScanRepoArgs): Promise<CallToolResult> {
  const r = await obtainScanReport(deps, args as { repo: string; ref?: string });
  if (!r.ok) return errorResult(r.code, r.message);
  return textResult(serializeReport(r.report));
}
