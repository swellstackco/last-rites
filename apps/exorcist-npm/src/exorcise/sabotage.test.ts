// Central sabotage test (proof-rules.md) for Properties 1, 4, 6 and 11 of the proof harness.
import { describe, expect, it } from "vitest";
import { FIXED_SEED, checkProperty, checkPropertyAsync, log } from "../evidence/test-support/fc-runner.js";
import type { Sabotage } from "../evidence/test-support/sabotage-runner.js";
import { build as p11, REAL_NAMES_CLI } from "./names-cli.p11.test.js";
import { build as p1, REAL_DIFFERENTIAL_IMPL } from "./recipes.p1.test.js";
import { build as p4, REAL_P4_SUBJECT } from "./recipes.p4.test.js";
import { P11_REQUIRED, P11_SABOTAGES } from "./test-support/sabotage/proof-p11.js";
import { P1_REQUIRED, P1_SABOTAGES } from "./test-support/sabotage/proof-p1.js";
import { P4_REQUIRED, P4_SABOTAGES } from "./test-support/sabotage/proof-p4.js";
import { P6_REQUIRED, P6_SABOTAGES } from "./test-support/sabotage/proof-p6.js";
import { build as p6, REAL_USAGE_SURFACE } from "./usage-surface.p6.test.js";

interface Suite<F> {
  property: string;
  list: readonly Sabotage<F>[];
  required: readonly string[];
  real: F;
  build: (impl: F) => unknown;
  async?: boolean;
}

const suites: Suite<any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  { property: "Property 1: differential soundness", list: P1_SABOTAGES, required: P1_REQUIRED, real: REAL_DIFFERENTIAL_IMPL, build: p1 },
  { property: "Property 4: sabotage completeness", list: P4_SABOTAGES, required: P4_REQUIRED, real: REAL_P4_SUBJECT, build: p4 },
  { property: "Property 6: usage-surface determinism", list: P6_SABOTAGES, required: P6_REQUIRED, real: REAL_USAGE_SURFACE, build: p6, async: true },
  { property: "Property 11: names, paths and CLI arguments", list: P11_SABOTAGES, required: P11_REQUIRED, real: REAL_NAMES_CLI, build: p11 },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const check = async (s: Suite<any>, impl: unknown) =>
  s.async
    ? checkPropertyAsync(s.property, s.build(impl) as never, FIXED_SEED)
    : checkProperty(s.property, s.build(impl) as never, FIXED_SEED);

describe("exorcist-npm proof sabotage checks (proof-rules.md)", () => {
  for (const s of suites) {
    describe(s.property, () => {
      it("has a non-empty sabotage list with the required entries", () => {
        expect(s.list.length).toBeGreaterThan(0);
        const names = s.list.map((x) => x.name);
        for (const r of s.required) expect(names).toContain(r);
      });

      it("the real implementation passes under the fixed seed", async () => {
        expect(await check(s, s.real)).toBeUndefined();
      });

      it("every sabotage makes the property fail", async () => {
        for (const sab of s.list) {
          const report = await check(s, sab.impl);
          if (!report) throw new Error(`Sabotage "${sab.name}" stayed green for "${s.property}"`);
          log("log", `[sabotage: ${sab.name}] caught (seed=${report.seed}, shrinks=${report.numShrinks})`);
        }
      }, 120_000);
    });
  }
});
