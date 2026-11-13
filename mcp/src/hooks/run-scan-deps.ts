import type { ExorcistDeps } from "../deps.js";
import { obtainScanReport } from "../scan-source.js";
import { deadNames, newDeadPackages } from "./new-dead.js";
import type { RunnerResult } from "./run-types.js";

export const BASELINE_REL = ".cache/hooks/dead-baseline.json";

export interface ScanDepsDeps {
  /** The same Deps `scan_repo` uses; the scan is a Local_Path scan of `root`. */
  tools: ExorcistDeps;
  /** Repository root. */
  root: string;
  readText(path: string): Promise<string | undefined>;
  writeText(path: string, text: string): Promise<void>;
}

/** An absent, unreadable or invalid baseline is the empty set. */
export function parseBaseline(text: string | undefined): string[] {
  if (text === undefined) return [];
  try {
    const v: unknown = JSON.parse(text);
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : [];
  } catch {
    return [];
  }
}

/** Scans the repository root and warns about packages that are dead now and were not in the baseline; never throws. */
export async function runScanDeps(deps: ScanDepsDeps): Promise<RunnerResult> {
  try {
    const path = `${deps.root.replace(/\/+$/, "")}/${BASELINE_REL}`;
    let baseline: string[] = [];
    try {
      baseline = parseBaseline(await deps.readText(path));
    } catch {
      baseline = [];
    }
    const scanned = await obtainScanReport(deps.tools, { repo: deps.root });
    if (!scanned.ok) return { lines: [`scan failed: ${scanned.code}`], outcome: "fail" };
    const report = scanned.report;
    const fresh = newDeadPackages(baseline, report);
    const score = new Map(report.dependencies.map((d) => [d.name, d.death.score] as const));
    const lines = fresh.length === 0 ? ["no new dead packages"] : fresh.map((n) => `WARNING: new dead package: ${n} (score ${score.get(n)})`);
    try {
      await deps.writeText(path, `${JSON.stringify(deadNames(report), null, 2)}\n`);
    } catch {
      /* best effort */
    }
    return { lines, outcome: fresh.length === 0 ? "ok" : "warn" };
  } catch {
    return { lines: ["scan failed: internal_error"], outcome: "fail" };
  }
}
