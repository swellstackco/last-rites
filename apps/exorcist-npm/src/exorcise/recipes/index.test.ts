import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { RECIPES } from "./index.js";

describe("RECIPES", () => {
  it("holds exactly the three hero packages, each under its own name", () => {
    expect(Object.keys(RECIPES).sort()).toEqual(["deep-diff", "intersect", "node-abort-controller"]);
    for (const [name, recipe] of Object.entries(RECIPES)) expect(recipe.package).toBe(name);
  });

  it("has unique shape ids across all recipes", () => {
    const ids = Object.values(RECIPES).flatMap((r) => r.shapes.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
  });

  it("argCount of every shape matches the length of its arbitrary's values", () => {
    for (const recipe of Object.values(RECIPES)) {
      for (const shape of recipe.shapes) {
        for (const args of fc.sample(shape.arbitrary, { numRuns: 100, seed: 7 })) {
          expect(args.length, shape.id).toBe(shape.argCount);
        }
      }
    }
  });

  it("node-abort-controller has no shape and no oracle", () => {
    const r = RECIPES["node-abort-controller"]!;
    expect(r.shapes).toEqual([]);
    expect(r.loadOracle).toBeUndefined();
  });

  it("intersect and deep-diff load their pinned oracle at the expected version", () => {
    for (const name of ["intersect", "deep-diff"]) {
      const r = RECIPES[name]!;
      expect(r.loadOracle?.()?.version).toBe(r.expectedVersion);
    }
  });
});
