import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assertProperty } from "../death-score/fc-runner.js";
import { compareSites, sortSites } from "./usage-surface.js";

const site = (file: string, line: number, column: number) => ({ file, line, column });

describe("compareSites", () => {
  it("orders by UTF-16 code unit, so B comes before a", () => {
    expect(compareSites(site("B", 1, 1), site("a", 1, 1))).toBeLessThan(0);
    expect(compareSites(site("a", 1, 1), site("B", 1, 1))).toBeGreaterThan(0);
  });
  it("orders line before column", () => {
    expect(compareSites(site("f", 1, 9), site("f", 2, 1))).toBeLessThan(0);
    expect(compareSites(site("f", 2, 1), site("f", 2, 5))).toBeLessThan(0);
  });
  it("is zero for equal positions", () => {
    expect(compareSites(site("f", 3, 4), site("f", 3, 4))).toBe(0);
  });
});

describe("Property: sortSites", () => {
  it("is a permutation, sorted and idempotent", () => {
    const arb = fc.array(
      fc.record({
        file: fc.constantFrom("a", "B", "src/x.js", "é", "a/b"),
        line: fc.integer({ min: 1, max: 4 }),
        column: fc.integer({ min: 1, max: 4 }),
        tag: fc.nat(),
      }),
      { maxLength: 20 },
    );
    assertProperty(
      "sortSites",
      fc.property(arb, (sites) => {
        const copy = sites.map((s) => ({ ...s }));
        const sorted = sortSites(sites);
        expect(sites).toEqual(copy); // input untouched
        const key = (s: { tag: number; file: string; line: number; column: number }) => JSON.stringify(s);
        expect(sorted.map(key).sort()).toEqual(sites.map(key).sort());
        for (let i = 1; i < sorted.length; i++) expect(compareSites(sorted[i - 1]!, sorted[i]!)).toBeLessThanOrEqual(0);
        expect(sortSites(sorted)).toEqual(sorted);
      }),
    );
  });
});
