// @vitest-environment jsdom
// graveyard-ui-actions 4.2: Sabotage_Lists for Properties 1 and 3 (proof-rules.md). Each deliberately wrong
// implementation must make the property fail under the fixed seed; a sabotage that stays green rejects the suite.
// The name model lives here (node:crypto is allowed in test files only). Property 2 runs in exorcist-actions
// (`proof/names.sabotage.test.ts`), next to its oracle. No network.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FIXED_SEED } from "@last-rites/skeleton/graveyard/testing";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import { build as p1 } from "./test-support/properties/p-actions-1.js";
import { build as p3 } from "./test-support/properties/p-actions-3.js";
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
