import { describe, expect, it } from "vitest";
import { FIXED_SEED, assertAllSabotagesCaught, checkProperty } from "@graveyard-kit/skeleton/graveyard/testing";
import type { Sabotage } from "@graveyard-kit/skeleton/graveyard/testing";
import { build as p4 } from "./test-support/properties/p4.js";
import { build as p6 } from "./test-support/properties/p6.js";
import { build as p7 } from "./test-support/properties/p7.js";
import { build as p8 } from "./test-support/properties/p8.js";
import { P4_HEADER_SABOTAGES } from "./test-support/sabotage/p4.js";
import { P6_SABOTAGES } from "./test-support/sabotage/p6.js";
import { P7_SABOTAGES } from "./test-support/sabotage/p7.js";
import { P8_SABOTAGES } from "./test-support/sabotage/p8.js";

interface Suite<F> {
  property: string;
  list: readonly Sabotage<F>[];
  build: (impl?: F) => Parameters<typeof checkProperty>[1];
  /** Sabotages Requirement 20.2 names for this property. */
  required: string[];
}

const suites: Suite<any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  {
    property: "Property 4: header counts",
    list: P4_HEADER_SABOTAGES,
    build: p4,
    required: ["header counts copied from report.summary", "header counts dying as dead", "header total includes skipped", "header alive count off by one", "summaryDisagrees always false"],
  },
  {
    property: "Property 6: route codec",
    list: P6_SABOTAGES,
    build: p6,
    required: ["slash not encoded in pkg", "ampersand not encoded", "ref dropped on format", "repo lower-cased on parse", "decode errors thrown", "plus decoded as space"],
  },
  {
    property: "Property 7: repo input",
    list: P7_SABOTAGES,
    build: p7,
    required: ["accepts extra path segments", "accepts any host", "accepts .. in a ref", "rejects an underscore in a repo name", "lower-cases the result", "strips .git anywhere in the name"],
  },
  {
    property: "Property 8: error description",
    list: P8_SABOTAGES,
    build: p8,
    required: ["throws on an unknown code", "empty detail for unknown codes", "unclamped retryAfterSeconds", "negative retryAfterSeconds", "NaN retryAfterSeconds", "server message not truncated", "429 without a header gives undefined"],
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
          console.log(`[sabotage: ${s.list[i]!.name}] caught (seed=${r.seed}, shrinks=${r.numShrinks})\n  shrunk counterexample: ${r.counterexample}`);
        });
      });
    });
  }
});
