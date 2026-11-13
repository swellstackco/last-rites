// Static checks on the Stylesheet text (graveyard-ui-polish, design.md S1-S7).
// jsdom computes no layout, so these prove the cause of a defect is gone, not how a browser draws it.
import { declarations, stripComments } from "../theme/css-parse.js";
import type { Decl } from "../theme/css-parse.js";

export interface Violation {
  /** "S1" .. "S7". */
  check: string;
  message: string;
}

export const STYLE_FILES = ["tokens.css", "base.css", "graveyard.css", "detail.css"] as const;

interface Rule {
  selectors: string[];
  media: string[];
  decls: Decl[];
}

const selectorsOf = (d: Decl): string[] =>
  (d.preludes.at(-1) ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter((s) => s !== "");

const mediaOf = (d: Decl): string[] => d.preludes.slice(0, -1);

function rulesOf(decls: readonly Decl[]): Rule[] {
  const map = new Map<string, Rule>();
  for (const d of decls) {
    const key = JSON.stringify(d.preludes);
    let rule = map.get(key);
    if (!rule) {
      rule = { selectors: selectorsOf(d), media: mediaOf(d), decls: [] };
      map.set(key, rule);
    }
    rule.decls.push(d);
  }
  return [...map.values()];
}

/** Resolves var(--token) with the custom properties declared in the Stylesheet (one level deep is enough). */
function resolver(decls: readonly Decl[]): (value: string) => string {
  const tokens = new Map<string, string>();
  for (const d of decls) if (d.prop.startsWith("--")) tokens.set(d.prop, d.value);
  return (value) => value.replace(/var\((--[a-z0-9-]+)\)/gi, (m, name: string) => tokens.get(name) ?? m);
}

function px(value: string): number | undefined {
  const m = /^(-?\d*\.?\d+)(px|rem)$/.exec(value.trim());
  if (!m) return value.trim() === "0" ? 0 : undefined;
  return Number(m[1]) * (m[2] === "rem" ? 16 : 1);
}

/** Horizontal padding (px) a `padding` shorthand value gives; undefined when it cannot be read. */
function horizontalPadding(value: string): number | undefined {
  const parts = value.trim().split(/\s+/);
  const nums = parts.map(px);
  if (nums.some((n) => n === undefined)) return undefined;
  const n = nums as number[];
  if (n.length === 1) return n[0];
  if (n.length === 2 || n.length === 3) return n[1];
  return Math.min(n[1] as number, n[3] as number);
}

const isMin40 = (rule: Rule): boolean => rule.media.some((m) => /min-width:\s*40rem/.test(m));
const isMax40 = (rule: Rule): boolean => rule.media.some((m) => /max-width:\s*40rem/.test(m));
const get = (rule: Rule, prop: string): string | undefined => rule.decls.find((d) => d.prop === prop)?.value;
const hasSelector = (rule: Rule, selector: string): boolean => rule.selectors.includes(selector);

export function checkStylesheet(css: string): Violation[] {
  const decls = declarations(stripComments(css));
  const rules = rulesOf(decls);
  const resolve = resolver(decls);
  const out: Violation[] = [];
  const bad = (check: string, message: string): void => {
    out.push({ check, message });
  };

  // ---- S1 container (2.1) ----
  const screenRules = rules.filter((r) => hasSelector(r, ".screen"));
  const screenBase = screenRules.filter((r) => r.media.length === 0);
  const maxWidth = screenBase.map((r) => px(resolve(get(r, "max-width") ?? ""))).find((v) => v !== undefined);
  if (maxWidth === undefined || maxWidth < 960 || maxWidth > 1280) {
    bad("S1", `.screen needs a max-width between 960px and 1280px (found ${maxWidth ?? "none"})`);
  }
  const centered = screenBase.some((r) => get(r, "margin-inline") === "auto" || /^0 auto$/.test(get(r, "margin") ?? ""));
  if (!centered) bad("S1", ".screen is not centered (margin-inline: auto)");
  const gutter = screenBase.map((r) => px(resolve(get(r, "padding-inline") ?? ""))).find((v) => v !== undefined);
  if (gutter === undefined || gutter < 16) bad("S1", `.screen needs padding-inline of at least 16px (found ${gutter ?? "none"})`);
  const wideGutter = screenRules
    .filter(isMin40)
    .map((r) => px(resolve(get(r, "padding-inline") ?? "")))
    .find((v) => v !== undefined);
  if (wideGutter === undefined || wideGutter < 24) {
    bad("S1", `.screen needs padding-inline of at least 24px from min-width 40rem (found ${wideGutter ?? "none"})`);
  }
  for (const r of rules.filter((x) => hasSelector(x, ".app"))) {
    if (get(r, "max-width") !== undefined) bad("S1", `.app still declares max-width: ${get(r, "max-width")}`);
    if (get(r, "padding-inline") !== undefined && px(resolve(get(r, "padding-inline") as string)) !== 0) {
      bad("S1", ".app still declares a horizontal padding-inline");
    }
    const padding = get(r, "padding");
    if (padding !== undefined) {
      const horizontal = horizontalPadding(resolve(padding));
      if (horizontal === undefined || horizontal > 0) bad("S1", `.app still declares horizontal padding (padding: ${padding})`);
    }
    if (/auto/.test(get(r, "margin") ?? "")) bad("S1", `.app still centers itself (margin: ${get(r, "margin")})`);
  }

  // ---- S2 lists (2.2) ----
  for (const cls of ["counts", "grid", "demo-cards"]) {
    const reset = rules.some(
      (r) =>
        hasSelector(r, `.${cls}`) &&
        r.media.length === 0 &&
        /^none$/.test(get(r, "list-style") ?? "") &&
        (px(get(r, "padding") ?? "") === 0 || px(get(r, "padding-left") ?? "") === 0),
    );
    if (!reset) bad("S2", `.${cls} has no bullet reset (list-style: none and zero padding)`);
  }
  for (const r of rules) {
    const prose = r.selectors.some((s) => /^(\.warnings|\.skipped)( ul)?$|^ul$|^ol$/.test(s));
    if (prose && /^none$/.test(get(r, "list-style") ?? "")) bad("S2", `prose list rule removes bullets: ${r.selectors.join(", ")}`);
  }

  // ---- S3 arch (2.4) ----
  for (const r of rules.filter((x) => x.selectors.some((s) => /\.tombstone-dead\b/.test(s)))) {
    for (const d of r.decls) {
      if ((d.prop === "background-image" || d.prop === "background") && /gradient/i.test(d.value)) {
        bad("S3", `${r.selectors.join(", ")} draws a gradient line (${d.prop})`);
      }
    }
  }
  for (const cls of ["tombstone-dead", "tombstone-dying"]) {
    const rule = rules.find((r) => r.media.length === 0 && r.selectors.length === 1 && hasSelector(r, `.${cls}`));
    const borderAt = rule?.decls.findIndex((d) => d.prop === "border") ?? -1;
    const topAt = rule?.decls.findIndex((d) => d.prop === "border-top") ?? -1;
    if (borderAt === -1 || topAt === -1 || borderAt > topAt) {
      bad("S3", `.${cls} needs a uniform border before its border-top (found border at ${borderAt}, border-top at ${topAt})`);
    }
  }
  for (const r of rules.filter((x) => x.selectors.some((s) => /^\.(grid|group|screen|app|tombstone)/.test(s)))) {
    const overflow = [get(r, "overflow"), get(r, "overflow-x"), get(r, "overflow-y")].find((v) => v !== undefined && /^(hidden|clip)\b/.test(v));
    if (overflow) bad("S3", `${r.selectors.join(", ")} clips overflow (${overflow})`);
  }

  // ---- S4 words (2.5) ----
  const bareCell = (s: string): boolean => /^(\.breakdown )?(td|th)$/.test(s);
  for (const r of rules.filter((x) => x.selectors.some(bareCell))) {
    const wrap = get(r, "overflow-wrap");
    const brk = get(r, "word-break");
    if (wrap === "anywhere") bad("S4", `bare td/th rule sets overflow-wrap: anywhere (${r.selectors.join(", ")})`);
    if (brk !== undefined && /^break-(all|word)$/.test(brk)) bad("S4", `bare td/th rule sets word-break: ${brk}`);
  }
  const forClass = (cls: string): Rule[] => rules.filter((r) => r.selectors.some((s) => s === `.${cls}` || s.endsWith(` .${cls}`)));
  const anyDecl = (cls: string, prop: string, value: RegExp): boolean => forClass(cls).some((r) => value.test(get(r, prop) ?? ""));
  if (!anyDecl("col-signal", "overflow-wrap", /^anywhere$/)) bad("S4", ".col-signal needs overflow-wrap: anywhere");
  for (const cls of ["col-value", "col-status", "col-points", "col-source"]) {
    if (!anyDecl(cls, "overflow-wrap", /^normal$/)) bad("S4", `.${cls} needs overflow-wrap: normal`);
    if (!anyDecl(cls, "word-break", /^normal$/)) bad("S4", `.${cls} needs word-break: normal`);
  }
  for (const cls of ["col-status", "col-points"]) {
    if (!anyDecl(cls, "white-space", /^nowrap$/)) bad("S4", `.${cls} needs white-space: nowrap`);
  }

  // ---- S5 footer (2.7) ----
  const stacked = rules.filter(isMax40);
  for (const tag of ["th", "td"]) {
    const ok = stacked.some((r) => r.selectors.includes(`.breakdown tfoot ${tag}`) && /^(0|none)\b/.test(get(r, "border-top") ?? ""));
    if (!ok) bad("S5", `stacked .breakdown tfoot ${tag} needs border-top: 0`);
  }
  const rowBorder = stacked.some((r) => r.selectors.some((s) => /\.total$/.test(s)) && get(r, "border-top") !== undefined && !/^(0|none)\b/.test(get(r, "border-top") as string));
  if (!rowBorder) bad("S5", "stacked .total row needs one border-top");

  // ---- S6 focus (2.8) ----
  const removals = decls.filter((d) => d.prop === "outline" && /^(none|0)\b/.test(d.value));
  const removalSelectors = removals.flatMap((d) => selectorsOf(d)).sort();
  const allowed = [':focus:not(:focus-visible)', 'h1[tabindex="-1"]:focus'].sort();
  if (removals.length !== 2 || removalSelectors.join("|") !== allowed.join("|")) {
    bad("S6", `outline removals must be exactly ${allowed.join(" and ")}, found ${removals.length}: ${removalSelectors.join(", ")}`);
  }
  const ring = decls.find((d) => d.prop === "outline" && d.preludes.some((p) => p.includes(":focus-visible")) && !d.preludes.some((p) => p.includes(":not(")));
  if (!ring || !ring.value.includes("var(--ring-width)") || !ring.value.includes("var(--focus)")) {
    bad("S6", ":focus-visible must keep the var(--ring-width) solid var(--focus) ring");
  }
  const forced = decls.some((d) => d.prop === "outline-color" && d.value === "Highlight" && d.preludes.some((p) => /forced-colors:\s*active/.test(p)));
  if (!forced) bad("S6", "the forced-colors block must set outline-color: Highlight");

  // ---- S7 preserved rules (3.5, 3.7) ----
  if (!decls.some((d) => d.prop === "min-width" && d.value === "0")) bad("S7", "min-width: 0 on grid children is gone");
  if (!decls.some((d) => d.prop === "overflow-wrap" && d.value === "anywhere")) bad("S7", "overflow-wrap: anywhere is gone");
  if (!decls.some((d) => d.prop === "--target" && d.value === "44px")) bad("S7", "--target is not 44px");
  if (!decls.some((d) => d.prop === "min-height" && d.value === "var(--target)")) bad("S7", "min-height: var(--target) is gone");
  if (!decls.some((d) => d.prop === "font-size" && d.value === "18px" && d.preludes.some((p) => /min-width:\s*1200px/.test(p)))) {
    bad("S7", "18px at min-width 1200px is gone");
  }
  if (!decls.some((d) => d.prop === "font-size" && d.value === "56px")) bad("S7", "56px dead score is gone");
  const motion = decls.filter(
    (d) => /^(animation|transition)(-[a-z-]+)?$/.test(d.prop) || (d.prop === "scroll-behavior" && /smooth/.test(d.value)),
  );
  if (motion.length === 0) bad("S7", "no motion declarations found");
  for (const d of motion) {
    if (!d.preludes.some((p) => /prefers-reduced-motion:\s*no-preference/.test(p))) bad("S7", `motion outside no-preference: ${d.prop}`);
  }
  if (/url\(\s*["']?\s*(https?:)?\/\//i.test(css) || /@import/i.test(css)) bad("S7", "the Stylesheet loads something remote");

  return out;
}
