// Property 5 (graveyard-ui-actions, B2, fail-first): the Lockfile_Note of the header follows the ecosystem.
import fc from "fast-check";
import { serializeReport } from "@last-rites/exorcist-npm/report";
import type { ScanReport } from "@last-rites/exorcist-npm/report";
import { buildReport } from "../build-report.js";
import type { FixtureDependency } from "../build-report.js";
import { mountPage } from "../dom-harness.js";
import { actionNameArb } from "../arbitraries.js";
import { ALIVE_SIGNALS, DYING_SIGNALS } from "../signals.js";

export class ActionsP5Failure extends Error {}

export const NPM_SENTENCE =
  "Versions come from declared ranges because no package-lock.json was read. Yarn and pnpm lockfiles are not read in v1.";
export const ACTIONS_NOTE = "Refs come from workflow uses: lines.";

export interface P5Case {
  ecosystem: "npm" | "github-actions" | undefined;
  sources: Array<"lockfile" | "range">;
  names: string[];
}

/** 0-6 dependencies with random version sources (all-range is common), any ecosystem. */
export const p5CaseArb: fc.Arbitrary<P5Case> = fc.record({
  ecosystem: fc.constantFrom<"npm" | "github-actions" | undefined>("npm", "github-actions", undefined),
  sources: fc.oneof(
    { weight: 3, arbitrary: fc.array(fc.constant<"range">("range"), { maxLength: 6 }) },
    { weight: 3, arbitrary: fc.array(fc.constantFrom<"lockfile" | "range">("lockfile", "range"), { maxLength: 6 }) },
  ),
  names: fc.array(actionNameArb, { minLength: 6, maxLength: 6 }),
});

export function reportOf(c: P5Case): ScanReport {
  const seen = new Set<string>();
  const deps: FixtureDependency[] = [];
  c.sources.forEach((versionSource, i) => {
    const name = c.names[i] as string;
    if (seen.has(name)) return;
    seen.add(name);
    deps.push({ name, signals: i % 2 === 0 ? DYING_SIGNALS : ALIVE_SIGNALS, versionSource });
  });
  const report = buildReport(deps);
  return c.ecosystem === undefined ? report : { ...report, ecosystem: c.ecosystem };
}

function fail(message: string): never {
  throw new ActionsP5Failure(message);
}

/** The header of the mounted page: its text and its note paragraphs. */
export async function headerOf(report: ScanReport): Promise<{ text: string; notes: string[] }> {
  const page = mountPage({ route: "#/demo/x", fetchRoutes: { "GET /api/demo/x": { body: serializeReport(report) } } });
  try {
    await page.flush();
    const header = page.document.querySelector("header.header");
    if (!header) fail("no header on the page");
    return {
      text: header.textContent ?? "",
      notes: Array.from(header.querySelectorAll("p.note")).map((p) => p.textContent ?? ""),
    };
  } finally {
    page.destroy();
  }
}

export interface P5Halves {
  actions: boolean;
  npm: boolean;
}

export async function checkHeader(c: P5Case, halves: P5Halves = { actions: true, npm: true }): Promise<void> {
  const report = reportOf(c);
  const rangesOnly = report.dependencies.length > 0 && report.dependencies.every((d) => d.versionSource === "range");
  const { text, notes } = await headerOf(report);
  if (c.ecosystem === "github-actions") {
    if (!halves.actions) return;
    if (/package-lock\.json|pnpm|Yarn/.test(text)) fail(`the header of a github-actions report mentions a lockfile: ${JSON.stringify(notes)}`);
    const want = rangesOnly ? [ACTIONS_NOTE] : [];
    if (JSON.stringify(notes) !== JSON.stringify(want)) fail(`notes ${JSON.stringify(notes)}, expected ${JSON.stringify(want)}`);
  } else {
    if (!halves.npm) return;
    const want = rangesOnly ? [NPM_SENTENCE] : [];
    if (JSON.stringify(notes) !== JSON.stringify(want)) fail(`npm notes ${JSON.stringify(notes)}, expected ${JSON.stringify(want)}`);
  }
}

export function build(halves?: P5Halves): fc.IAsyncProperty<[P5Case]> {
  return fc.asyncProperty(p5CaseArb, async (c) => {
    await checkHeader(c, halves);
  });
}
