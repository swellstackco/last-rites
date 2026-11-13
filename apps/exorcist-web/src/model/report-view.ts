import type { GradeBand } from "@graveyard-kit/skeleton";
import { buildGraveyard } from "@graveyard-kit/skeleton/graveyard";
import type { GraveyardView } from "@graveyard-kit/skeleton/graveyard";
import type { ScanReport, ScannedDependency, SkippedEntry } from "@graveyard-kit/exorcist-npm/report";

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
}

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
  return {
    repo: report.repo,
    refLabel: report.ref === "HEAD" ? "default branch (HEAD)" : report.ref,
    scannedAtLabel: formatScannedAt(report.scannedAt),
    sourceLabel: source === "demo" ? "Snapshot" : "Live scan",
    counts,
    total: graveyard.total,
    skipped: report.skipped.length,
    warnings: [...report.warnings],
    rangesOnly: report.dependencies.length > 0 && report.dependencies.every((d) => d.versionSource === "range"),
    summaryDisagrees,
  };
}

export function buildReportView(report: ScanReport, source: "demo" | "live"): ReportView {
  const graveyard = buildGraveyard(report.dependencies);
  return { header: buildSummaryHeader(report, graveyard, source), graveyard, skipped: report.skipped };
}
