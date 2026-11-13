import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { globMatch, pushCapabilities, writeCapabilities } from "./index.js";

const load = (f: string) => JSON.parse(readFileSync(new URL(`./__fixtures__/agents/${f}`, import.meta.url), "utf8"));
const coroner = load("coroner-base.json");
const exorcist = load("exorcist-base.json");

const withRule = (a: any, rule: object) => ({ ...a, permissions: { rules: [...a.permissions.rules, rule] } }); // eslint-disable-line @typescript-eslint/no-explicit-any

describe("writeCapabilities", () => {
  it("a read-only agent has none", () => {
    expect(writeCapabilities(coroner)).toEqual([]);
  });

  it("each grant alone gives its reason", () => {
    expect(writeCapabilities({ ...coroner, tools: [...coroner.tools, "@exorcist"] })).toContain("tools: @exorcist");
    expect(writeCapabilities({ ...coroner, tools: [...coroner.tools, "shell"] })).toEqual(["tools: shell"]);
    expect(writeCapabilities(withRule(coroner, { capability: "fs_write", effect: "ask" }))).toEqual(["rule: ask fs_write"]);
    expect(writeCapabilities(withRule(coroner, { capability: "mcp", effect: "allow", match: ["exorcist/*"] }))).toEqual([
      "rule: allow mcp exorcist/*",
    ]);
  });

  it("exorcist/* and exorcist/generate_pin_tests allow rules are flagged", () => {
    expect(writeCapabilities(withRule(coroner, { capability: "mcp", effect: "allow", match: ["exorcist/generate_pin_tests"] }))).toHaveLength(1);
    expect(writeCapabilities(exorcist).length).toBeGreaterThan(0);
  });

  it("is total on junk", () => {
    for (const j of [null, 5, "x", [], {}, { tools: 5, permissions: { rules: "x" } }]) {
      expect(() => writeCapabilities(j)).not.toThrow();
    }
  });
});

describe("pushCapabilities", () => {
  it("the base cannot push, and the read-only agent cannot either", () => {
    expect(pushCapabilities(exorcist)).toBe(false);
    expect(pushCapabilities(coroner)).toBe(false);
  });

  it("a deny after the git * allow, or no deny at all, can push", () => {
    const [deny, ...rest] = exorcist.permissions.rules;
    expect(pushCapabilities({ ...exorcist, permissions: { rules: [...rest, deny] } })).toBe(true);
    expect(pushCapabilities({ ...exorcist, permissions: { rules: rest } })).toBe(true);
  });
});

describe("globMatch", () => {
  it("matches the documented shapes", () => {
    expect(globMatch("git push*", "git push origin x")).toBe(true);
    expect(globMatch("git push*", "git pushx")).toBe(true);
    expect(globMatch("git push origin x", "git pushx")).toBe(false);
    expect(globMatch("npm *", "npm")).toBe(false);
    expect(globMatch("npm *", "npm test")).toBe(true);
    expect(globMatch("a.b", "axb")).toBe(false);
  });
});
