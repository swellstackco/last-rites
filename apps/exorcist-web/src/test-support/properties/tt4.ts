// Property 4 (toe-tag-redesign): contrast meets WCAG AA, computed from tokens.css, and the Stylesheet only combines
// tokens that the Pair_Registry lists. Pure text analysis (Node); `check` takes CSS text so sabotages can mutate it.
import fc from "fast-check";
import { declarations, stripComments } from "../../theme/css-parse.js";
import type { Decl } from "../../theme/css-parse.js";
import { DECORATIVE_TOKENS, PAIRS, SURFACES, hasPair, isRegisteredFg, pairRatio } from "../../theme/pairs.js";
import type { ColorPair } from "../../theme/pairs.js";

const LEGACY = ["--night", "--soil", "--stone", "--moon", "--mist", "--ember", "--lichen", "--moss", "--edge", "--link", "--font-ui", "--font-num"];
const NAMED_COLORS = /\b(red|blue|green|white|black|gray|grey|orange|purple|pink|yellow|brown|navy|teal|silver|cream|ivory|beige|tan)\b/i;
const BAND_SELECTOR = /tag-band|band/;

export interface Sheets {
  tokens: string;
  rest: string;
}

/** Builds Sheets from a reader of files under src/styles (tests supply the reader, so this file needs no Node built-in). */
export function sheetsFrom(read: (name: string) => string): Sheets {
  return { tokens: read("tokens.css"), rest: ["base.css", "graveyard.css", "detail.css", "fonts.css"].map(read).join("\n") };
}

export function tokenMap(tokensCss: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of stripComments(tokensCss).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) map.set(m[1] as string, (m[2] as string).trim());
  return map;
}

const isColorValue = (v: string): boolean => /^#[0-9a-f]{3,8}$/i.test(v) || /^(rgba?|hsla?)\(/i.test(v);
export const colorTokens = (tokens: Map<string, string>): string[] => [...tokens].filter(([, v]) => isColorValue(v)).map(([k]) => k);

/** Groups consecutive declarations of one rule. */
export interface Rule {
  selector: string;
  decls: Decl[];
}
export function rulesOf(css: string): Rule[] {
  const rules: Rule[] = [];
  let key = "";
  for (const d of declarations(stripComments(css))) {
    const k = JSON.stringify(d.preludes);
    const last = rules[rules.length - 1];
    if (last && k === key) last.decls.push(d);
    else rules.push({ selector: (d.preludes[d.preludes.length - 1] ?? "").replace(/\s+/g, " "), decls: [d] });
    key = k;
  }
  return rules;
}

const plainVar = (v: string): string | null => /^var\((--[a-z0-9-]+)\)$/i.exec(v.trim())?.[1] ?? null;

/** Violations of one rule against the registry. */
export function ruleViolations(rule: Rule): string[] {
  const out: string[] = [];
  const colorDecl = rule.decls.find((d) => d.prop === "color");
  const fg = colorDecl ? plainVar(colorDecl.value) : null;
  if (fg === null) return out;
  if (fg === "--red") out.push(`${rule.selector}: --red used as a text color (use --red-ink)`);
  if (fg === "--steel" && !BAND_SELECTOR.test(rule.selector)) out.push(`${rule.selector}: --steel used as a text color outside a Band (use --steel-ink)`);
  const bgDecl = rule.decls.find((d) => d.prop === "background" || d.prop === "background-color");
  const bg = (bgDecl ? plainVar(bgDecl.value) : null) ?? SURFACES[rule.selector] ?? null;
  if (bg !== null) {
    if (!hasPair(fg, bg)) out.push(`${rule.selector}: ${fg} on ${bg} is not in the Pair_Registry`);
  } else if (!isRegisteredFg(fg)) {
    out.push(`${rule.selector}: ${fg} is not a registered text color`);
  }
  return out;
}

/** Whole-sheet checks that are not about one pair or one rule. */
export function sheetViolations({ tokens: tokensCss, rest }: Sheets): string[] {
  const out: string[] = [];
  const tokens = tokenMap(tokensCss);
  const restClean = stripComments(rest);

  for (const t of colorTokens(tokens)) {
    if (DECORATIVE_TOKENS.includes(t)) continue;
    if (!PAIRS.some((p) => p.fg === t || p.bg === t)) out.push(`color token ${t} is in no pair and is not decorative`);
  }
  if (tokens.get("--focus") !== tokens.get("--ink")) out.push("--focus does not equal --ink");

  const defined = new Set<string>(tokens.keys());
  const restDecls = declarations(restClean);
  for (const d of restDecls) if (d.prop.startsWith("--")) defined.add(d.prop);
  for (const m of restClean.matchAll(/var\((--[a-z0-9-]+)/gi)) {
    if (!defined.has(m[1] as string)) out.push(`var(${m[1]}) has no definition`);
  }
  for (const name of LEGACY) {
    if (tokens.has(name) || new RegExp(`${name}(?![a-z0-9-])`).test(restClean)) out.push(`legacy token ${name}`);
  }
  for (const d of restDecls) {
    if (d.prop.startsWith("--") || d.prop === "src" || d.prop === "unicode-range") continue;
    if (/#[0-9a-f]{3,8}\b/i.test(d.value) || /\b(rgba?|hsla?)\(/i.test(d.value)) out.push(`${d.preludes.join(" ")}: color literal in ${d.prop}`);
    if (/color|background|border|outline|shadow/.test(d.prop) && NAMED_COLORS.test(d.value.replace(/var\([^)]*\)/g, ""))) {
      out.push(`${d.preludes.join(" ")}: named color in ${d.prop}`);
    }
  }
  for (const r of rulesOf(rest)) {
    out.push(...ruleViolations(r));
    // Band colors travel through custom properties; the pair is (--band-text on --band-color).
    const text = r.decls.find((d) => d.prop === "--band-text");
    const color = r.decls.find((d) => d.prop === "--band-color");
    const fg = text ? plainVar(text.value) : null;
    const bg = color ? plainVar(color.value) : null;
    if (fg && bg && !hasPair(fg, bg)) out.push(`${r.selector}: Band text ${fg} on ${bg} is not in the Pair_Registry`);
  }
  return out;
}

export function pairViolation(tokens: Map<string, string>, p: ColorPair): string | null {
  const ratio = pairRatio(tokens, p);
  return ratio >= p.min ? null : `${p.id}: ${p.fg} on ${p.bg} is ${ratio.toFixed(2)}, needs ${p.min}`;
}

export class TT4Failure extends Error {}

/** Property 4: any pair drawn from the registry meets its minimum. `sheets` defaults to the real Stylesheet. */
export function build(sheets: Sheets) {
  const tokens = tokenMap(sheets.tokens);
  return fc.property(fc.constantFrom(...PAIRS), (p) => {
    const v = pairViolation(tokens, p);
    if (v) throw new TT4Failure(v);
    return true;
  });
}

/** Exhaustive companion: every pair, plus the sheet-wide checks. Returns all violations. */
export function check(sheets: Sheets): string[] {
  const tokens = tokenMap(sheets.tokens);
  const out: string[] = [];
  for (const p of PAIRS) {
    try {
      const v = pairViolation(tokens, p);
      if (v) out.push(v);
    } catch (e) {
      out.push(e instanceof Error ? e.message : String(e));
    }
  }
  out.push(...sheetViolations(sheets));
  return out;
}
