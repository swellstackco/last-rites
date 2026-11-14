// Property 10 (graveyard-ui-polish): preservation. The fixed page shows the same Rendered_Facts as the
// frozen Reference_Renderer and as the report itself; unsafe URLs stay withheld; names stay text.
import fc from "fast-check";
import { serializeReport } from "@last-rites/exorcist-npm/report";
import type { ScanReport } from "@last-rites/exorcist-npm/report";
import { mountPage } from "../dom-harness.js";
import type { Mutate } from "../sabotage/dom.js";
import { openPackageArb, scanReportArb } from "../arbitraries.js";
import { renderReferenceFacts } from "../reference-render.js";
import { renderedFacts } from "../rendered-facts.js";
import type { Facts } from "../rendered-facts.js";

export class P10Failure extends Error {}

const GRADES = ["dead", "dying", "ailing", "alive"] as const;

/** Facts the report itself promises, independent of any renderer. */
export function expectedFacts(report: ScanReport, openName: string): Pick<Facts, "counts"> & {
  keysByGrade: Record<string, string[]>;
  total: string;
  points: string[];
} {
  const keysByGrade: Record<string, string[]> = { dead: [], dying: [], ailing: [], alive: [] };
  for (const d of report.dependencies) keysByGrade[d.death.grade]!.push(d.name);
  for (const g of GRADES) keysByGrade[g]!.sort();
  const dep = report.dependencies.find((d) => d.name === openName)!;
  const points = dep.death.parts.map((p) => `${p.points} / ${p.weight}`);
  if (dep.death.calibration) points.push(`+${dep.death.calibration.points}`);
  return {
    counts: GRADES.map((g) => ({ grade: g, count: String(keysByGrade[g]!.length) })),
    keysByGrade,
    total: `${dep.death.score} / 100`,
    points: points.sort(),
  };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
function fail(message: string): never {
  throw new P10Failure(message);
}

export async function checkPreservation(report: ScanReport, openIndex: number, mutate?: Mutate): Promise<void> {
  const dep = report.dependencies[openIndex % report.dependencies.length]!;
  const page = mountPage({
    route: "#/demo/x",
    fetchRoutes: { "GET /api/demo/x": { body: serializeReport(report) } },
  });
  try {
    await page.flush();
    page.document.querySelector<HTMLElement>("button.disclosure[aria-controls='alive-list']")?.click();
    const opener = Array.from(page.document.querySelectorAll<HTMLElement>("button.tombstone")).find(
      (t) => t.getAttribute("data-key") === dep.name,
    );
    if (!opener) fail(`no tombstone for ${dep.name}`);
    page.click(opener);
    mutate?.(page.document, "opened");

    const fixed = renderedFacts(page.document.body);
    const reference = renderReferenceFacts(report, dep.name);
    if (!same(fixed, reference)) {
      fail(`facts differ from the Reference_Renderer:\nfixed=${JSON.stringify(fixed)}\nreference=${JSON.stringify(reference)}`);
    }

    const want = expectedFacts(report, dep.name);
    if (!same(fixed.counts, want.counts)) fail(`header counts ${JSON.stringify(fixed.counts)} differ from the report`);
    for (const g of GRADES) {
      const keys = fixed.tombstones.filter((t) => t.grade === g).map((t) => t.key).sort();
      if (!same(keys, want.keysByGrade[g])) fail(`tombstones of grade ${g}: ${JSON.stringify(keys)}, report has ${JSON.stringify(want.keysByGrade[g])}`);
    }
    if (fixed.breakdown === null) fail("no breakdown in the open panel");
    if (fixed.breakdown.total !== want.total) fail(`total ${fixed.breakdown.total}, expected ${want.total}`);
    const points = fixed.breakdown.rows.map((r) => r.points).sort();
    if (!same(points, want.points)) fail(`row points ${JSON.stringify(points)}, expected ${JSON.stringify(want.points)}`);

    for (const a of Array.from(page.document.querySelectorAll("a[href]"))) {
      if (!/^https?:\/\//i.test(a.getAttribute("href") ?? "") && !(a.getAttribute("href") ?? "").startsWith("#")) {
        fail(`an unsafe href was rendered: ${a.getAttribute("href")}`);
      }
    }
    if (page.document.querySelector("img, script, iframe, object")) fail("an element was created from report text");
  } finally {
    page.destroy();
  }
}

export function build(mutate?: Mutate): fc.IAsyncProperty<[ScanReport, number]> {
  return fc.asyncProperty(scanReportArb, openPackageArb, async (report, index) => {
    await checkPreservation(report, index, mutate);
  });
}
