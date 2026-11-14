import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReport } from "@last-rites/exorcist-npm/report";
import type { ScanReport } from "@last-rites/exorcist-npm/report";
import { toGrade } from "@last-rites/skeleton";
import { GRADE_ORDER, buildBreakdown, buildGraveyard, compareGraves, safeHttpUrl } from "@last-rites/skeleton/graveyard";
import { DEMO_REPOS } from "./model/demo-repos.js";

const fixture = (name: string): string => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");
const demoDir = new URL("../../../demo/", import.meta.url);

function load(text: string, label: string): ScanReport {
  const r = parseReport(text);
  if (!r.ok) throw new Error(`${label}: ${r.error.category}: ${r.error.message}`);
  return r.report;
}

const FIXTURES = ["parse-server.trim.json", "prettier.trim.json", "jest.trim.json", "pump.json"] as const;

describe("committed fixtures", () => {
  it.each(FIXTURES)("%s parses with parseReport", (name) => {
    expect(parseReport(fixture(name)).ok).toBe(true);
  });

  it("parse-server has at least one calibrated dead package", () => {
    const r = load(fixture("parse-server.trim.json"), "parse-server");
    expect(r.dependencies.some((d) => d.death.grade === "dead" && d.death.calibration !== undefined)).toBe(true);
  });

  it("jest has zero dead and zero dying", () => {
    const r = load(fixture("jest.trim.json"), "jest");
    expect(r.dependencies.filter((d) => d.death.grade === "dead" || d.death.grade === "dying")).toHaveLength(0);
    expect(r.summary.dead).toBe(0);
    expect(r.summary.dying).toBe(0);
  });

  it("every fixture summary agrees with its dependencies", () => {
    for (const name of FIXTURES) {
      const r = load(fixture(name), name);
      expect(r.summary.total).toBe(r.dependencies.length);
      expect(r.summary.skipped).toBe(r.skipped.length);
      for (const g of GRADE_ORDER) {
        expect(r.summary[g]).toBe(r.dependencies.filter((d) => d.death.grade === g).length);
      }
    }
  });
});

describe("real /demo snapshots", () => {
  const files = readdirSync(demoDir).filter((f) => f.endsWith(".json")).sort();

  it("covers the four demo repos", () => {
    expect(files.map((f) => f.replace(/\.json$/, ""))).toEqual(DEMO_REPOS.map((d) => d.name).sort());
  });

  it.each(files)("%s keeps the view-model invariants", (file) => {
    const report = load(readFileSync(new URL(file, demoDir), "utf8"), file);
    const view = buildGraveyard(report.dependencies);

    // Partition: every dependency once, keys unique, in the group of its own grade.
    const all = view.groups.flatMap((g) => g.graves);
    expect(all).toHaveLength(report.dependencies.length);
    expect(new Set(all.map((g) => g.key)).size).toBe(all.length);
    expect(new Set(all.map((g) => g.index)).size).toBe(all.length);
    expect(view.total).toBe(report.dependencies.length);
    expect(view.groups.map((g) => g.grade)).toEqual([...GRADE_ORDER]);
    for (const group of view.groups) {
      expect(group.count).toBe(group.graves.length);
      expect(view.counts[group.grade]).toBe(group.count);
      for (const g of group.graves) expect(g.record.death.grade).toBe(group.grade);
      // Order: score descending, then name.
      for (let i = 1; i < group.graves.length; i++) {
        expect(compareGraves(group.graves[i - 1]!, group.graves[i]!)).toBeLessThanOrEqual(0);
      }
    }
    expect(view.counts.dead + view.counts.dying + view.counts.ailing + view.counts.alive).toBe(view.total);

    for (const dep of report.dependencies) {
      expect(toGrade(dep.death.score)).toBe(dep.death.grade);
      const b = buildBreakdown(dep);
      expect(b.consistent, `${dep.name} breakdown sums to its score`).toBe(true);
      expect(b.gradeConsistent).toBe(true);
      for (const part of dep.death.parts) {
        if (part.sourceUrl !== undefined) expect(safeHttpUrl(part.sourceUrl), `${dep.name} ${part.signal}`).toBe(part.sourceUrl);
      }
    }
  });
});
