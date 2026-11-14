// @vitest-environment jsdom
// graveyard-ui-actions 4.2 and 4.3: Sabotage_Lists for Properties 1 and 3 to 7 (proof-rules.md). Each deliberately wrong
// implementation must make the property fail under the fixed seed; a sabotage that stays green rejects the suite.
// The name model lives here (node:crypto is allowed in test files only). Property 2 runs in exorcist-actions
// (`proof/names.sabotage.test.ts`), next to its oracle. No network.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseReport } from "@last-rites/exorcist-npm/report";
import { describe, expect, it } from "vitest";
import { FIXED_SEED } from "@last-rites/skeleton/graveyard/testing";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import { build as p1 } from "./test-support/properties/p-actions-1.js";
import { build as p3 } from "./test-support/properties/p-actions-3.js";
import { build as p4 } from "./test-support/properties/p-actions-4.js";
import { build as p5 } from "./test-support/properties/p-actions-5.js";
import { build as p6, checkActionsPage, loadPackageHref } from "./test-support/properties/p-actions-6.js";
import { buildScan as p7 } from "./test-support/properties/p-actions-7.js";
import { P4_SABOTAGES } from "./test-support/sabotage/actions-p4.js";
import { P5_SABOTAGES } from "./test-support/sabotage/actions-p5.js";
import { P6_LINK_SABOTAGES, P6_PAGE_SABOTAGES } from "./test-support/sabotage/actions-p6.js";
import { P7_SABOTAGES } from "./test-support/sabotage/actions-p7.js";
import { P1_SABOTAGES } from "./test-support/sabotage/actions-p1.js";
import { P3_SABOTAGES } from "./test-support/sabotage/actions-p3.js";

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const modelName = (name: string): string => {
  const lower = name.toLowerCase();
  return `${slug(lower).slice(0, 55) || "x"}-${createHash("sha256").update(lower).digest("hex").slice(0, 8)}`;
};

const SLOW = 120_000;

describe("Property 1 sabotage checks (graveyard-ui-actions)", () => {
  it("the real page passes under the fixed seed", async () => {
    const report = await checkAsyncProperty("Property 1", p1(modelName), FIXED_SEED);
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, SLOW);

  for (const s of P1_SABOTAGES) {
    it(`catches sabotage ${s.name}`, async () => {
      const report = await checkAsyncProperty("Property 1", p1(s.nameOf ?? modelName, s.mutation), FIXED_SEED);
      if (report === undefined) throw new Error(`Sabotage "${s.name}" stayed green for "Property 1"`);
      console.log(`[sabotage: ${s.name}] caught (seed=${report.seed}, shrinks=${report.numShrinks})\n  shrunk counterexample: ${report.counterexample}\n  error: ${report.error?.split("\n")[0] ?? ""}`);
    }, SLOW);
  }
});

describe("Property 3 sabotage checks (graveyard-ui-actions)", () => {
  it("the real page passes under the fixed seed", async () => {
    const report = await checkAsyncProperty("Property 3", p3(), FIXED_SEED);
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, SLOW);

  for (const s of P3_SABOTAGES) {
    it(`catches sabotage ${s.name}`, async () => {
      const report = await checkAsyncProperty("Property 3", p3(s.mutate), FIXED_SEED);
      if (report === undefined) throw new Error(`Sabotage "${s.name}" stayed green for "Property 3"`);
      console.log(`[sabotage: ${s.name}] caught (seed=${report.seed}, shrinks=${report.numShrinks})\n  shrunk counterexample: ${report.counterexample}\n  error: ${report.error?.split("\n")[0] ?? ""}`);
    }, SLOW);
  }
});

const logCaught = (name: string, report: { seed: number; numShrinks: number; counterexample: string; error?: string | null | undefined }): void =>
  console.log(`[sabotage: ${name}] caught (seed=${report.seed}, shrinks=${report.numShrinks})\n  shrunk counterexample: ${report.counterexample}\n  error: ${report.error?.split("\n")[0] ?? ""}`);

describe("Property 4 sabotage checks (graveyard-ui-actions)", () => {
  it("the real view passes under the fixed seed", async () => {
    const report = await checkAsyncProperty("Property 4", p4(), FIXED_SEED);
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, SLOW);
  for (const s of P4_SABOTAGES) {
    it(`catches sabotage ${s.name}`, async () => {
      const report = await checkAsyncProperty("Property 4", p4(s.mutation), FIXED_SEED);
      if (report === undefined) throw new Error(`Sabotage "${s.name}" stayed green for "Property 4"`);
      logCaught(s.name, report);
    }, SLOW);
  }
});

describe("Property 5 sabotage checks (graveyard-ui-actions)", () => {
  it("the real header passes under the fixed seed", async () => {
    const report = await checkAsyncProperty("Property 5", p5(), FIXED_SEED);
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, SLOW);
  for (const s of P5_SABOTAGES) {
    it(`catches sabotage ${s.name}`, async () => {
      const report = await checkAsyncProperty("Property 5", p5(undefined, s.mutate), FIXED_SEED);
      if (report === undefined) throw new Error(`Sabotage "${s.name}" stayed green for "Property 5"`);
      logCaught(s.name, report);
    }, SLOW);
  }
});

describe("Property 6 sabotage checks (graveyard-ui-actions)", () => {
  it("the real packageHref passes under the fixed seed", async () => {
    const report = await checkAsyncProperty("Property 6", p6(await loadPackageHref()), FIXED_SEED);
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, SLOW);
  for (const s of P6_LINK_SABOTAGES) {
    it(`catches sabotage ${s.name}`, async () => {
      const report = await checkAsyncProperty("Property 6", p6(s.wrap(await loadPackageHref())), FIXED_SEED);
      if (report === undefined) throw new Error(`Sabotage "${s.name}" stayed green for "Property 6"`);
      logCaught(s.name, report);
    }, SLOW);
  }
  for (const s of P6_PAGE_SABOTAGES) {
    it(`catches sabotage ${s.name}`, async () => {
      const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "demo", "nixpacks-actions.json"), "utf8");
      const parsed = parseReport(text);
      if (!parsed.ok) throw new Error("demo/nixpacks-actions.json does not parse");
      await expect(checkActionsPage(parsed.report, "nixpacks-actions", {}, s.tamper)).rejects.toThrow(/on npm/);
      console.log(`[sabotage: ${s.name}] caught on the committed nixpacks-actions demo`);
    }, SLOW);
  }
});

describe("Property 7 sabotage checks (graveyard-ui-actions)", () => {
  it("the real npm page passes under the fixed seed", async () => {
    const report = await checkAsyncProperty("Property 7", p7(), FIXED_SEED);
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, SLOW);
  for (const s of P7_SABOTAGES) {
    it(`catches sabotage ${s.name}`, async () => {
      const report = await checkAsyncProperty("Property 7", p7(s.tamper), FIXED_SEED);
      if (report === undefined) throw new Error(`Sabotage "${s.name}" stayed green for "Property 7"`);
      logCaught(s.name, report);
    }, SLOW);
  }
});
