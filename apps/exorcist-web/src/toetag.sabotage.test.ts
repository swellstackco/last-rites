// @vitest-environment jsdom
// toe-tag-redesign: runs the DOM sabotage lists of Properties 1 to 3 (proof-rules.md). No network.
import { describe, expect, it } from "vitest";
import { FIXED_SEED } from "@graveyard-kit/skeleton/graveyard/testing";
import type fc from "fast-check";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import { build as tt1 } from "./test-support/properties/tt1.js";
import { build as tt2 } from "./test-support/properties/tt2.js";
import { build as tt3 } from "./test-support/properties/tt3.js";
import { TT1_SABOTAGES } from "./test-support/sabotage/tt1.js";
import { TT2_SABOTAGES } from "./test-support/sabotage/tt2.js";
import { TT3_SABOTAGES } from "./test-support/sabotage/tt3.js";
import type { ToeMutate, ToeSabotage } from "./test-support/sabotage/toe.js";

interface Suite {
  property: string;
  list: readonly ToeSabotage[];
  build: (mutate?: ToeMutate) => fc.IAsyncProperty<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const suites: Suite[] = [
  { property: "Property 1: Scan_Report facts", list: TT1_SABOTAGES, build: tt1 },
  { property: "Property 2: Proof_Report facts", list: TT2_SABOTAGES, build: tt2 },
  { property: "Property 3: safety", list: TT3_SABOTAGES, build: tt3 },
];

describe("toe-tag DOM sabotage checks", () => {
  for (const s of suites) {
    describe(s.property, () => {
      it("has a non-empty sabotage list", () => {
        expect(s.list.length).toBeGreaterThan(0);
      });

      it("the real implementation passes under the fixed seed", async () => {
        const report = await checkAsyncProperty(s.property, s.build(), FIXED_SEED);
        expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
      }, 180_000);

      for (const sab of s.list) {
        it(`catches sabotage "${sab.name}"`, async () => {
          const report = await checkAsyncProperty(s.property, s.build(sab.mutate), FIXED_SEED);
          if (report === undefined) throw new Error(`Sabotage "${sab.name}" stayed green for "${s.property}"`);
          console.log(`[sabotage: ${sab.name}] caught (seed=${report.seed}, shrinks=${report.numShrinks})\n  shrunk counterexample: ${report.counterexample}\n  error: ${report.error?.split("\n")[0] ?? ""}`);
        }, 180_000);
      }
    });
  }
});
