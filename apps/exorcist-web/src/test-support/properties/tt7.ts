// Property 7 (toe-tag-redesign): motion is gated, finite and not blocking.
// Static part reads the Stylesheet declarations; the DOM part (jsdom) opens a package and checks the panel at once.
import fc from "fast-check";
import { serializeReport } from "@graveyard-kit/exorcist-npm/report";
import type { ScanReport } from "@graveyard-kit/exorcist-npm/report";
import { declarations, stripComments } from "../../theme/css-parse.js";
import type { Decl } from "../../theme/css-parse.js";
import { openPackageArb, scanReportArb } from "../arbitraries.js";
import { mountPage } from "../dom-harness.js";
import type { ToeMutate } from "../sabotage/toe.js";
import type { Sheets } from "./tt4.js";

export class TT7Failure extends Error {}

const norm = (s: string): string => s.replace(/\s+/g, " ").trim();
const NO_PREF = "@media (prefers-reduced-motion: no-preference)";
const REDUCE = "@media (prefers-reduced-motion: reduce)";
const sel = (d: Decl): string => norm(d.preludes[d.preludes.length - 1] ?? "");
const parts = (s: string): string[] => s.split(",").map(norm);
const isMotion = (d: Decl): boolean => /^(animation|transition)/.test(d.prop) || (d.prop === "scroll-behavior" && d.value !== "auto");
const inNoPref = (d: Decl): boolean => d.preludes.map(norm).includes(NO_PREF);
const inReduce = (d: Decl): boolean => d.preludes.map(norm).includes(REDUCE);

/** Violations of the static part, each prefixed with a tag. */
export function motionViolations({ rest }: Sheets): string[] {
  const out: string[] = [];
  const decls = declarations(stripComments(rest));

  for (const d of decls.filter(isMotion)) {
    const off = d.value === "none" || d.value === "0s" || d.value === "auto";
    if (!inNoPref(d) && !(inReduce(d) && off)) out.push(`[gate] ${sel(d)}: ${d.prop}: ${d.value} is outside a no-preference block`);
    if (/infinite/.test(d.value)) out.push(`[finite] ${sel(d)}: ${d.prop} is infinite`);
  }
  for (const d of decls) if (/ember/i.test(d.value) || d.preludes.some((p) => /ember/i.test(p))) out.push(`[ember] ${sel(d)} still references the ember pulse`);

  const swing = decls.filter((d) => d.preludes.some((p) => norm(p) === "@keyframes tag-swing"));
  if (swing.length === 0) out.push("[swing] @keyframes tag-swing does not exist");
  for (const d of swing) {
    if (!inNoPref(d)) out.push("[gate] @keyframes tag-swing is outside the no-preference block");
    for (const m of d.value.matchAll(/rotate\((-?\d*\.?\d+)deg\)/g)) {
      if (Math.abs(parseFloat(m[1] as string)) > 8) out.push(`[swing] rotation ${m[1]}deg exceeds 8deg`);
    }
  }

  const tag = decls.filter((d) => d.prop === "animation" && parts(sel(d)).includes(".sheet-tag") && inNoPref(d));
  const swingAnim = tag.find((d) => d.value.startsWith("tag-swing"));
  if (!swingAnim) out.push("[swing] .sheet-tag has no tag-swing animation in the no-preference block");
  else {
    if (!swingAnim.value.startsWith("tag-swing var(--swing-duration)")) out.push("[swing] tag-swing duration is not var(--swing-duration)");
    if (!/\s1(\s|$)/.test(swingAnim.value)) out.push("[finite] tag-swing iteration count is not 1");
  }

  for (const target of [".sheet-tag", ".sheet-tag .tag-band"]) {
    const ok = decls.some((d) => d.prop === "animation" && d.value === "none" && inReduce(d) && parts(sel(d)).includes(target));
    if (!ok) out.push(`[reduce] no reduce rule turns the animation off for ${target}`);
  }
  return out;
}

/** The sources that must not schedule anything (the swing is CSS only). */
export function sourceViolations(sources: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [name, src] of Object.entries(sources)) {
    if (/setTimeout|requestAnimationFrame|animationend/.test(src)) out.push(`[source] ${name} schedules work or listens for animationend`);
  }
  return out;
}

export const TAGS = ["[gate]", "[finite]", "[ember]", "[swing]", "[reduce]", "[source]"] as const;

/** Static property: each rule group has no violation. */
export function build(sheets: Sheets, sources: Record<string, string> = {}) {
  const violations = [...motionViolations(sheets), ...sourceViolations(sources)];
  return fc.property(fc.constantFrom(...TAGS), (tag) => {
    const hit = violations.filter((v) => v.startsWith(tag));
    if (hit.length > 0) throw new TT7Failure(hit.join("; "));
    return true;
  });
}

/** DOM part: right after the click returns (no timer advanced) the panel is open, focused, hashed and has a Sheet_Tag. */
export async function checkOpenAtOnce(report: ScanReport, index: number, mutate?: ToeMutate): Promise<void> {
  const dep = report.dependencies[index % report.dependencies.length]!;
  const page = mountPage({ route: "#/demo/pump", fetchRoutes: { "GET /api/demo/pump": { body: serializeReport(report) } } });
  try {
    await page.flush();
    page.document.querySelector<HTMLElement>("button.disclosure[aria-controls='alive-list']")?.click();
    const opener = Array.from(page.document.querySelectorAll<HTMLElement>("button.tombstone")).find((t) => t.getAttribute("data-key") === dep.name);
    if (!opener) throw new TT7Failure(`no tombstone for ${dep.name}`);
    page.click(opener);
    mutate?.(page.document, { report, openName: dep.name });
    const panel = page.dialogRoot.querySelector<HTMLElement>('[role="dialog"]');
    if (!panel || panel.hidden) throw new TT7Failure("the panel is not open right after the click");
    if (page.active() !== panel.querySelector("h2#detail-title")) throw new TT7Failure("h2#detail-title is not focused right after the click");
    if (!page.hash().includes("pkg=")) throw new TT7Failure("location.hash has no pkg=");
    const tag = panel.querySelector(".sheet-tag");
    if (!tag) throw new TT7Failure("no .sheet-tag right after the click");
    if (!tag.getAttribute("data-grade")) throw new TT7Failure(".sheet-tag has no data-grade");
  } finally {
    page.destroy();
  }
}

export function buildDom(mutate?: ToeMutate): fc.IAsyncProperty<[ScanReport, number]> {
  return fc.asyncProperty(scanReportArb, openPackageArb, async (report, index) => {
    await checkOpenAtOnce(report, index, mutate);
  });
}
