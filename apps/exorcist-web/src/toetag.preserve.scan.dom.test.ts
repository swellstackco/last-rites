// @vitest-environment jsdom
// toe-tag-redesign Property 1: Scan_Report facts are preserved (and the real-data examples). No network.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseReport } from "@last-rites/exorcist-npm/report";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import { build as tt1, checkScanFacts } from "./test-support/properties/tt1.js";

describe("Property 1: Scan_Report facts are preserved", () => {
  it("the page shows the Reference_Views facts and the report's facts", async () => {
    const report = await checkAsyncProperty("Property 1: Scan_Report facts", tt1());
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, 120_000);

  const demoDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "demo");
  const files = readdirSync(demoDir).filter((f) => f.endsWith(".json"));

  it("finds the demo reports", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`real data: demo/${file}`, async () => {
      const parsed = parseReport(readFileSync(join(demoDir, file), "utf8"));
      if (!parsed.ok) throw new Error(`${file} does not parse`);
      const deps = parsed.report.dependencies;
      const dead = deps.findIndex((d) => d.death.grade === "dead");
      await checkScanFacts(parsed.report, dead === -1 ? 0 : dead);
    }, 60_000);
  }
});
