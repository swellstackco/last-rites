// graveyard-ui-polish 6.1: the closed ClassName vocabulary and the code/CSS that use it stay in sync.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = (rel: string): string => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const read = (rel: string): string => readFileSync(src(rel), "utf8");
const tsIn = (dir: string): string[] =>
  readdirSync(src(dir)).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => read(`${dir}/${f}`));

const hSource = read("dom/h.ts");
const union = /export type ClassName =([\s\S]*?);/.exec(hSource)?.[1] ?? "";
const vocabulary = new Set([...union.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1] as string));
const codeSources = [...tsIn("views"), ...tsIn("app")];
const css = ["tokens.css", "base.css", "graveyard.css", "detail.css"].map((f) => read(`styles/${f}`)).join("\n");
const cssClasses = new Set([...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1] as string));

/** Class names written as literals in `class:` props of the views and the controller. */
function usedInCode(): Set<string> {
  const used = new Set<string>();
  for (const code of codeSources) {
    for (const m of code.matchAll(/class:\s*(\[[^\]]*\]|"[^"]+")/g)) {
      for (const n of (m[1] as string).matchAll(/"([a-z0-9-]+)"/g)) used.add(n[1] as string);
    }
  }
  return used;
}

describe("class vocabulary", () => {
  it("parses a non-trivial vocabulary", () => {
    expect(vocabulary.size).toBeGreaterThan(50);
  });

  it("every class a view or the controller writes is in ClassName", () => {
    const unknown = [...usedInCode()].filter((n) => !vocabulary.has(n));
    expect(unknown).toEqual([]);
  });

  it("every ClassName is used by a view, the controller or the Stylesheet", () => {
    const text = codeSources.join("\n");
    const unused = [...vocabulary].filter((n) => !usedInCode().has(n) && !cssClasses.has(n) && !text.includes(`"${n}"`));
    // Unused before graveyard-ui-polish; left alone (out of scope). Any other unused name fails.
    expect(unused.sort()).toEqual(["btn-quiet", "fog"]);
  });

  it("the new polish names are in the vocabulary and used by a view and the Stylesheet", () => {
    for (const n of ["col-signal", "col-value", "col-status", "col-points", "col-source", "total-label"]) {
      expect(vocabulary.has(n), `${n} in ClassName`).toBe(true);
      expect(usedInCode().has(n), `${n} in a view`).toBe(true);
      expect(cssClasses.has(n), `${n} in the Stylesheet`).toBe(true);
    }
  });

  it("tomb-label is gone from ClassName, the views and the Stylesheet", () => {
    expect(vocabulary.has("tomb-label")).toBe(false);
    expect(codeSources.join("\n")).not.toContain("tomb-label");
    expect(cssClasses.has("tomb-label")).toBe(false);
  });
});
