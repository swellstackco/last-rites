// toe-tag-polish: static Stylesheet checks (checkToePolish) on the real Stylesheet, one named group per defect.
// Node environment (reads the Stylesheet files). Groups are added by later tasks (S-T6, S-T7).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TP5_SABOTAGES } from "./test-support/sabotage/tp5.js";
import { STYLE_FILES, checkToePolish } from "./test-support/css-checks.js";
import type { Violation } from "./test-support/css-checks.js";

const stylesheet = STYLE_FILES.map((f) => readFileSync(fileURLToPath(new URL(`./styles/${f}`, import.meta.url)), "utf8")).join("\n");
const violations = checkToePolish(stylesheet);
const of = (check: string): string => violations.filter((v: Violation) => v.check === check).map((v) => `${v.check}: ${v.message}`).join("\n");

describe("toe-tag-polish Stylesheet", () => {
  it("T2 band: the Band spans the tag, grade word left, fact right, colored by grade", () => {
    expect(of("S-T2")).toBe("");
  });
  it("T3 fields: every field is left-aligned and closed by a Field_Line", () => {
    expect(of("S-T3")).toBe("");
  });
  it("T4 subtitle: Subtitle_Phrases never wrap, except the first one below 22.4375rem", () => {
    expect(of("S-T4")).toBe("");
  });
  it("T5 hang: Demo_Cards hang from a string with a two-sided chamfer and a Dead_Count rule", () => {
    expect(of("S-T5")).toBe("");
  });
});

describe("toe-tag-polish Stylesheet sabotage (TP5)", () => {
  it("the real Stylesheet has no violations", () => {
    expect(violations).toEqual([]);
  });
  for (const s of TP5_SABOTAGES) {
    it(`catches ${s.name}`, () => {
      const mutated = s.mutate(stylesheet);
      expect(mutated).not.toBe(stylesheet);
      const caught = checkToePolish(mutated).filter((v) => v.check === s.check);
      if (caught.length === 0) throw new Error(`Sabotage "${s.name}" stayed green for "${s.check}"`);
    });
  }
});
