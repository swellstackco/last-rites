import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CallSite } from "@graveyard-kit/skeleton/proof";
import { structuralEqual } from "@graveyard-kit/skeleton/proof/runner";
import { loadOracle } from "../oracles.js";
import { KEYS, cloneReordered, cloneWithOneChange, deepDiffRecipe, treeArb } from "./deep-diff.js";

const site = (over: Partial<CallSite> = {}): CallSite => ({
  file: "spec/a.spec.js",
  line: 1,
  column: 1,
  callee: "dd",
  member: "",
  argCount: 2,
  argTexts: ["a", "b"],
  enclosing: "test",
  consumedAs: "undefined-check",
  ...over,
});

const shape = deepDiffRecipe.shapes[0]!;
const dd = loadOracle("deep-diff")!.module as (a: unknown, b: unknown) => unknown;

describe("deep-diff recipe", () => {
  it("metadata", () => {
    expect(deepDiffRecipe.expectedVersion).toBe("1.0.2");
    expect(deepDiffRecipe.shapes).toHaveLength(1);
    expect(shape.member).toBe("");
    expect(shape.argCount).toBe(2);
    expect(shape.outputKind).toBe("opaque");
    expect(shape.orderSensitive).toBe(false);
    expect(shape.projection).toMatchObject({ name: "isUndefined", observes: "definedness" });
  });

  it("accepts requires consumedAs", () => {
    expect(shape.accepts(site())).toBe(true);
    expect(shape.accepts(site({ consumedAs: undefined }))).toBe(false);
    expect(shape.accepts(site({ argCount: 1 }))).toBe(false);
    expect(shape.accepts(site({ new: true }))).toBe(false);
    expect(shape.accepts(site({ argTexts: ["a", "...b"] }))).toBe(false);
    expect(shape.accepts(site({ member: "x" }))).toBe(false);
  });

  it("500 samples show both labels and pass guard", () => {
    const seen = new Set<string>();
    for (const args of fc.sample(shape.arbitrary, { numRuns: 500, seed: 20261113 })) {
      expect(shape.guard(args)).toBe(true);
      const value = dd(structuredClone(args[0]), structuredClone(args[1]));
      for (const l of shape.classify(args, { kind: "returned", value })) seen.add(l);
    }
    expect([...seen].sort()).toEqual(["equal-pair", "unequal-pair"]);
  });

  it("key order is shuffled in the equal family", () => {
    const r = cloneReordered({ a: 1, b: { x: 1, y: 2 } } as never) as Record<string, unknown>;
    expect(Object.keys(r)).toEqual(["b", "a"]);
    expect(Object.keys(r.b as object)).toEqual(["y", "x"]);
    expect(dd({ a: 1, b: { x: 1, y: 2 } }, r)).toBeUndefined();
  });

  it("a one-change clone is never deep equal to its source", () => {
    fc.assert(
      fc.property(treeArb, fc.nat(), treeArb, (t, pick, repl) => {
        const changed = cloneWithOneChange(t, pick, repl);
        expect(structuralEqual(t, changed)).toBe(false);
        expect(dd(structuredClone(t), structuredClone(changed))).not.toBeUndefined();
      }),
      { numRuns: 100, seed: 20261113 },
    );
  });

  it("uses the keys * and _id", () => {
    expect(KEYS).toContain("*");
    expect(KEYS).toContain("_id");
    let found = false;
    for (const t of fc.sample(treeArb, { numRuns: 300, seed: 1 })) {
      if (/"(\*|_id)":/.test(JSON.stringify(t))) found = true;
    }
    expect(found).toBe(true);
  });
});
