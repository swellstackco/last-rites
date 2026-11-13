// @vitest-environment jsdom
// toe-tag-redesign: runs the DOM sabotage lists of Properties 1 to 3 (proof-rules.md). No network.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fcLib from "fast-check";
import { describe, expect, it } from "vitest";
import { FIXED_SEED } from "@graveyard-kit/skeleton/graveyard/testing";
import type fc from "fast-check";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import { build as tt1 } from "./test-support/properties/tt1.js";
import { build as tt2 } from "./test-support/properties/tt2.js";
import { build as tt3 } from "./test-support/properties/tt3.js";
import { build as tp1, buildLive as tp1Live } from "./test-support/properties/tp1.js";
import { TP1_LIVE_SABOTAGES, TP1_SABOTAGES } from "./test-support/sabotage/tp1.js";
import { build as tp2 } from "./test-support/properties/tp2.js";
import { TP2_SABOTAGES } from "./test-support/sabotage/tp2.js";
import { build as tp6 } from "./test-support/properties/tp6.js";
import { TP6_SABOTAGES } from "./test-support/sabotage/tp6.js";
import { build as tt4Build, check as tt4Check, sheetsFrom } from "./test-support/properties/tt4.js";
import type { Sheets } from "./test-support/properties/tt4.js";
import { build as tt5 } from "./test-support/properties/tt5.js";
import { build as tt6 } from "./test-support/properties/tt6.js";
import { build as tt7, buildDom as tt7Dom } from "./test-support/properties/tt7.js";
import { build as tt8 } from "./test-support/properties/tt8.js";
import { TT4_SABOTAGES } from "./test-support/sabotage/tt4.js";
import { TT5_SABOTAGES } from "./test-support/sabotage/tt5.js";
import { TT6_SABOTAGES } from "./test-support/sabotage/tt6.js";
import { TT7_DOM_SABOTAGES, TT7_SABOTAGES, TT7_SOURCE_SABOTAGE } from "./test-support/sabotage/tt7.js";
import { TT8_SABOTAGES } from "./test-support/sabotage/tt8.js";
import type { SheetSabotage } from "./test-support/sabotage/replace-once.js";
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
  { property: "TP1: proof for any grade", list: TP1_SABOTAGES, build: tp1 },
  { property: "TP1: live scan requests no proof", list: TP1_LIVE_SABOTAGES, build: tp1Live },
  { property: "TP2: subtitle without an orphan", list: TP2_SABOTAGES, build: tp2 },
  { property: "TP6: preservation (toe-tag-polish)", list: TP6_SABOTAGES, build: tp6 },
  { property: "Property 7: open at once (DOM part)", list: TT7_DOM_SABOTAGES, build: tt7Dom },
];

const read = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const sheets = sheetsFrom((name) => read(`./styles/${name}`));
const sources = { "views/detail.ts": read("./views/detail.ts"), "views/tombstone.ts": read("./views/tombstone.ts") };

// Property 4 also covers the sheet-wide checks, so its property runs the pair draw and the exhaustive check together.
const tt4 = (s: Sheets): fcLib.IProperty<[string]> => {
  const pairs = tt4Build(s);
  return fcLib.property(fcLib.constantFrom("pairs", "sheet"), (which) => {
    if (which === "pairs") {
      if (fails(pairs)) throw new Error("a Pair_Registry pair is below its minimum");
      return true;
    }
    const v = tt4Check(s);
    if (v.length > 0) throw new Error(v.join("; "));
    return true;
  });
};

interface StaticSuite {
  property: string;
  list: readonly SheetSabotage[];
  build: (s: Sheets) => fcLib.IProperty<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const staticSuites: StaticSuite[] = [
  { property: "Property 4: contrast", list: TT4_SABOTAGES, build: tt4 },
  { property: "Property 5: banned looks", list: TT5_SABOTAGES, build: tt5 },
  { property: "Property 6: layout", list: TT6_SABOTAGES, build: tt6 },
  { property: "Property 7: motion", list: TT7_SABOTAGES, build: (s) => tt7(s, sources) },
  { property: "Property 8: focus", list: TT8_SABOTAGES, build: tt8 },
];
const fails = (p: fcLib.IProperty<any>): boolean => fcLib.check(p, { numRuns: 100, seed: FIXED_SEED }).failed; // eslint-disable-line @typescript-eslint/no-explicit-any

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

describe("toe-tag static sabotage checks (Properties 4 to 8)", () => {
  for (const s of staticSuites) {
    describe(s.property, () => {
      it("has a non-empty sabotage list", () => {
        expect(s.list.length).toBeGreaterThan(0);
      });

      it("the real files pass under the fixed seed", () => {
        expect(fails(s.build(sheets))).toBe(false);
      });

      for (const sab of s.list) {
        it(`catches sabotage "${sab.name}"`, () => {
          const mutated = sab.mutate(sheets);
          expect(mutated.tokens + mutated.rest, "the mutation changed nothing").not.toBe(sheets.tokens + sheets.rest);
          if (!fails(s.build(mutated))) throw new Error(`Sabotage "${sab.name}" stayed green for "${s.property}"`);
        });
      }
    });
  }

  it("Property 7 catches a view that schedules the swing in JavaScript", () => {
    const bad = { ...sources, "views/detail.ts": `${sources["views/detail.ts"]}\n${TT7_SOURCE_SABOTAGE}` };
    expect(fails(tt7(sheets, bad))).toBe(true);
  });

  it("every Banned_Look has at least one sabotage that Property 5 catches", () => {
    for (const look of ["look 1", "look 2", "look 3", "look 4", "look 5", "look 6"]) {
      expect(TT5_SABOTAGES.some((x) => x.target === look), look).toBe(true);
    }
  });
});
