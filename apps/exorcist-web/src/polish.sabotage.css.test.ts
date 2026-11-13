// graveyard-ui-polish: CSS sabotage checks. Every mutation really changes the text and is caught by the named
// check of checkStylesheet; the real Stylesheet passes. Node environment (reads the Stylesheet files).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STYLE_FILES, checkStylesheet } from "./test-support/css-checks.js";
import { CSS_SABOTAGES } from "./test-support/sabotage/css.js";

const stylesheet = STYLE_FILES.map((f) => readFileSync(fileURLToPath(new URL(`./styles/${f}`, import.meta.url)), "utf8")).join("\n");

describe("CSS sabotage checks (graveyard-ui-polish)", () => {
  it("has all thirteen mutations (k)-(w)", () => {
    expect(CSS_SABOTAGES.map((s) => s.name.slice(0, 3))).toEqual(["(k)", "(l)", "(m)", "(n)", "(o)", "(p)", "(q)", "(r)", "(s)", "(t)", "(u)", "(w)", "(v)"]);
  });

  it("the real Stylesheet passes", () => {
    expect(checkStylesheet(stylesheet)).toEqual([]);
  });

  for (const s of CSS_SABOTAGES) {
    it(`catches ${s.name}`, () => {
      const mutated = s.mutate(stylesheet);
      expect(mutated).not.toBe(stylesheet);
      const violations = checkStylesheet(mutated).filter((v) => v.check === s.check);
      if (violations.length === 0) throw new Error(`Sabotage "${s.name}" stayed green for "${s.check}"`);
      console.log(`[css sabotage: ${s.name}] caught by ${s.check}: ${violations[0]!.message}`);
    });
  }
});
