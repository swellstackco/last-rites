import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { assertProperty } from "@graveyard-kit/skeleton/graveyard/testing";
import { describe, expect, it } from "vitest";
import { contrastRatio, hueOf, lightnessOf, parseHex, saturationOf, type Rgb } from "./contrast.js";

const read = (name: string): string => readFileSync(fileURLToPath(new URL(`../styles/${name}`, import.meta.url)), "utf8");
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

const tokensCss = stripComments(read("tokens.css"));
const allCss = ["tokens.css", "base.css", "graveyard.css", "detail.css"].map((f) => stripComments(read(f))).join("\n");

function tokenMap(css: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) map.set(m[1] as string, (m[2] as string).trim());
  return map;
}
const tokens = tokenMap(tokensCss);
const color = (name: string): Rgb => {
  const v = tokens.get(name);
  if (!v) throw new Error(`missing token ${name}`);
  return parseHex(v);
};

const GROUNDS = ["--night", "--soil", "--stone"];
const TEXT = ["--moon", "--mist", "--ember", "--amber", "--lichen", "--moss", "--link", "--focus"];

describe("contrast math", () => {
  it("black on white is 21, symmetric, at least 1", () => {
    const black = parseHex("#000");
    const white = parseHex("#ffffff");
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBe(1);
  });

  it("parseHex rejects non-hex input", () => {
    expect(() => parseHex("red")).toThrow();
  });

  it("property: symmetric and within [1, 21]", () => {
    const rgb = fc.tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }));
    assertProperty(
      "contrastRatio symmetric and bounded",
      fc.property(rgb, rgb, (a, b) => {
        const ab = contrastRatio(a, b);
        return ab === contrastRatio(b, a) && ab >= 1 && ab <= 21 + 1e-9;
      }),
    );
  });
});

describe("tokens.css", () => {
  it("declares dark color scheme", () => {
    expect(tokensCss).toMatch(/color-scheme:\s*dark/);
  });

  it("text tokens reach 4.5:1 on every ground", () => {
    for (const t of TEXT) {
      for (const g of GROUNDS) {
        expect(contrastRatio(color(t), color(g)), `${t} on ${g}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("focus ring and edge reach 3:1 on every ground", () => {
    for (const t of ["--focus", "--edge"]) {
      for (const g of GROUNDS) {
        expect(contrastRatio(color(t), color(g)), `${t} on ${g}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("no saturated color has a purple-ish hue (250 to 335)", () => {
    for (const [name, value] of tokens) {
      if (!/^#[0-9a-f]{3,6}$/i.test(value)) continue;
      const rgb = parseHex(value);
      if (saturationOf(rgb) > 0.15) {
        const hue = hueOf(rgb);
        expect(hue < 250 || hue > 335, `${name} hue ${hue}`).toBe(true);
      }
    }
  });

  it("backgrounds are dark (lightness below 25%)", () => {
    for (const g of GROUNDS) expect(lightnessOf(color(g)), g).toBeLessThan(0.25);
  });

  it("font stacks contain no serif family", () => {
    for (const name of ["--font-ui", "--font-num"]) {
      const families = (tokens.get(name) ?? "").split(",").map((f) => f.trim().replace(/^["']|["']$/g, "").toLowerCase());
      expect(families.length).toBeGreaterThan(0);
      for (const f of families) {
        expect(f).not.toBe("serif");
        expect(f).not.toMatch(/georgia|times|garamond|palatino|cambria|book antiqua/);
      }
      expect(families.at(-1)).toMatch(/^(sans-serif|monospace)$/);
    }
  });
});

// ---- CSS text checks (task 6.7) ----

interface Decl {
  prop: string;
  value: string;
  preludes: string[];
}

/** Every declaration with the at-rule/selector preludes that enclose it. */
function declarations(css: string): Decl[] {
  const out: Decl[] = [];
  const stack: string[] = [];
  let pending = "";
  const flush = (): void => {
    const text = pending.trim();
    pending = "";
    const m = /^([a-z-]+|--[a-z0-9-]+)\s*:\s*([\s\S]+)$/i.exec(text);
    if (m) out.push({ prop: (m[1] as string).toLowerCase(), value: (m[2] as string).trim(), preludes: [...stack] });
  };
  for (const ch of css) {
    if (ch === "{") {
      stack.push(pending.trim());
      pending = "";
    } else if (ch === "}") {
      flush();
      stack.pop();
    } else if (ch === ";") {
      flush();
    } else {
      pending += ch;
    }
  }
  return out;
}

const decls = declarations(allCss);
const inNoPreference = (d: Decl): boolean => d.preludes.some((p) => /prefers-reduced-motion:\s*no-preference/.test(p));

describe("CSS text checks", () => {
  it("parses declarations (sanity)", () => {
    expect(decls.length).toBeGreaterThan(100);
  });

  it("every animation, transition and smooth scroll sits in a no-preference block", () => {
    const motion = decls.filter(
      (d) => /^(animation|transition)(-[a-z-]+)?$/.test(d.prop) || (d.prop === "scroll-behavior" && /smooth/.test(d.value)),
    );
    expect(motion.length).toBeGreaterThan(0);
    for (const d of motion) expect(inNoPreference(d), `${d.prop}: ${d.value}`).toBe(true);
  });

  it("never removes an outline without a :focus-visible replacement", () => {
    const removals = decls.filter((d) => d.prop === "outline" && /^(none|0)\b/.test(d.value));
    if (removals.length > 0) {
      const replacement = decls.some((d) => d.prop === "outline" && d.preludes.some((p) => p.includes(":focus-visible")) && !/^(none|0)\b/.test(d.value));
      expect(replacement).toBe(true);
    }
    const ring = decls.find((d) => d.prop === "outline" && d.preludes.some((p) => p.includes(":focus-visible")));
    expect(ring?.value).toContain("var(--ring-width)");
    expect(ring?.value).toContain("var(--focus)");
  });

  it("has the layout-safety rules", () => {
    expect(decls.some((d) => d.prop === "min-width" && d.value === "0")).toBe(true);
    expect(decls.some((d) => d.prop === "overflow-wrap" && d.value === "anywhere")).toBe(true);
    expect(tokens.get("--target")).toBe("44px");
    expect(decls.some((d) => d.prop === "min-height" && d.value === "var(--target)")).toBe(true);
    expect(allCss).toMatch(/@media\s*\(forced-colors:\s*active\)/);
  });

  it("has the recording sizes (18px at 1200px and up, 56px score)", () => {
    expect(decls.some((d) => d.prop === "font-size" && d.value === "18px" && d.preludes.some((p) => /min-width:\s*1200px/.test(p)))).toBe(true);
    expect(decls.some((d) => d.prop === "font-size" && d.value === "56px")).toBe(true);
  });

  it("loads nothing remote", () => {
    expect(allCss).not.toMatch(/url\(\s*["']?\s*(https?:)?\/\//i);
    expect(allCss).not.toMatch(/@import/i);
  });
});
