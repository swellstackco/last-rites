// Central sabotage test (proof-rules.md) for Properties 1 to 13 of the kiro-integration.
import { describe, expect, it } from "vitest";
import { FIXED_SEED, checkProperty, checkPropertyAsync, log } from "./test-support/fc-runner.js";
import type { Sabotage } from "./test-support/sabotage-runner.js";
import * as V from "./test-support/validators.js";
import { KIRO_P1_SABOTAGES } from "./test-support/sabotage/kiro-p1.js";
import { KIRO_P2_SABOTAGES } from "./test-support/sabotage/kiro-p2.js";
import { KIRO_P3_SABOTAGES } from "./test-support/sabotage/kiro-p3.js";
import { KIRO_P4_SABOTAGES } from "./test-support/sabotage/kiro-p4.js";
import { KIRO_P5_SABOTAGES } from "./test-support/sabotage/kiro-p5.js";
import { KIRO_P6_SABOTAGES } from "./test-support/sabotage/kiro-p6.js";
import { KIRO_P7_SABOTAGES } from "./test-support/sabotage/kiro-p7.js";
import { KIRO_P8_SABOTAGES } from "./test-support/sabotage/kiro-p8.js";
import { KIRO_P9_SABOTAGES } from "./test-support/sabotage/kiro-p9.js";
import { KIRO_P10_SABOTAGES } from "./test-support/sabotage/kiro-p10.js";
import { KIRO_P11_SABOTAGES } from "./test-support/sabotage/kiro-p11.js";
import { KIRO_P12_SABOTAGES } from "./test-support/sabotage/kiro-p12.js";
import { KIRO_P13_SABOTAGES } from "./test-support/sabotage/kiro-p13.js";
import { name as n1, build as b1 } from "./guards.p1.test.js";
import { name as n2, build as b2 } from "./tools/output.p2.test.js";
import { name as n3, build as b3 } from "./tools/wrapper.p3.test.js";
import { name as n4, build as b4 } from "./tools/total.p4.test.js";
import { name as n5, build as b5 } from "./tools/writes.p5.test.js";
import { name as n6, build as b6 } from "./tools/determinism.p6.test.js";
import { name as n7, build as b7 } from "./scan-source.p7.test.js";
import { name as n8, build as b8 } from "./kiro-config/validators.p8.test.js";
import { name as n9, build as b9 } from "./kiro-config/privilege.p9.test.js";
import { name as n10, build as b10 } from "./hooks/new-dead.p10.test.js";
import { name as n11, build as b11 } from "./hooks/candidate-target.p11.test.js";
import { name as n12, build as b12 } from "./hooks/format.p12.test.js";
import { name as n13, build as b13 } from "./power/skill.p13.test.js";

interface Suite {
  property: string;
  list: readonly Sabotage<any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  required: readonly string[]; // Requirement 18.5 names (prefix match)
  real: unknown;
  build: (impl: any) => unknown; // eslint-disable-line @typescript-eslint/no-explicit-any
  async: boolean;
}

const suites: Suite[] = [
  { property: n1, list: KIRO_P1_SABOTAGES, required: [], real: V.REAL_GUARDS, build: b1, async: true },
  { property: n2, list: KIRO_P2_SABOTAGES, required: ["(a) a tool that returns non-canonical JSON"], real: V.REAL_TOOLS, build: b2, async: true },
  { property: n3, list: KIRO_P3_SABOTAGES, required: ["(a) add a field the wrapped code does not return"], real: V.REAL_TOOLS, build: b3, async: true },
  { property: n4, list: KIRO_P4_SABOTAGES, required: [], real: V.REAL_TOTAL, build: b4, async: true },
  { property: n5, list: KIRO_P5_SABOTAGES, required: ["(a) write next to out"], real: V.REAL_TOOLS, build: b5, async: true },
  { property: n6, list: KIRO_P6_SABOTAGES, required: [], real: V.REAL_TOOLS, build: b6, async: true },
  { property: n7, list: KIRO_P7_SABOTAGES, required: [], real: V.REAL_SCAN_SOURCE, build: b7, async: true },
  { property: n8, list: KIRO_P8_SABOTAGES, required: [], real: V.REAL_VALIDATORS, build: b8, async: false },
  { property: n9, list: KIRO_P9_SABOTAGES, required: ["(a) ignore an @exorcist selector without a tool name"], real: V.REAL_PRIVILEGE, build: b9, async: false },
  { property: n10, list: KIRO_P10_SABOTAGES, required: [], real: V.REAL_NEW_DEAD, build: b10, async: false },
  { property: n11, list: KIRO_P11_SABOTAGES, required: ["(a) accept `..`"], real: V.REAL_CANDIDATE_MAP, build: b11, async: false },
  { property: n12, list: KIRO_P12_SABOTAGES, required: [], real: V.REAL_HOOK_FORMAT, build: b12, async: false },
  { property: n13, list: KIRO_P13_SABOTAGES, required: [], real: V.REAL_SKILL_GEN, build: b13, async: false },
];

const check = async (s: Suite, impl: unknown) =>
  s.async
    ? checkPropertyAsync(s.property, s.build(impl) as never, FIXED_SEED)
    : checkProperty(s.property, s.build(impl) as never, FIXED_SEED);

describe("kiro-integration sabotage checks (proof-rules.md)", () => {
  for (const s of suites) {
    describe(s.property, () => {
      it("has a non-empty sabotage list with the required entries", () => {
        expect(s.list.length).toBeGreaterThan(0);
        const names = s.list.map((x) => x.name);
        for (const r of s.required) expect(names.some((n) => n.startsWith(r))).toBe(true);
      });

      it("the real implementation passes under the fixed seed", async () => {
        expect(await check(s, s.real)).toBeUndefined();
      }, 120_000);

      it("every sabotage makes the property fail", async () => {
        for (const sab of s.list) {
          const report = await check(s, sab.impl);
          if (!report) throw new Error(`Sabotage "${sab.name}" stayed green for "${s.property}"`);
          log("log", `[sabotage: ${sab.name}] caught (seed=${report.seed}, shrinks=${report.numShrinks})`);
        }
      }, 300_000);
    });
  }
});
