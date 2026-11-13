// Central sabotage test (proof-rules.md): every property must fail against every entry of its list.
import { describe, expect, it } from "vitest";
import { FIXED_SEED, checkProperty, log } from "../death-score/fc-runner.js";
import { assertAllSabotagesCaught, type Sabotage } from "../graveyard/test-support/sabotage-runner.js";
import { build as p2, REAL_RUN_SHAPE_IMPL } from "./runner/differential.p2.test.js";
import { build as p3, REAL_RUN_PROOF_IMPL } from "./runner/run-proof.p3.test.js";
import { build as p5, REAL_REPORT_IMPL } from "./runner/report-determinism.p5.test.js";
import { build as p7, REAL_SABOTAGE_IMPL } from "./runner/sabotage.p7.test.js";
import { build as p8, REAL_OUTCOME_IMPL } from "./runner/outcome.p8.test.js";
import { build as p9, REAL_PROOF_CODEC } from "./report.p9.test.js";
import { P2_REQUIRED, P2_SABOTAGES } from "./test-support/sabotage/proof-p2.js";
import { P3_REQUIRED, P3_SABOTAGES } from "./test-support/sabotage/proof-p3.js";
import { P5_REQUIRED, P5_SABOTAGES } from "./test-support/sabotage/proof-p5.js";
import { P7_REQUIRED, P7_SABOTAGES } from "./test-support/sabotage/proof-p7.js";
import { P8_REQUIRED, P8_SABOTAGES } from "./test-support/sabotage/proof-p8.js";
import { P9_REQUIRED, P9_SABOTAGES } from "./test-support/sabotage/proof-p9.js";

interface Suite<F> {
  property: string;
  list: readonly Sabotage<F>[];
  required: readonly string[];
  real: F;
  build: (impl: F) => Parameters<typeof checkProperty>[1];
}

const suites: Suite<any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  { property: "Property 2: counterexample reality", list: P2_SABOTAGES, required: P2_REQUIRED, real: REAL_RUN_SHAPE_IMPL, build: p2 },
  { property: "Property 3: no trivial passes", list: P3_SABOTAGES, required: P3_REQUIRED, real: REAL_RUN_PROOF_IMPL, build: p3 },
  { property: "Property 5: determinism", list: P5_SABOTAGES, required: P5_REQUIRED, real: REAL_REPORT_IMPL, build: p5 },
  { property: "Property 7: sabotage accounting", list: P7_SABOTAGES, required: P7_REQUIRED, real: REAL_SABOTAGE_IMPL, build: p7 },
  { property: "Property 8: outcome equivalence", list: P8_SABOTAGES, required: P8_REQUIRED, real: REAL_OUTCOME_IMPL, build: p8 },
  { property: "Property 9: proof report codec", list: P9_SABOTAGES, required: P9_REQUIRED, real: REAL_PROOF_CODEC, build: p9 },
];

describe("proof sabotage checks (proof-rules.md)", () => {
  for (const s of suites) {
    describe(s.property, () => {
      it("has a non-empty sabotage list with the required entries", () => {
        expect(s.list.length).toBeGreaterThan(0);
        const names = s.list.map((x) => x.name);
        for (const r of s.required) expect(names).toContain(r);
      });

      it("the real implementation passes under the fixed seed", () => {
        expect(checkProperty(s.property, s.build(s.real), FIXED_SEED)).toBeUndefined();
      });

      it("every sabotage makes the property fail", () => {
        const reports = assertAllSabotagesCaught(s.property, s.list, (impl) =>
          checkProperty(s.property, s.build(impl), FIXED_SEED),
        );
        reports.forEach((r, i) => {
          log("log", `[sabotage: ${s.list[i]!.name}] caught (seed=${r.seed}, shrinks=${r.numShrinks})`);
        });
      });
    });
  }
});
