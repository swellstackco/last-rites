// Property 6 (toe-tag-redesign): narrow-viewport layout rules hold, read from the Stylesheet text.
// jsdom has no layout, so real widths are checked by the browser task (11.3).
import fc from "fast-check";
import { declarations, stripComments } from "../../theme/css-parse.js";
import type { Decl } from "../../theme/css-parse.js";
import type { Sheets } from "./tt4.js";

export class TT6Failure extends Error {}

/** Classes whose text comes from a report; each must wrap anywhere. */
export const TEXT_BEARING = [".tomb-name", ".tomb-summary", ".col-signal", ".proof-pre", "dd", ".proof-cell", ".notice", ".error", ".demo-card .muted"] as const;
/** Selectors that may declare white-space: nowrap. */
export const NOWRAP_ALLOWLIST = [".col-status", ".col-points", "button", ".btn", ".tag-label", ".tag-band", ".subtitle-phrase", ".visually-hidden"] as const;
/** Interactive selectors and the rule selectors that must carry the 44px target. */
export const INTERACTIVE: readonly (readonly [string, readonly string[]])[] = [
  ["buttons", ["button"]],
  ["links styled as buttons", [".btn"]],
  ["inputs", ["input"]],
  ["summary", ["summary"]],
  ["group tabs", [".count"]],
  ["demo cards", [".demo-card"]],
  ["alive disclosure", ["button.disclosure"]],
  ["toe tags", [".tombstone-dead", ".tombstone-dying", ".tombstone-ailing", ".tombstone-alive"]],
];

const px = (v: string): number | null => {
  const m = /^(-?\d*\.?\d+)(px|rem)$/.exec(v.trim());
  return m ? parseFloat(m[1] as string) * (m[2] === "rem" ? 16 : 1) : null;
};
const norm = (s: string): string => s.replace(/\s+/g, " ").trim();
const last = (d: Decl): string => norm(d.preludes[d.preludes.length - 1] ?? "");
const parts = (sel: string): string[] => sel.split(",").map(norm);
const media = (d: Decl): string[] => d.preludes.filter((p) => p.startsWith("@media")).map(norm);
const inMinWidth = (d: Decl): boolean => media(d).some((m) => /min-width/.test(m));
const matches = (sel: string, cls: string): boolean => parts(sel).some((p) => p === cls || p.endsWith(` ${cls}`));

function stripMinmax(value: string): string {
  let out = value;
  for (let i = 0; i < 20; i += 1) {
    const next = out.replace(/(minmax|min|max|clamp)\(([^()]|\([^()]*\))*\)/g, "X");
    if (next === out) break;
    out = next;
  }
  return out;
}

function columns(value: string): number | null {
  const rep = /^repeat\((\d+),/.exec(value.trim());
  if (rep) return parseInt(rep[1] as string, 10);
  return stripMinmax(value).trim().split(/\s+/).length;
}

const tagGrid = (decls: Decl[], pred: (d: Decl) => boolean): Decl | undefined =>
  decls.find((d) => d.prop === "grid-template-columns" && last(d) === ".grid" && pred(d));

export function layoutViolations({ rest }: Sheets): string[] {
  const out: string[] = [];
  const decls = declarations(stripComments(rest));

  // grids: tracks are minmax(0, ...), min(100%, ...) or auto, never a bare fr
  for (const d of decls.filter((x) => x.prop === "grid-template-columns")) {
    if (/\d*\.?\d+fr\b/.test(stripMinmax(d.value))) out.push(`[grid] ${last(d)}: bare fr track in "${d.value}"`);
  }
  const base = tagGrid(decls, (d) => media(d).length === 0);
  const two = tagGrid(decls, (d) => media(d).some((m) => /min-width:\s*32\.5rem/.test(m)));
  const three = tagGrid(decls, (d) => media(d).some((m) => /min-width:\s*48rem/.test(m)));
  const four = tagGrid(decls, (d) => media(d).some((m) => /min-width:\s*64rem/.test(m)));
  const want: [string, Decl | undefined, number][] = [["base (one column)", base, 1], ["from 32.5rem", two, 2], ["from 48rem", three, 3], ["from 64rem", four, 4]];
  for (const [name, d, n] of want) {
    if (!d) out.push(`[grid] no ${name} tag grid rule`);
    else if (columns(d.value) !== n) out.push(`[grid] ${name} tag grid has ${columns(d.value)} columns, wants ${n}`);
  }

  // widths
  for (const d of decls.filter((x) => /^(width|min-width|flex-basis)$/.test(x.prop))) {
    const v = px(d.value);
    if (v !== null && v > 343 && !inMinWidth(d)) out.push(`[width] ${last(d)}: ${d.prop} ${d.value} exceeds 343px`);
    if (v === null && /^(calc|min|max|clamp)\(/.test(d.value) && !(d.prop === "width" && last(d) === ".sheet") && /\d{3,}px|\d{2,}rem/.test(d.value) && !/^min\(/.test(d.value)) {
      out.push(`[width] ${last(d)}: ${d.prop} ${d.value}`);
    }
  }
  const sheetWidth = decls.find((d) => d.prop === "width" && last(d) === ".sheet" && media(d).length === 0);
  if (!sheetWidth || !/^min\(100%,/.test(sheetWidth.value)) out.push("[width] .sheet width is not min(100%, ...)");

  // wrapping
  for (const cls of TEXT_BEARING) {
    // Package names break at Split_Points first; break-word is their last resort (toe-tag-polish T7).
    const wanted = cls === ".tomb-name" ? "break-word" : "anywhere";
    if (!decls.some((d) => d.prop === "overflow-wrap" && d.value === wanted && matches(last(d), cls))) out.push(`[wrap] ${cls} lacks overflow-wrap: ${wanted}`);
  }
  if (!decls.some((d) => d.prop === "white-space" && d.value === "pre-wrap" && matches(last(d), ".proof-pre"))) out.push("[wrap] .proof-pre lacks white-space: pre-wrap");
  for (const d of decls.filter((x) => x.prop === "white-space" && x.value === "nowrap")) {
    if (!parts(last(d)).every((p) => NOWRAP_ALLOWLIST.some((a) => p === a || p.endsWith(` ${a}`)))) out.push(`[nowrap] ${last(d)} is not allowed to be nowrap`);
  }
  for (const d of decls.filter((x) => x.prop === "white-space" && x.value === "pre")) out.push(`[wrap] ${last(d)}: white-space: pre`);

  // targets
  for (const [name, selectors] of INTERACTIVE) {
    for (const sel of selectors) {
      const ok = decls.some((d) => d.prop === "min-height" && matches(last(d), sel) && (d.value === "var(--target)" || (px(d.value) ?? 0) >= 44));
      if (!ok) out.push(`[target] ${name} (${sel}) lacks min-height: var(--target)`);
    }
  }

  // boxed records below 40rem
  const narrowForm = (d: Decl): boolean => media(d).some((m) => /max-width:\s*40rem/.test(m));
  const rowGrid = decls.find((d) => d.prop === "grid-template-columns" && narrowForm(d) && last(d) === ".breakdown tr");
  if (!rowGrid || columns(rowGrid.value) !== 2) out.push("[record] .breakdown tr is not a two-column grid at or below 40rem");
  if (!decls.some((d) => d.prop === "display" && d.value === "grid" && narrowForm(d) && last(d) === ".breakdown tr")) out.push("[record] .breakdown tr is not display: grid at or below 40rem");
  if (!decls.some((d) => d.prop === "content" && /attr\(data-label\)/.test(d.value) && narrowForm(d))) out.push("[record] td::before does not show attr(data-label) at or below 40rem");

  // Sheet_Tag
  const tagMax = decls.find((d) => d.prop === "max-width" && last(d) === ".sheet-tag");
  const m = tagMax ? /^calc\(100% - (\d*\.?\d+)rem\)$/.exec(tagMax.value) : null;
  if (!m || parseFloat(m[1] as string) < 2) out.push("[sheet-tag] .sheet-tag max-width is not at most calc(100% - 2rem)");
  return out;
}

export const TAGS = ["[grid]", "[width]", "[wrap]", "[nowrap]", "[target]", "[record]", "[sheet-tag]"] as const;

export function build(sheets: Sheets) {
  const violations = layoutViolations(sheets);
  return fc.property(fc.constantFrom(...TAGS), (tag) => {
    const hit = violations.filter((v) => v.startsWith(tag));
    if (hit.length > 0) throw new TT6Failure(hit.join("; "));
    return true;
  });
}
