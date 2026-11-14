import { describe, it, expect } from "vitest";
import { scoreDeath } from "@last-rites/skeleton";
import type { GradeBand } from "@last-rites/skeleton";
import { assembleReport, compareScanned } from "./assemble.js";
import { evidenceFor } from "./test-support/gated-evidence.js";
import type { RepoTarget, ScannedDependency, SkippedEntry } from "./types.js";

const target: RepoTarget = { owner: "o", repo: "r", ref: "main" };

function dep(name: string, profile: number): ScannedDependency {
  const ev = evidenceFor(profile, name);
  return {
    name,
    kinds: ["dependencies"],
    declaredRange: "^1.0.0",
    versionSource: "range",
    signals: ev.signals,
    unknownReasons: ev.unknownReasons,
    evidenceWarnings: ev.warnings,
    death: scoreDeath(ev.signals),
  };
}

const input = (scanned: ScannedDependency[], skipped: SkippedEntry[] = [], warnings: string[] = []) => ({
  target,
  scannedAt: "2026-01-01T00:00:00.000Z",
  scanned,
  skipped,
  warnings,
});

describe("assembleReport", () => {
  it("breaks score ties by name ascending", () => {
    const a = dep("b", 4);
    const b = dep("a", 5);
    expect(a.death.score).toBe(b.death.score);
    expect(assembleReport(input([a, b])).dependencies.map((d) => d.name)).toEqual(["a", "b"]);
  });

  it("sorts higher scores first", () => {
    const report = assembleReport(input([dep("healthy", 0), dep("dead", 2)]));
    expect(report.dependencies[0]?.name).toBe("dead");
  });

  it("orders mixed-case names in code-unit order", () => {
    const report = assembleReport(input([dep("b", 4), dep("B", 4), dep("a", 4), dep("Z", 4)]));
    expect(report.dependencies.map((d) => d.name)).toEqual(["B", "Z", "a", "b"]);
    expect(compareScanned(dep("B", 4), dep("a", 4))).toBeLessThan(0);
  });

  it("counts every grade", () => {
    const deps = [0, 1, 2, 3, 4, 5].map((p, i) => dep(`p${i}`, p));
    const report = assembleReport(input(deps));
    const counts: Record<GradeBand, number> = { alive: 0, ailing: 0, dying: 0, dead: 0 };
    for (const d of deps) counts[d.death.grade] += 1;
    expect(report.summary).toEqual({ total: 6, skipped: 0, ...counts });
    expect(report.summary.alive + report.summary.ailing + report.summary.dying + report.summary.dead).toBe(6);
  });

  it("handles empty input", () => {
    const report = assembleReport(input([]));
    expect(report).toEqual({
      repo: "o/r",
      ref: "main",
      scannedAt: "2026-01-01T00:00:00.000Z",
      dependencies: [],
      skipped: [],
      warnings: [],
      summary: { total: 0, skipped: 0, alive: 0, ailing: 0, dying: 0, dead: 0 },
    });
  });

  it("copies skipped and warnings unchanged", () => {
    const skipped: SkippedEntry[] = [
      { name: "z", kind: "dependencies", specifier: "file:../z", reason: "file" },
      { name: "a", kind: "devDependencies", specifier: "npm:x@1", reason: "npm_alias" },
    ];
    const warnings = ["w2", "w1"];
    const report = assembleReport(input([dep("x", 0)], skipped, warnings));
    expect(report.skipped).toEqual(skipped);
    expect(report.warnings).toEqual(warnings);
    expect(report.summary.skipped).toBe(2);
  });
});
