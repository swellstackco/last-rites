import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// toe-tag-redesign 10.4: Property 6, narrow-viewport layout rules from the Stylesheet text.
import { assertProperty } from "@graveyard-kit/skeleton/graveyard/testing";
import { describe, expect, it } from "vitest";
import { sheetsFrom } from "./test-support/properties/tt4.js";
import { build, layoutViolations } from "./test-support/properties/tt6.js";

const sheets = sheetsFrom((name) => readFileSync(fileURLToPath(new URL(`./styles/${name}`, import.meta.url)), "utf8"));
const mutate = (from: string | RegExp, to: string): typeof sheets => {
  const rest = sheets.rest.replace(from, to);
  expect(rest, `mutation ${String(from)} changed nothing`).not.toBe(sheets.rest);
  return { tokens: sheets.tokens, rest };
};

describe("Property 6: layout rules", () => {
  it("every rule group holds (property)", () => {
    assertProperty("toe-tag P6 layout", build(sheets));
  });

  it("has no violation at all (exhaustive)", () => {
    expect(layoutViolations(sheets)).toEqual([]);
  });

  it("detects broken layouts (the checks are not vacuous)", () => {
    const v = (s: typeof sheets): string => layoutViolations(s).join("\n");
    expect(v(mutate(/\.tomb-name,\s*\.tomb-summary,\s*dd \{\s*overflow-wrap: anywhere;/, ".tomb-name, .tomb-summary, dd {"))).toContain("[wrap] dd");
    expect(v(mutate(".tombstone {", ".tombstone { min-width: 400px;"))).toContain("[width]");
    expect(v(mutate(/\.grid \{\s*([^}]*?)grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, ".grid { $1grid-template-columns: repeat(4, 1fr)"))).toContain("[grid]");
    expect(v(mutate(".proof-pre {", ".proof-pre { white-space: pre;"))).toContain("[wrap]");
    expect(v(mutate("max-width: calc(100% - 2rem)", "max-width: 100%"))).toContain("[sheet-tag]");
  });
});
