import { describe, expect, it } from "vitest";
import { FIXED_SEED, checkProperty, log } from "../death-score/fc-runner.js";
import { build as p1 } from "./test-support/properties/p1.js";
import { build as p2 } from "./test-support/properties/p2.js";
import { build as p3 } from "./test-support/properties/p3.js";
import { build as p4 } from "./test-support/properties/p4.js";
import { build as p5 } from "./test-support/properties/p5.js";
import { P1_SABOTAGES } from "./test-support/sabotage/p1.js";
import { P2_SABOTAGES } from "./test-support/sabotage/p2.js";
import { P3_SABOTAGES } from "./test-support/sabotage/p3.js";
import { P4_VIEW_SABOTAGES } from "./test-support/sabotage/p4.js";
import { P5_SABOTAGES } from "./test-support/sabotage/p5.js";
import { assertAllSabotagesCaught } from "./test-support/sabotage-runner.js";
import type { Sabotage } from "./test-support/sabotage-runner.js";

interface Suite<F> {
  property: string;
  list: readonly Sabotage<F>[];
  build: (impl?: F) => Parameters<typeof checkProperty>[1];
  /** Sabotages Requirement 20.2 names for this property (those that belong to the view model). */
  required: string[];
}

const suites: Suite<any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  {
    property: "Property 1: grouping is a partition",
    list: P1_SABOTAGES,
    build: p1,
    required: ["drops a record that shares a name with another", "drops the alive group", "puts a boundary-score (75) record in two groups", "assigns key = name without a suffix"],
  },
  {
    property: "Property 2: ordering",
    list: P2_SABOTAGES,
    build: p2,
    required: ["score ascending", "no name tiebreak (input order only)", "band order reversed (alive first)", "name before score", "localeCompare for names", "score compared as a string"],
  },
  {
    property: "Property 3: breakdown arithmetic",
    list: P3_SABOTAGES,
    build: p3,
    required: ["omits the calibration row", "counts the calibration points twice", "uses weight where points belongs", "excludes unknown rows from the sum", "computes the total from the parts only"],
  },
  {
    property: "Property 4: counts (view model)",
    list: P4_VIEW_SABOTAGES,
    build: p4,
    required: ["counts dying as dead", "off-by-one in the alive count"],
  },
  {
    property: "Property 5: safe links",
    list: P5_SABOTAGES,
    build: p5,
    required: ["no check at all", "javascript: denylist only", "case-sensitive denylist", 'startsWith("http")', "accepts protocol-relative //host", "accepts userinfo", "validates a trimmed copy but returns the untrimmed value"],
  },
];

describe("sabotage checks (proof-rules.md)", () => {
  for (const s of suites) {
    describe(s.property, () => {
      it("has a non-empty sabotage list with the required entries", () => {
        expect(s.list.length).toBeGreaterThan(0);
        const names = s.list.map((x) => x.name);
        for (const r of s.required) expect(names).toContain(r);
      });

      it("the real implementation passes under the fixed seed", () => {
        expect(checkProperty(s.property, s.build(), FIXED_SEED)).toBeUndefined();
      });

      it("every sabotage makes the property fail", () => {
        const reports = assertAllSabotagesCaught(s.property, s.list, (impl) =>
          checkProperty(s.property, s.build(impl), FIXED_SEED),
        );
        reports.forEach((r, i) => {
          log("log", `[sabotage: ${s.list[i]!.name}] caught (seed=${r.seed}, shrinks=${r.numShrinks})\n  shrunk counterexample: ${r.counterexample}`);
        });
      });
    });
  }
});
