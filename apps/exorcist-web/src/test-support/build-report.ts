import { scoreDeath, toGrade } from "@last-rites/skeleton";
import type { GradeBand, PackageSignals, SignalName, WeightConfig } from "@last-rites/skeleton";
import type { ScanReport, ScannedDependency } from "@last-rites/exorcist-npm/report";

export interface FixtureDependency {
  name: string;
  signals: PackageSignals;
  config?: WeightConfig;
  unknownReasons?: ScannedDependency["unknownReasons"];
  versionSource?: "lockfile" | "range";
}

export interface BuildReportOptions {
  repo?: string;
  ref?: string;
  scannedAt?: string;
  warnings?: string[];
  skipped?: ScanReport["skipped"];
}

/** Builds a ScanReport with the real scoreDeath and a correct summary. */
export function buildReport(deps: readonly FixtureDependency[], options: BuildReportOptions = {}): ScanReport {
  const dependencies: ScannedDependency[] = deps.map((d) => {
    const source = d.versionSource ?? "lockfile";
    const dep: ScannedDependency = {
      name: d.name,
      kinds: ["dependencies"],
      declaredRange: "^1.0.0",
      versionSource: source,
      signals: d.signals,
      unknownReasons: d.unknownReasons ?? {},
      evidenceWarnings: [],
      death: d.config ? scoreDeath(d.signals, d.config) : scoreDeath(d.signals),
    };
    if (source === "lockfile") dep.resolvedVersion = "1.0.0";
    return dep;
  });
  const skipped = options.skipped ?? [];
  const summary = { total: dependencies.length, skipped: skipped.length, alive: 0, ailing: 0, dying: 0, dead: 0 };
  for (const d of dependencies) summary[d.death.grade] += 1;
  return {
    repo: options.repo ?? "owner/repo",
    ref: options.ref ?? "HEAD",
    scannedAt: options.scannedAt ?? "2026-11-13T04:09:00.000Z",
    dependencies,
    skipped: [...skipped],
    warnings: options.warnings ?? [],
    summary,
  };
}

function mapDep(report: ScanReport, name: string, f: (d: ScannedDependency) => ScannedDependency): ScanReport {
  return { ...report, dependencies: report.dependencies.map((d) => (d.name === name ? f(d) : d)) };
}

/** Replaces the sourceUrl of every part of the named dependency's given signal. */
export function tamperUrl(report: ScanReport, name: string, signal: SignalName, url: string): ScanReport {
  return mapDep(report, name, (d) => ({
    ...d,
    death: { ...d.death, parts: d.death.parts.map((p) => (p.signal === signal ? { ...p, sourceUrl: url } : p)) },
  }));
}

/** Changes the displayed score so it no longer equals the sum of the parts (grade follows the new score). */
export function tamperSum(report: ScanReport, name: string, delta: number): ScanReport {
  return mapDep(report, name, (d) => {
    const score = Math.max(0, Math.min(100, d.death.score + delta));
    return { ...d, death: { ...d.death, score, grade: toGrade(score) } };
  });
}

/** Sets a grade that disagrees with the score. */
export function tamperGrade(report: ScanReport, name: string, grade: GradeBand): ScanReport {
  return mapDep(report, name, (d) => ({ ...d, death: { ...d.death, grade } }));
}

/** Changes the report summary so it disagrees with the dependencies. */
export function tamperSummary(report: ScanReport, patch: Partial<ScanReport["summary"]>): ScanReport {
  return { ...report, summary: { ...report.summary, ...patch } };
}
