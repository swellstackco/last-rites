import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CallSite } from "@graveyard-kit/skeleton/proof";
import type { Outcome } from "@graveyard-kit/skeleton/proof/runner";
import { loadOracle } from "../oracles.js";
import { intersectRecipe } from "./intersect.js";

const site = (over: Partial<CallSite> = {}): CallSite => ({
  file: "src/a.js",
  line: 1,
  column: 1,
  callee: "intersect",
  member: "",
  argCount: 1,
  argTexts: ["ids"],
  enclosing: "src",
  ...over,
});

const [plain, big] = intersectRecipe.shapes;
type Fn = ((...a: unknown[]) => unknown) & { big: (...a: unknown[]) => unknown };
const oracle = loadOracle("intersect")!.module as Fn;

describe("intersect recipe", () => {
  it("declares two shapes with the required metadata", () => {
    expect(intersectRecipe.expectedVersion).toBe("1.0.1");
    for (const s of intersectRecipe.shapes) {
      expect(s.argCount).toBe(1);
      expect(s.outputKind).toBe("array");
      expect(s.orderSensitive).toBe(false);
      expect(s.projection.name).toBe("identity");
      expect(s.projection.observes).toBe("value");
    }
  });

  it("accepts only matching call sites", () => {
    expect(plain!.accepts(site())).toBe(true);
    expect(plain!.accepts(site({ member: "big" }))).toBe(false);
    expect(big!.accepts(site({ member: "big" }))).toBe(true);
    expect(big!.accepts(site({ member: "big", argCount: 2 }))).toBe(false);
    expect(plain!.accepts(site({ new: true }))).toBe(false);
    expect(plain!.accepts(site({ argTexts: ["...ids"] }))).toBe(false);
  });

  it("500 samples show every required label and pass guard", () => {
    for (const s of intersectRecipe.shapes) {
      const seen = new Set<string>();
      for (const args of fc.sample(s.arbitrary, { numRuns: 500, seed: 20261113 })) {
        expect(s.guard(args)).toBe(true);
        const fn = s.member === "" ? oracle : oracle.big;
        const out: Outcome = { kind: "returned", value: fn.apply(s.member === "" ? undefined : oracle, structuredClone(args)) };
        for (const l of s.classify(args, out)) seen.add(l);
      }
      for (const l of s.requiredLabels) expect(seen.has(l), `${s.id}: ${l}`).toBe(true);
    }
  });

  it("guard rejects wrong shapes", () => {
    expect(plain!.guard([])).toBe(false);
    expect(plain!.guard([[[1]]])).toBe(false);
    expect(plain!.guard([[["a"]]])).toBe(true);
  });

  it("a Set-based function differs from the oracle on a repeated last-list element", () => {
    const viaSet = (lists: string[][]): string[] => {
      const [first = [], ...rest] = lists;
      return [...new Set(first)].filter((x) => rest.every((l) => l.includes(x)));
    };
    const input = [["x"], ["x", "x"]];
    expect(oracle(structuredClone(input))).toEqual(["x", "x"]);
    expect(viaSet(input)).toEqual(["x"]);
  });

  it("an order-preserving corrected function agrees", () => {
    const corrected = (lists: string[][]): string[] => {
      if (lists.length === 0) return [];
      const last = lists[lists.length - 1]!;
      return last.filter((x) => lists.every((l) => l.includes(x)));
    };
    const input = [["x", "y"], ["x", "x"]];
    expect(corrected(input)).toEqual(oracle(structuredClone(input)));
  });
});
