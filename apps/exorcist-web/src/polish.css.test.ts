// graveyard-ui-polish: static Stylesheet checks S1-S7 on the real Stylesheet (fix checking and preservation).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STYLE_FILES, checkStylesheet } from "./test-support/css-checks.js";
import type { Violation } from "./test-support/css-checks.js";

// Node built-ins are only allowed in test files, so the Stylesheet is read here.
const stylesheet = STYLE_FILES.map((f) => readFileSync(fileURLToPath(new URL(`./styles/${f}`, import.meta.url)), "utf8")).join("\n");
const violations = checkStylesheet(stylesheet);
const of = (check: string): Violation[] => violations.filter((v) => v.check === check);
const text = (list: Violation[]): string => list.map((v) => `${v.check}: ${v.message}`).join("\n");

describe("Stylesheet checks (graveyard-ui-polish)", () => {
  it("S1 container: .screen is a centered, guttered column and .app adds none", () => {
    expect(text(of("S1"))).toBe("");
  });
  it("S2 lists: layout lists have no bullets, prose lists keep theirs", () => {
    expect(text(of("S2"))).toBe("");
  });
  it("S3 arch: no gradient line, uniform border, no clipping ancestor", () => {
    expect(text(of("S3"))).toBe("");
  });
  it("S4 words: no mid-word breaks in short cells", () => {
    expect(text(of("S4"))).toBe("");
  });
  it("S5 footer: stacked footer draws one border", () => {
    expect(text(of("S5"))).toBe("");
  });
  it("S6 focus: one outline removal, only for focus that is not focus-visible", () => {
    expect(text(of("S6"))).toBe("");
  });
  it("S7 preserved rules still hold", () => {
    expect(text(of("S7"))).toBe("");
  });
});
