import { describe, expect, it } from "vitest";
import { FIXED_SEED, formatReport } from "./test-support/fc-runner.js";
import { runAgainst, type NamedProperty, type Sabotage } from "./test-support/sabotage-runner.js";
import { inventoryProperties, realInventoryImpl } from "./test-support/properties/actions-p1.js";
import { usesProperties, realUsesImpl } from "./test-support/properties/actions-p2.js";
import { pinProperties, realPinImpl } from "./test-support/properties/actions-p3.js";
import { pinAllProperties } from "./test-support/properties/actions-p4.js";
import { swapProperties, realSwapImpl } from "./test-support/properties/actions-p5.js";
import { manifestProperties, realManifestImpl } from "./test-support/properties/actions-p6.js";
import { evidenceProperties, realEvidenceImpl } from "./test-support/properties/actions-p7.js";
import { pinCheckProperties, realPinCheckImpl } from "./test-support/properties/actions-p8.js";
import { contractProperties, realContractImpl } from "./test-support/properties/actions-p9.js";
import { sabotageProperties, realSabotageImpl } from "./test-support/properties/actions-p10.js";
import { scanProperties, realScanImpl } from "./test-support/properties/actions-p11.js";
import { attemptProperties, realAttemptImpl } from "./test-support/properties/actions-p12.js";
import { exorciseProperties, realExorciseImpl } from "./test-support/properties/actions-p13.js";
import { sabotages as s1 } from "./test-support/sabotage/actions-p1.js";
import { sabotages as s2 } from "./test-support/sabotage/actions-p2.js";
import { sabotages as s3 } from "./test-support/sabotage/actions-p3.js";
import { sabotages as s4 } from "./test-support/sabotage/actions-p4.js";
import { sabotages as s5 } from "./test-support/sabotage/actions-p5.js";
import { sabotages as s6 } from "./test-support/sabotage/actions-p6.js";
import { sabotages as s7 } from "./test-support/sabotage/actions-p7.js";
import { sabotages as s8 } from "./test-support/sabotage/actions-p8.js";
import { sabotages as s9 } from "./test-support/sabotage/actions-p9.js";
import { sabotages as s10 } from "./test-support/sabotage/actions-p10.js";
import { sabotages as s11 } from "./test-support/sabotage/actions-p11.js";
import { sabotages as s12 } from "./test-support/sabotage/actions-p12.js";
import { sabotages as s13 } from "./test-support/sabotage/actions-p13.js";

// Central sabotage test (Requirement 17): for each of the thirteen properties, the real implementation
// passes under the fixed seed, and every entry of its Sabotage_List makes at least one assertion fail.

interface Entry {
  id: string;
  properties: ReadonlyArray<NamedProperty<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
  real: unknown;
  sabotages: ReadonlyArray<Sabotage<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const entries: Entry[] = [
  { id: "P1 inventory", properties: inventoryProperties, real: realInventoryImpl, sabotages: s1 },
  { id: "P2 uses grammar", properties: usesProperties, real: realUsesImpl, sabotages: s2 },
  { id: "P3 pin rewrite", properties: pinProperties, real: realPinImpl, sabotages: s3 },
  { id: "P4 pin idempotence", properties: pinAllProperties, real: realPinImpl, sabotages: s4 },
  { id: "P5 swap rewrite", properties: swapProperties, real: realSwapImpl, sabotages: s5 },
  { id: "P6 manifest", properties: manifestProperties, real: realManifestImpl, sabotages: s6 },
  { id: "P7 evidence", properties: evidenceProperties, real: realEvidenceImpl, sabotages: s7 },
  { id: "P8 pin check", properties: pinCheckProperties, real: realPinCheckImpl, sabotages: s8 },
  { id: "P9 contract check", properties: contractProperties, real: realContractImpl, sabotages: s9 },
  { id: "P10 mutants", properties: sabotageProperties, real: realSabotageImpl, sabotages: s10 },
  { id: "P11 scan report", properties: scanProperties, real: realScanImpl, sabotages: s11 },
  { id: "P12 attempt", properties: attemptProperties, real: realAttemptImpl, sabotages: s12 },
  { id: "P13 exorcise", properties: exorciseProperties, real: realExorciseImpl, sabotages: s13 },
];

const SLOW = 300_000;

describe("central sabotage test", () => {
  it("covers thirteen properties, each with a non-empty sabotage list", () => {
    expect(entries).toHaveLength(13);
    for (const e of entries) expect(e.sabotages.length, e.id).toBeGreaterThan(0);
  });

  for (const e of entries) {
    describe(e.id, () => {
      it(`the real implementation passes (seed ${FIXED_SEED})`, async () => {
        const failed = await runAgainst(e.properties, e.real, FIXED_SEED);
        expect(failed.map(formatReport)).toEqual([]);
      }, SLOW);

      for (const s of e.sabotages) {
        it(`sabotage "${s.name}" is caught`, async () => {
          const failed = await runAgainst(e.properties, s.impl, FIXED_SEED);
          if (failed.length === 0) console.error(`SURVIVOR: "${s.name}" stayed green for ${e.id}`);
          expect(failed.length, `sabotage "${s.name}" stayed green for ${e.id}`).toBeGreaterThan(0);
        }, SLOW);
      }
    });
  }
});
