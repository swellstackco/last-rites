import type { RepoTarget, ScanReport, ScanSummary, ScannedDependency, SkippedEntry } from "./types.js";

export interface AssembleInput {
  target: RepoTarget;
  scannedAt: string;
  /** Any order. */
  scanned: readonly ScannedDependency[];
  skipped: readonly SkippedEntry[];
  warnings: readonly string[];
}

export type AssembleReport = (input: AssembleInput) => ScanReport;

/** Score descending, then name ascending in UTF-16 code-unit order. A total order for distinct names. */
export function compareScanned(a: ScannedDependency, b: ScannedDependency): number {
  return b.death.score - a.death.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

/** Pure. Output does not depend on the order of `scanned`. */
export const assembleReport: AssembleReport = (input) => {
  const dependencies = [...input.scanned].sort(compareScanned);
  const summary: ScanSummary = {
    total: dependencies.length,
    skipped: input.skipped.length,
    alive: 0,
    ailing: 0,
    dying: 0,
    dead: 0,
  };
  for (const d of dependencies) summary[d.death.grade] += 1;
  return {
    repo: `${input.target.owner}/${input.target.repo}`,
    ref: input.target.ref,
    scannedAt: input.scannedAt,
    dependencies,
    skipped: [...input.skipped],
    warnings: [...input.warnings],
    summary,
  };
};
