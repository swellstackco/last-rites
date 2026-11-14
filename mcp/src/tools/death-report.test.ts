import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parseReport, type ScanOutcome, type ScanPipeline } from "@last-rites/exorcist-npm/programmatic";
import { makeDeps } from "../test-support/fakes.js";
import { deathReportImpl } from "./death-report.js";

const SAMPLE = readFileSync(new URL("../__fixtures__/demo/sample.json", import.meta.url), "utf8");
const parsed = parseReport(SAMPLE);
if (!parsed.ok) throw new Error("sample invalid");
const BASE = parsed.report;
const SKIPPED = { name: "linked-thing", kind: "dependencies" as const, specifier: "link:../x", reason: "link" as const };
// The sample has unusual names (valid for the codec, not for the Npm_Name guard): rename them.
const REPORT = {
  ...BASE,
  dependencies: BASE.dependencies.map((d, i) => ({ ...d, name: `dep-${i}` })),
  skipped: [SKIPPED],
  summary: { ...BASE.summary, skipped: 1 },
};

function deps() {
  const base = makeDeps();
  const github: ScanPipeline = async (): Promise<ScanOutcome> => ({ ok: true, report: REPORT });
  return makeDeps({ scan: { ...base.scan, github } });
}

describe("death_report", () => {
  it("returns a one-dependency report equal to the scanner's own entry", async () => {
    const pick = REPORT.dependencies[REPORT.dependencies.length - 1]!;
    const r = await deathReportImpl(deps(), { repo: "o/r", package: pick.name });
    expect(r.isError).toBeFalsy();
    const out = parseReport((r.content[0] as { text: string }).text);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.report.dependencies).toEqual([pick]);
    expect(out.report.summary.total).toBe(1);
    expect(out.report.summary[pick.death.grade]).toBe(1);
    expect(out.report.summary.alive + out.report.summary.ailing + out.report.summary.dying + out.report.summary.dead).toBe(1);
    expect(out.report.skipped).toEqual([]);
    expect(out.report.repo).toBe(REPORT.repo);
    expect(out.report.ref).toBe(REPORT.ref);
    expect(out.report.scannedAt).toBe(REPORT.scannedAt);
    expect(out.report.warnings).toEqual(REPORT.warnings);
    // sources survive
    expect(JSON.stringify(out.report.dependencies[0]!.death)).toBe(JSON.stringify(pick.death));
  });

  it("reports package_not_found", async () => {
    const r = await deathReportImpl(deps(), { repo: "o/r", package: "not-there" });
    expect(r.isError).toBe(true);
    expect(JSON.parse((r.content[0] as { text: string }).text).error.code).toBe("package_not_found");
  });

  it("reports package_skipped with the reason", async () => {
    const r = await deathReportImpl(deps(), { repo: "o/r", package: "linked-thing" });
    const e = JSON.parse((r.content[0] as { text: string }).text).error;
    expect(e.code).toBe("package_skipped");
    expect(e.message).toContain("link");
  });

  it("rejects a bad package name before any Dep is called", async () => {
    const d = makeDeps();
    const r = await deathReportImpl(d, { repo: "o/r", package: "Bad Name" });
    expect(JSON.parse((r.content[0] as { text: string }).text).error.code).toBe("invalid_package");
    expect(d.totalCalls()).toBe(0);
  });
});
