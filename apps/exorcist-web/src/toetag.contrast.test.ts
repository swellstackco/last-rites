import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// toe-tag-redesign 10.1 / 10.2: Property 4, contrast from the tokens and registry-only color pairs in the Stylesheet.
import { assertProperty } from "@last-rites/skeleton/graveyard/testing";
import { describe, expect, it } from "vitest";
import { PAIRS, pairRatio } from "./theme/pairs.js";
import { build, check, rulesOf, sheetsFrom, tokenMap } from "./test-support/properties/tt4.js";

const sheets = sheetsFrom((name) => readFileSync(fileURLToPath(new URL(`./styles/${name}`, import.meta.url)), "utf8"));
const tokens = tokenMap(sheets.tokens);

describe("Property 4: contrast", () => {
  it("every pair drawn from the Pair_Registry meets its minimum", () => {
    assertProperty("toe-tag P4 contrast", build(sheets));
  });

  it("every pair, exhaustively, and every Stylesheet check, has no violation", () => {
    expect(check(sheets)).toEqual([]);
  });

  it("the registry is non-empty with unique ids", () => {
    expect(PAIRS.length).toBeGreaterThan(20);
    expect(new Set(PAIRS.map((p) => p.id)).size).toBe(PAIRS.length);
  });

  it("the Stylesheet really has rules with color pairs (the scan is not vacuous)", () => {
    const withColor = rulesOf(sheets.rest).filter((r) => r.decls.some((d) => d.prop === "color"));
    expect(withColor.length).toBeGreaterThan(40);
  });

  it("matches the ratios of design.md", () => {
    const ratio = (id: string): number => pairRatio(tokens, PAIRS.find((p) => p.id === id)!);
    const table: [string, number][] = [
      ["body-wall", 10.07],
      ["body-tag", 10.94],
      ["body-paper", 14.17],
      ["body-grid", 12.65],
      ["body-hot", 12.43],
      ["soft-wall", 6.05],
      ["soft-tag", 6.57],
      ["soft-paper", 8.51],
      ["soft-grid", 7.6],
      ["link-wall", 5.89],
      ["link-paper", 8.29],
      ["err-wall", 4.62],
      ["err-paper", 6.5],
      ["band-red", 5.75],
      ["band-steel", 7.05],
      ["band-amber", 4.9],
      ["bar-paper", 14.17],
    ];
    for (const [id, expected] of table) expect(ratio(id), id).toBeCloseTo(expected, 1);
    expect(ratio("band-rust")).toBeGreaterThanOrEqual(4.5);
  });

  it("the AILING Band carries Ink text and links use --steel-ink", () => {
    expect(PAIRS.some((p) => p.id === "band-amber" && p.fg === "--ink" && p.bg === "--amber")).toBe(true);
    expect(PAIRS.some((p) => p.fg === "--on-band" && p.bg === "--amber")).toBe(false);
    const linkRules = rulesOf(sheets.rest).filter((r) => /^(a|\.breakdown a)$/.test(r.selector));
    expect(linkRules.length).toBeGreaterThan(0);
    for (const r of linkRules) expect(r.decls.find((d) => d.prop === "color" && d.value !== "var(--ink)")?.value).toBe("var(--steel-ink)");
  });
});
