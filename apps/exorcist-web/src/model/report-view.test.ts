import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReport } from "@graveyard-kit/exorcist-npm/report";
import type { ScanReport } from "@graveyard-kit/exorcist-npm/report";
import type { PackageSignals } from "@graveyard-kit/skeleton";
import { buildReportView, formatScannedAt } from "./report-view.js";
import { buildReport, tamperSummary } from "../test-support/build-report.js";

function fixture(name: string): ScanReport {
  const text = readFileSync(new URL(`../__fixtures__/${name}`, import.meta.url), "utf8");
  const r = parseReport(text);
  if (!r.ok) throw new Error(r.error.message);
  return r.report;
}

const live: PackageSignals = {
  deprecated: { kind: "known", value: false },
  repoArchived: { kind: "known", value: false },
  monthsSinceLastPublish: { kind: "known", value: 1 },
  monthsSinceLastCommit: { kind: "known", value: 1 },
  maintainerCount: { kind: "known", value: 6 },
  openVulnsNoFix: { kind: "known", value: 0 },
  knownReplacementExists: { kind: "known", value: false },
};

describe("buildReportView header", () => {
  it.each(["parse-server.trim.json", "prettier.trim.json", "jest.trim.json", "pump.json"])("%s", (name) => {
    const report = fixture(name);
    const { header, graveyard, skipped } = buildReportView(report, "demo");
    expect(header.repo).toBe(report.repo);
    expect(header.refLabel).toBe("default branch (HEAD)");
    expect(header.scannedAtLabel).toBe(formatScannedAt(report.scannedAt));
    expect(header.scannedAtLabel).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
    expect(header.sourceLabel).toBe("Snapshot");
    expect(header.counts).toEqual(graveyard.counts);
    expect(header.total).toBe(report.dependencies.length);
    expect(header.skipped).toBe(report.skipped.length);
    expect(skipped).toEqual(report.skipped);
    expect(header.warnings).toEqual(report.warnings);
    expect(header.summaryDisagrees).toBe(false);
  });

  it("labels a live scan and a named ref", () => {
    const { header } = buildReportView(buildReport([], { ref: "v1.2" }), "live");
    expect(header.sourceLabel).toBe("Live scan");
    expect(header.refLabel).toBe("v1.2");
  });

  it("keeps warnings verbatim and in order", () => {
    const warnings = ["b first", "  a  ", "<b>x</b>"];
    expect(buildReportView(buildReport([], { warnings }), "demo").header.warnings).toEqual(warnings);
  });
});

describe("rangesOnly", () => {
  it("is true for the jest fixture (ranges only)", () => {
    expect(buildReportView(fixture("jest.trim.json"), "demo").header.rangesOnly).toBe(true);
  });
  it("is false when one dependency comes from a lockfile", () => {
    const r = buildReport([
      { name: "a", signals: live, versionSource: "range" },
      { name: "b", signals: live, versionSource: "lockfile" },
    ]);
    expect(buildReportView(r, "demo").header.rangesOnly).toBe(false);
  });
  it("is false for zero dependencies", () => {
    expect(buildReportView(buildReport([]), "demo").header.rangesOnly).toBe(false);
  });
  it("does not depend on warning text", () => {
    const r = buildReport([{ name: "a", signals: live, versionSource: "range" }], { warnings: [] });
    expect(buildReportView(r, "demo").header.rangesOnly).toBe(true);
  });
});

describe("summaryDisagrees", () => {
  const base = buildReport([{ name: "a", signals: live }]);
  it("is false for a correct summary", () => {
    expect(buildReportView(base, "demo").header.summaryDisagrees).toBe(false);
  });
  it("is true for a tampered total or grade count, and header shows computed values", () => {
    for (const patch of [{ total: 9 }, { alive: 0 }, { dead: 1 }]) {
      const v = buildReportView(tamperSummary(base, patch), "demo");
      expect(v.header.summaryDisagrees).toBe(true);
      expect(v.header.total).toBe(1);
      expect(v.header.counts.alive).toBe(1);
    }
  });
  it("ignores the skipped number", () => {
    expect(buildReportView(tamperSummary(base, { skipped: 5 }), "demo").header.summaryDisagrees).toBe(false);
    expect(buildReportView(tamperSummary(base, { skipped: 5 }), "demo").header.skipped).toBe(0);
  });
});

describe("formatScannedAt", () => {
  it.each([
    ["2026-11-13T04:09:39.734Z", "2026-11-13 04:09 UTC"],
    ["2026-11-13T04:09:39Z", "2026-11-13 04:09 UTC"],
    ["2026-11-13T23:59:59.999Z", "2026-11-13 23:59 UTC"],
    ["not a date", "not a date"],
    ["", ""],
    ["2026-11-13T04:09:39+02:00", "2026-11-13T04:09:39+02:00"],
    ["2026-11-13T04:09:39.734Z\n", "2026-11-13T04:09:39.734Z\n"],
  ])("%j", (input, out) => {
    expect(formatScannedAt(input)).toBe(out);
  });
});

describe("static check", () => {
  it("report-view.ts uses no Date or locale API", () => {
    const src = readFileSync(new URL("./report-view.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/\bDate\b|toLocale|Intl\./);
  });
});
