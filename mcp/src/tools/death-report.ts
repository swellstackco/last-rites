import { assembleReport, serializeReport } from "@graveyard-kit/exorcist-npm/programmatic";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ExorcistDeps } from "../deps.js";
import { checkPackage } from "../guards.js";
import { errorResult, textResult } from "../result.js";
import { obtainScanReport } from "../scan-source.js";

export const DEATH_REPORT_NAME = "death_report";
export const DEATH_REPORT_TITLE = "Death report for one package";
export const DEATH_REPORT_DESCRIPTION =
  "Scan a repository like scan_repo and return the scan report for one dependency only: its death score, every part of the score, " +
  "the signals, the known replacement and the source links. Same `repo` and `ref` rules as scan_repo (network requests unless a demo name).";

export const DEATH_REPORT_SHAPE = {
  repo: z.string().describe("Demo name, owner/name, or a local path starting with /, ./ or ../"),
  package: z.string().describe("npm package name, as it appears in the scan"),
  ref: z.string().optional().describe("Branch, tag or commit; only for owner/name"),
};

export const DEATH_REPORT_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, openWorldHint: true } as const;

export interface DeathReportArgs {
  repo: unknown;
  package: unknown;
  ref?: unknown;
}

export async function deathReportImpl(deps: ExorcistDeps, args: DeathReportArgs): Promise<CallToolResult> {
  const pkg = checkPackage(args.package);
  if (!pkg.ok) return errorResult(pkg.code, pkg.message);
  const r = await obtainScanReport(deps, { repo: args.repo as string, ...(args.ref === undefined ? {} : { ref: args.ref as string }) });
  if (!r.ok) return errorResult(r.code, r.message);
  const { report } = r;
  const dep = report.dependencies.find((d) => d.name === pkg.name);
  if (dep === undefined) {
    const skipped = report.skipped.find((s) => s.name === pkg.name);
    if (skipped !== undefined) {
      return errorResult("package_skipped", `${pkg.name} was skipped by the scan: ${skipped.reason} (${skipped.kind}: ${skipped.specifier})`);
    }
    return errorResult("package_not_found", `${pkg.name} is not a dependency in this scan`);
  }
  // assembleReport rebuilds `repo` as `${owner}/${repo}`; the codec accepts any string there, so keep the original.
  const slash = report.repo.indexOf("/");
  const target = { owner: report.repo.slice(0, Math.max(slash, 0)), repo: report.repo.slice(slash + 1), ref: report.ref };
  const one = assembleReport({ target, scannedAt: report.scannedAt, scanned: [dep], skipped: [], warnings: report.warnings });
  return textResult(serializeReport({ ...one, repo: report.repo }));
}
