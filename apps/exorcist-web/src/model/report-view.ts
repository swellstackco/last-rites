import type { GradeBand } from "@last-rites/skeleton";
import type { Ecosystem } from "@last-rites/skeleton/proof";
import { buildGraveyard } from "@last-rites/skeleton/graveyard";
import type { GraveyardView } from "@last-rites/skeleton/graveyard";
import type { ScanReport, ScannedDependency, SkippedEntry } from "@last-rites/exorcist-npm/report";

export interface SummaryHeader {
  repo: string;
  refLabel: string;
  scannedAtLabel: string;
  sourceLabel: "Snapshot" | "Live scan";
  /** Copied from GraveyardView.counts. */
  counts: Record<GradeBand, number>;
  total: number;
  skipped: number;
  /** Verbatim, same order. */
  warnings: readonly string[];
  /** dependencies.length > 0 and every versionSource is "range". */
  rangesOnly: boolean;
  /** report.summary differs from the computed counts or total. */
  summaryDisagrees: boolean;
  ecosystem: Ecosystem;
  /** The Lockfile_Note for this ecosystem; present only when `rangesOnly`. */
  lockfileNote?: string;
}

export const NPM_RANGES_NOTE =
  "Versions come from declared ranges because no package-lock.json was read. Yarn and pnpm lockfiles are not read in v1.";
export const ACTIONS_RANGES_NOTE = "Refs come from workflow uses: lines.";

export interface ReportView {
  header: SummaryHeader;
  graveyard: GraveyardView<ScannedDependency>;
  skipped: readonly SkippedEntry[];
}

const ISO = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/;

/** "2026-11-13 04:09 UTC", or the input unchanged when it is not canonical ISO. No Date, no locale. */
export function formatScannedAt(iso: string): string {
  const m = ISO.exec(iso);
  if (!m) return iso;
  return `${m[1]} ${m[2]}:${m[3]} UTC`;
}

export function buildSummaryHeader(
  report: ScanReport,
  graveyard: GraveyardView<ScannedDependency>,
  source: "demo" | "live",
): SummaryHeader {
  const counts = { ...graveyard.counts };
  const s = report.summary;
  const summaryDisagrees =
    s.total !== graveyard.total ||
    s.alive !== counts.alive ||
    s.ailing !== counts.ailing ||
    s.dying !== counts.dying ||
    s.dead !== counts.dead;
  const ecosystem: Ecosystem = report.ecosystem ?? "npm";
  const rangesOnly = report.dependencies.length > 0 && report.dependencies.every((d) => d.versionSource === "range");
  return {
    repo: report.repo,
    refLabel: report.ref === "HEAD" ? "default branch (HEAD)" : report.ref,
    scannedAtLabel: formatScannedAt(report.scannedAt),
    sourceLabel: source === "demo" ? "Snapshot" : "Live scan",
    counts,
    total: graveyard.total,
    skipped: report.skipped.length,
    warnings: [...report.warnings],
    rangesOnly,
    summaryDisagrees,
    ecosystem,
    ...(rangesOnly ? { lockfileNote: ecosystem === "github-actions" ? ACTIONS_RANGES_NOTE : NPM_RANGES_NOTE } : {}),
  };
}

export function buildReportView(report: ScanReport, source: "demo" | "live"): ReportView {
  const graveyard = buildGraveyard(report.dependencies);
  return { header: buildSummaryHeader(report, graveyard, source), graveyard, skipped: report.skipped };
}
