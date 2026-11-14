import { parseReport, serializeReport } from "@last-rites/exorcist-npm/report";
import type { ScanReport } from "@last-rites/exorcist-npm/report";

/**
 * Pure. Keeps the named dependencies (in their original order), recomputes `summary`
 * from what is kept, and keeps `warnings` and `skipped` unchanged.
 */
export function trimReport(report: ScanReport, keep: readonly string[]): ScanReport {
  const wanted = new Set(keep);
  const dependencies = report.dependencies.filter((d) => wanted.has(d.name));
  const summary = { total: dependencies.length, skipped: report.skipped.length, alive: 0, ailing: 0, dying: 0, dead: 0 };
  for (const d of dependencies) summary[d.death.grade] += 1;
  return { ...report, dependencies, skipped: report.skipped, warnings: report.warnings, summary };
}

/** Text in, canonical text out. Throws if the input is not a valid report. */
export function trimReportText(text: string, keep: readonly string[]): string {
  const parsed = parseReport(text);
  if (!parsed.ok) throw new Error(`cannot trim: ${parsed.error.category}: ${parsed.error.message}`);
  return serializeReport(trimReport(parsed.report, keep));
}
