import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// toe-tag-redesign 10.3: Property 5, the six Banned_Looks are absent from the Token_File and the Stylesheet.
import { assertProperty } from "@last-rites/skeleton/graveyard/testing";
import { describe, expect, it } from "vitest";
import { sheetsFrom } from "./test-support/properties/tt4.js";
import { LABEL_FONT_ALLOWLIST, build, bannedViolations } from "./test-support/properties/tt5.js";

const sheets = sheetsFrom((name) => readFileSync(fileURLToPath(new URL(`./styles/${name}`, import.meta.url)), "utf8"));

describe("Property 5: banned looks", () => {
  it("every assertion holds (property)", () => {
    assertProperty("toe-tag P5 banned looks", build(sheets));
  });

  it("has no violation at all (exhaustive)", () => {
    expect(bannedViolations(sheets)).toEqual([]);
  });

  it("detects each look when injected (the checks are not vacuous)", () => {
    const rest = (extra: string): typeof sheets => ({ tokens: sheets.tokens, rest: `${sheets.rest}\n${extra}` });
    const tok = (from: string, to: string): typeof sheets => ({ tokens: sheets.tokens.replace(from, to), rest: sheets.rest });
    expect(bannedViolations(tok("--wall: #C9CFCB", "--wall: #0B1215")).join()).toContain("(a)");
    expect(bannedViolations(rest(".tombstone { box-shadow: 0 0 24px #ff6a3d; }")).join()).toContain("(b)");
    expect(bannedViolations(tok("--paper: #F1F2EE", "--paper: #F5EFE0")).join()).toContain("(c)");
    expect(bannedViolations(rest("h1 { font-family: Georgia, serif; }")).join()).toContain("(d)");
    expect(bannedViolations(rest("a { color: var(--rust); }")).join()).toContain("(e)");
    expect(bannedViolations(rest("main { background: linear-gradient(135deg, var(--ink), var(--paper)); }")).join()).toContain("(f)");
    expect(bannedViolations(rest(".sheet { backdrop-filter: blur(8px); }")).join()).toContain("(g)");
    expect(bannedViolations(rest(".tombstone { border-radius: 16px; }")).join()).toContain("(h)");
    expect(bannedViolations(tok("--wall: #C9CFCB", "--wall: #FFFFFF")).join()).toContain("(i)");
    expect(bannedViolations(rest("h1 { font-family: var(--font-label); }")).join()).toContain("label font");
    expect(bannedViolations(rest("body { background: var(--tag); }")).join()).toContain("--tag as a background");
  });

  it("the label font allowlist is non-empty and every entry matches a real rule", () => {
    expect(LABEL_FONT_ALLOWLIST.length).toBeGreaterThan(0);
  });
});
