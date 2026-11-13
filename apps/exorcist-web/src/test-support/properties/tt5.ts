// Property 5 (toe-tag-redesign): the six Banned_Looks are absent. Static analysis of the Token_File and the Stylesheet
// (assertions (a) to (i) of Requirement 18.1, the label-font allowlist, and Manila-as-background only on tag objects).
import fc from "fast-check";
import { hueOf, lightnessOf, parseHex, saturationOf } from "../../theme/contrast.js";
import { rulesOf, tokenMap } from "./tt4.js";
import type { Rule, Sheets } from "./tt4.js";

export class TT5Failure extends Error {}

const SERIF = new Set(["serif", "georgia", "times", "times new roman", "garamond", "palatino", "baskerville", "cambria", "didot", "playfair display", "merriweather"]);
const HEADING = /(^|[\s>+~,])(h1|h2|h3|\.wordmark|\.tomb-score)$/;
/** Selectors that may use the label font (Tag_Label, Form_Grid labels, Compare_Box captions, subtitle, field labels). */
export const LABEL_FONT_ALLOWLIST: readonly RegExp[] = [
  /^\.form-subtitle$/,
  /^\.tag-label$/,
  /^\.field > label$/,
  /^\.skipped > summary$/,
  /^\.breakdown thead th$/,
  /^\.calibration-label$/,
  /^\.breakdown td\[data-label\]::before$/,
  /^\.proof-attempts \.stack > \.muted:first-child$/,
];
const TAG_BACKGROUND_SELECTORS = /tombstone|sheet-tag|demo-card/;
const BOX_SELECTORS = [".sheet", ".breakdown", ".proof", ".live-form", ".notice"];

const parts = (selector: string): string[] => selector.split(",").map((s) => s.trim());

function shadowBlur(layer: string): number {
  const bare = layer
    .replace(/var\([^)]*\)/g, " ")
    .replace(/(rgba?|hsla?)\([^)]*\)/gi, " ")
    .replace(/#[0-9a-f]{3,8}\b/gi, " ")
    .replace(/\binset\b/g, " ");
  const lengths = bare.match(/-?\d*\.?\d+(?:px|rem|em)?/g) ?? [];
  return lengths.length >= 3 ? Math.abs(parseFloat(lengths[2] as string)) : 0;
}

function topLevelSplit(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const fontEntries = (stack: string): string[] => topLevelSplit(stack).map((s) => s.trim().replace(/^["']|["']$/g, "").toLowerCase());

/** Every violation of the six looks, as readable strings. Empty means clean. */
export function bannedViolations({ tokens: tokensCss, rest }: Sheets): string[] {
  const out: string[] = [];
  const tokens = tokenMap(tokensCss);
  const rules: Rule[] = rulesOf(rest);
  const rgb = (name: string) => parseHex(tokens.get(name) ?? "#000");

  // (a) no dark ground, light scheme
  for (const t of ["--wall", "--paper", "--paper-grid", "--paper-hot"]) {
    if (lightnessOf(rgb(t)) <= 0.7) out.push(`(a) ${t} is dark (lightness ${lightnessOf(rgb(t)).toFixed(2)})`);
  }
  if (!/color-scheme:\s*light/.test(tokensCss) || /color-scheme:\s*[^;]*dark/.test(tokensCss + rest)) out.push("(a) color-scheme is not light");

  // (b) no glow, (g) no glass
  for (const r of rules) {
    for (const d of r.decls) {
      if (d.prop === "box-shadow" || d.prop === "text-shadow") {
        for (const layer of topLevelSplit(d.value)) if (shadowBlur(layer) !== 0) out.push(`(b) ${r.selector}: ${d.prop} has a blur radius`);
      }
      if (/drop-shadow\(/i.test(d.value)) out.push(`(b) ${r.selector}: drop-shadow`);
      if (d.prop === "backdrop-filter" || /^-webkit-backdrop-filter$/.test(d.prop)) out.push(`(g) ${r.selector}: backdrop-filter`);
      if (d.prop === "filter" && /blur/i.test(d.value)) out.push(`(g) ${r.selector}: filter blur`);
      if (/blur\(/i.test(d.value)) out.push(`(g) ${r.selector}: blur()`);
    }
  }

  // (c) no cream page. HSL saturation is inflated near white (--paper is 0.13), so "saturation" here is chroma,
  // (max - min) / 255, which is the visible tint; the hue rule is unchanged. See docs/kiro-log.md.
  for (const t of ["--wall", "--paper"]) {
    const c = rgb(t);
    const chroma = (Math.max(...c) - Math.min(...c)) / 255;
    if (chroma >= 0.12) out.push(`(c) ${t} chroma ${chroma.toFixed(2)} is not below 0.12`);
    if (hueOf(c) >= 30 && hueOf(c) <= 70 && chroma >= 0.03) out.push(`(c) ${t} is cream (hue ${hueOf(c).toFixed(0)})`);
  }

  // (d) no serif display; no serif in any stack
  for (const [name, value] of tokens) {
    if (name.startsWith("--font-") && fontEntries(value).some((f) => SERIF.has(f))) out.push(`(d) ${name} contains a serif family`);
  }
  for (const r of rules) {
    if (!parts(r.selector).some((s) => HEADING.test(s))) continue;
    for (const d of r.decls) if (d.prop === "font-family" && d.value !== "var(--font-display)") out.push(`(d) ${r.selector}: font-family ${d.value}`);
  }
  for (const r of rules) {
    for (const d of r.decls) {
      if (d.prop === "font-family" && !d.value.startsWith("var(") && fontEntries(d.value).some((f) => SERIF.has(f))) out.push(`(d) ${r.selector}: serif font-family`);
    }
  }

  // (e) the orange/rust shade only on dying variants
  const orange = [...tokens.keys()].filter((t) => {
    const v = tokens.get(t) ?? "";
    if (!/^#[0-9a-f]{3,6}$/i.test(v)) return false;
    const c = parseHex(v);
    return hueOf(c) >= 10 && hueOf(c) <= 40 && saturationOf(c) > 0.4;
  });
  for (const t of orange) {
    for (const r of rules) {
      if (r.decls.some((d) => d.value.includes(`var(${t})`)) && !/dying/.test(r.selector)) out.push(`(e) ${r.selector}: ${t} outside a dying variant`);
    }
  }
  for (const r of rules) {
    for (const d of r.decls) if (/#[0-9a-f]{3,8}\b/i.test(d.value) && !d.prop.startsWith("--")) out.push(`(e) ${r.selector}: color literal`);
  }

  // (f) no purple, a single gradient
  for (const [name, value] of tokens) {
    if (!/^#[0-9a-f]{3,6}$/i.test(value)) continue;
    const c = parseHex(value);
    if (saturationOf(c) > 0.15 && hueOf(c) >= 250 && hueOf(c) <= 335) out.push(`(f) ${name} is purple`);
  }
  const gradients = rules.flatMap((r) => r.decls.filter((d) => /gradient\(/i.test(d.value)).map((d) => ({ r, d })));
  for (const { r, d } of gradients) {
    if (!(r.selector === "body" && /^repeating-linear-gradient\(/.test(d.value))) out.push(`(f) ${r.selector}: gradient outside the body ruled lines`);
  }
  if (gradients.length > 1) out.push("(f) more than one gradient");

  // (h) no generic card radius
  for (const r of rules) {
    for (const d of r.decls) {
      if (/^border(-[a-z]+)*-radius$/.test(d.prop) && !/^(0|var\(--radius\)|50%)$/.test(d.value.trim())) out.push(`(h) ${r.selector}: ${d.prop}: ${d.value}`);
    }
  }
  if (parseFloat(tokens.get("--radius") ?? "99") > 2) out.push("(h) --radius is larger than 2px");

  // (i) no white-and-hairline look: gray Wall, 2px rules on every box
  const wall = rgb("--wall");
  if (lightnessOf(wall) > 0.9) out.push("(i) --wall is white-like");
  if (tokens.get("--rule") !== "2px") out.push("(i) --rule is not 2px");
  for (const sel of BOX_SELECTORS) {
    const ofSel = rules.filter((r) => r.selector === sel);
    const borders = ofSel.flatMap((r) => r.decls.filter((d) => /^border/.test(d.prop) && !/radius|collapse|spacing/.test(d.prop)));
    if (!borders.some((d) => /var\(--rule(-heavy)?\)/.test(d.value))) out.push(`(i) ${sel}: no var(--rule) border`);
    for (const d of borders) if (/(^|\s)1px\s+solid/.test(d.value)) out.push(`(i) ${sel}: hairline border ${d.value}`);
  }
  const tombFace = rules.filter((r) => r.selector === ".tombstone::after").flatMap((r) => r.decls);
  if (!tombFace.some((d) => d.prop === "inset" && d.value.includes("var(--rule)"))) out.push("(i) .tombstone::after is not inset by var(--rule)");

  // label font allowlist (18.2)
  for (const r of rules) {
    if (r.decls.some((d) => d.prop === "font-family" && d.value.includes("--font-label")) && !LABEL_FONT_ALLOWLIST.some((re) => re.test(r.selector))) {
      out.push(`label font used on ${r.selector}`);
    }
  }
  // Manila as a background only on tag objects (18.3)
  for (const r of rules) {
    for (const d of r.decls) {
      if ((d.prop === "background" || d.prop === "background-color") && d.value.includes("var(--tag)") && !TAG_BACKGROUND_SELECTORS.test(r.selector)) {
        out.push(`--tag as a background on ${r.selector}`);
      }
    }
  }
  return out;
}

/** The property: any assertion drawn from the fixed list of looks holds. Names are the Banned_Look tags. */
export const LOOK_TAGS = ["(a)", "(b)", "(c)", "(d)", "(e)", "(f)", "(g)", "(h)", "(i)", "label font", "--tag as a background"] as const;

export function build(sheets: Sheets) {
  const violations = bannedViolations(sheets);
  return fc.property(fc.constantFrom(...LOOK_TAGS), (tag) => {
    const hit = violations.filter((v) => v.includes(tag));
    if (hit.length > 0) throw new TT5Failure(hit.join("; "));
    return true;
  });
}
