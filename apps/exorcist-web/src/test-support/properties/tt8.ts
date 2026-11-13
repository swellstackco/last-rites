// Property 8 (toe-tag-redesign): the focus ring is never clipped or lost, read from the Stylesheet text.
import fc from "fast-check";
import { declarations, stripComments } from "../../theme/css-parse.js";
import type { Decl } from "../../theme/css-parse.js";
import { tokenMap } from "./tt4.js";
import type { Sheets } from "./tt4.js";

export class TT8Failure extends Error {}

const norm = (s: string): string => s.replace(/\s+/g, " ").trim();
const sel = (d: Decl): string => norm(d.preludes[d.preludes.length - 1] ?? "");
const parts = (s: string): string[] => s.split(",").map(norm);
const media = (d: Decl): string[] => d.preludes.map(norm).filter((p) => p.startsWith("@media"));

export const FOCUSABLE = ["button", ".btn", "a", "input", "summary", ".tombstone", ".count", ".backdrop", ".demo-card"] as const;
export const ANCESTORS = ["li", ".grid", ".group", ".screen", ".app", ".stack", ".row", ".picker", ".status", ".sheet", ".sheet-tag", "body", "html"] as const;
const WATCHED = new Set<string>([...FOCUSABLE, ...ANCESTORS]);

const REMOVAL_OK = new Set([":focus:not(:focus-visible)", 'h1[tabindex="-1"]:focus']);
const FORCED = ["table.breakdown th", "table.breakdown td", ".tombstone", ".sheet", ".proof-badge", ".proof-compare"] as const;

/** The subject compound of a selector (after the last combinator), split into pseudo-element and the rest. */
function subject(part: string): { pseudoElement: boolean; tag: string | null; classes: string[]; tabindex: boolean } {
  const compound = norm(part).split(/\s*[>+~]\s*|\s+/).pop() ?? "";
  const pseudoElement = /::[a-z-]+$/.test(compound);
  const bare = compound.replace(/::[a-z-]+/g, "").replace(/:[a-z-]+(\([^)]*\))?/g, "");
  const tag = /^([a-z][a-z0-9]*)/i.exec(bare)?.[1] ?? null;
  const classes = [...bare.matchAll(/\.([a-z][\w-]*)/gi)].map((m) => `.${m[1]}`);
  return { pseudoElement, tag, classes, tabindex: /\[tabindex/.test(bare) };
}

const watched = (s: ReturnType<typeof subject>): boolean => s.tabindex || (s.tag !== null && WATCHED.has(s.tag)) || s.classes.some((c) => WATCHED.has(c) || /^\.tombstone-/.test(c));

function lengthPx(value: string, tokens: Map<string, string>): number | null {
  let v = value.trim();
  const m = /^var\((--[a-z0-9-]+)\)$/.exec(v);
  if (m) v = tokens.get(m[1] as string) ?? "";
  const n = /^(-?\d*\.?\d+)(px|rem)$/.exec(v);
  return n ? parseFloat(n[1] as string) * (n[2] === "rem" ? 16 : 1) : null;
}

export function focusViolations({ tokens: tokensCss, rest }: Sheets): string[] {
  const out: string[] = [];
  const tokens = tokenMap(tokensCss);
  const decls = declarations(stripComments(rest));

  // the ring
  const ring = decls.filter((d) => d.prop === "outline" && sel(d) === ":focus-visible" && media(d).length === 0);
  if (!ring.some((d) => d.value === "var(--ring-width) solid var(--focus)")) out.push("[ring] :focus-visible is not var(--ring-width) solid var(--focus)");
  if (!decls.some((d) => d.prop === "outline-offset" && sel(d) === ":focus-visible" && d.value === "var(--ring-offset)")) out.push("[ring] :focus-visible outline-offset is not var(--ring-offset)");
  for (const d of decls.filter((x) => x.prop === "outline" && sel(x).includes(":focus-visible") && !REMOVAL_OK.has(sel(x)) && media(x).length === 0)) {
    if (d.value !== "var(--ring-width) solid var(--focus)") out.push(`[ring] ${sel(d)} changes the ring to "${d.value}"`);
  }
  for (const d of decls.filter((x) => x.prop === "outline-offset")) {
    const px = lengthPx(d.value, tokens);
    if (d.value !== "var(--ring-offset)" && (px === null || px < 0)) out.push(`[ring] ${sel(d)}: outline-offset ${d.value}`);
  }
  if (lengthPx("var(--ring-width)", tokens) === null || (lengthPx("var(--ring-width)", tokens) as number) < 3) out.push("[ring] --ring-width is below 3px");
  if (tokens.get("--focus") !== tokens.get("--ink")) out.push("[ring] --focus is not Ink");

  // outline removals
  for (const d of decls.filter((x) => /^outline(-style|-width)?$/.test(x.prop) && /^(none|0|0px|hidden)$/.test(x.value))) {
    if (!parts(sel(d)).every((p) => REMOVAL_OK.has(p))) out.push(`[removal] ${sel(d)} removes the outline`);
  }

  // clipping
  for (const d of decls) {
    const clipping = d.prop === "clip-path" || /^mask/.test(d.prop) || (/^overflow(-x|-y)?$/.test(d.prop) && /^(hidden|clip)$/.test(d.value));
    if (!clipping) continue;
    for (const p of parts(sel(d))) {
      const s = subject(p);
      if (d.prop === "clip-path" && d.value !== "none" && !s.pseudoElement) out.push(`[clip] ${p}: clip-path outside ::before/::after`);
      if (!s.pseudoElement && watched(s)) out.push(`[clip] ${p}: ${d.prop}: ${d.value} on a focusable element or an ancestor`);
    }
  }

  // gap between tags
  const gaps = decls.filter((d) => /^(gap|row-gap|column-gap)$/.test(d.prop) && sel(d) === ".grid" && media(d).length === 0);
  if (gaps.length === 0) out.push("[gap] .grid has no gap");
  for (const d of gaps) {
    const first = d.value.split(/\s+/);
    for (const v of first) {
      const px = lengthPx(v, tokens);
      if (px === null || px < (lengthPx("var(--space-4)", tokens) ?? 16)) out.push(`[gap] .grid ${d.prop} ${d.value} is below --space-4`);
    }
  }

  // forced colors
  const forced = decls.filter((d) => media(d).includes("@media (forced-colors: active)"));
  if (!forced.some((d) => d.prop === "outline-color" && d.value === "Highlight" && parts(sel(d)).includes(":focus-visible"))) out.push("[forced] no outline-color: Highlight on :focus-visible");
  const covered = new Set(forced.filter((d) => /^border/.test(d.prop) && /CanvasText/.test(d.value)).flatMap((d) => parts(sel(d))));
  for (const f of FORCED) if (!covered.has(f)) out.push(`[forced] ${f} has no CanvasText border under forced-colors`);
  return out;
}

export const TAGS = ["[ring]", "[removal]", "[clip]", "[gap]", "[forced]"] as const;

export function build(sheets: Sheets) {
  const violations = focusViolations(sheets);
  return fc.property(fc.constantFrom(...TAGS), (tag) => {
    const hit = violations.filter((v) => v.startsWith(tag));
    if (hit.length > 0) throw new TT8Failure(hit.join("; "));
    return true;
  });
}
