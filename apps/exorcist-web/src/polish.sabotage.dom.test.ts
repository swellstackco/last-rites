// @vitest-environment jsdom
// graveyard-ui-polish: DOM sabotage checks for Properties 9 and 10 (proof-rules.md). Own file because the
// DOM needs jsdom while sabotage.test.ts runs in node. No network.
import { describe, expect, it } from "vitest";
import { FIXED_SEED } from "@last-rites/skeleton/graveyard/testing";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import { build as p9 } from "./test-support/properties/p9.js";
import { build as p10 } from "./test-support/properties/p10.js";
import { P10_SABOTAGES, P9_SABOTAGES } from "./test-support/sabotage/dom.js";
import type { DomSabotage } from "./test-support/sabotage/dom.js";
import type { Mutate } from "./test-support/sabotage/dom.js";
import type fc from "fast-check";

interface Suite {
  property: string;
  list: readonly DomSabotage[];
  build: (mutate?: Mutate) => fc.IAsyncProperty<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  required: string[];
}

const suites: Suite[] = [
  {
    property: "Property 9: fix checking (DOM)",
    list: P9_SABOTAGES,
    build: (m) => p9(undefined, m),
    required: ["(a)", "(b)", "(c)", "(d)", "(e)", "(f)"],
  },
  {
    property: "Property 10: preservation",
    list: P10_SABOTAGES,
    build: (m) => p10(m),
    required: ["(g1)", "(g2)", "(g3)", "(h)", "(i)", "(j)"],
  },
];

describe("DOM sabotage checks (graveyard-ui-polish)", () => {
  for (const s of suites) {
    describe(s.property, () => {
      it("has every required sabotage", () => {
        for (const r of s.required) expect(s.list.some((x) => x.name.startsWith(r))).toBe(true);
      });

      it("the real implementation passes under the fixed seed", async () => {
        const report = await checkAsyncProperty(s.property, s.build(), FIXED_SEED);
        expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
      }, 60_000);

      for (const sab of s.list) {
        it(`catches sabotage ${sab.name}`, async () => {
          const report = await checkAsyncProperty(s.property, s.build(sab.mutate), FIXED_SEED);
          if (report === undefined) throw new Error(`Sabotage "${sab.name}" stayed green for "${s.property}"`);
          console.log(`[sabotage: ${sab.name}] caught (seed=${report.seed}, shrinks=${report.numShrinks})\n  shrunk counterexample: ${report.counterexample}\n  error: ${report.error?.split("\n")[0] ?? ""}`);
        }, 60_000);
      }
    });
  }
});
