import type { ScanReport } from "@graveyard-kit/exorcist-npm/programmatic";

/** Sorted by UTF-16 code unit (the default string order), no duplicates. */
const sortedUnique = (names: Iterable<string>): string[] => [...new Set(names)].sort();

/** Names graded `dead` in the report, sorted, without duplicates. `dying` is never included. */
export function deadNames(report: Pick<ScanReport, "dependencies">): string[] {
  return sortedUnique(report.dependencies.filter((d) => d.death.grade === "dead").map((d) => d.name));
}

/** Dead names that are not in the baseline (exact, case-sensitive compare), sorted, without duplicates. */
export function newDeadPackages(baseline: readonly string[], report: Pick<ScanReport, "dependencies">): string[] {
  const known = new Set(baseline);
  return deadNames(report).filter((n) => !known.has(n));
}
