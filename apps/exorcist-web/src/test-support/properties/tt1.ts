// Property 1 (toe-tag-redesign): Scan_Report facts are preserved. The page shows the same Rendered_Facts as the
// frozen Reference_Views and as the facts computed from the report by an independent function.
import fc from "fast-check";
import { toGrade } from "@last-rites/skeleton";
import { GRADE_INFO, GRADE_ORDER, buildGraveyard, summaryLine } from "@last-rites/skeleton/graveyard";
import { serializeReport } from "@last-rites/exorcist-npm/report";
import type { ScanReport } from "@last-rites/exorcist-npm/report";
import { SCREEN_NAME } from "../../constants.js";
import { openPackageArb, scanReportArb } from "../arbitraries.js";
import { tamperGrade } from "../build-report.js";
import { mountPage } from "../dom-harness.js";
import type { ToeMutate } from "../sabotage/toe.js";
import { renderReferenceToeFacts } from "../toe-reference.js";
import { toeFacts } from "../toe-facts.js";
import type { HeaderFacts, TagFacts, ToeFacts } from "../toe-facts.js";

export class TT1Failure extends Error {}
const fail = (message: string): never => {
  throw new TT1Failure(message);
};
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** What a Scan_Report promises about the page, computed without any view. */
export interface ExpectedFacts {
  header: HeaderFacts;
  groups: ToeFacts["groups"];
  tombstones: TagFacts[];
  skipped: string[];
  breakdown: { caption: string; rows: string[]; total: string; mismatches: string[] };
}

const cut = (text: string): string => (text.length > 200 ? `${text.slice(0, 199)}…` : text);

export function expectedFacts(report: ScanReport, openName: string): ExpectedFacts {
  const deps = report.dependencies;
  const recount = { dead: 0, dying: 0, ailing: 0, alive: 0 };
  for (const d of deps) recount[d.death.grade] += 1;
  const s = report.summary;
  const disagrees =
    s.total !== deps.length || s.dead !== recount.dead || s.dying !== recount.dying || s.ailing !== recount.ailing || s.alive !== recount.alive;
  const rangesOnly = deps.length > 0 && deps.every((d) => d.versionSource === "range");
  const ref = report.ref === "HEAD" ? "default branch (HEAD)" : report.ref;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):/.exec(report.scannedAt);
  const when = m ? `${m[1]} ${m[2]}:${m[3]} UTC` : report.scannedAt;

  const header: HeaderFacts = {
    heading: `${SCREEN_NAME}: ${report.repo}`,
    meta: `Snapshot · ref ${ref} · scanned ${when} · ${deps.length} scanned, ${report.skipped.length} skipped`,
    counts: GRADE_ORDER.map((g) => ({
      grade: g,
      count: String(recount[g]),
      label: `${GRADE_INFO[g].label}: ${recount[g]}. Go to ${GRADE_INFO[g].label.toLowerCase()} packages`,
    })),
    legend: `Score ranges: ${GRADE_ORDER.map((g) => `${GRADE_INFO[g].label} ${GRADE_INFO[g].min}-${GRADE_INFO[g].max}`).join(", ")}. 0 is alive, 100 is dead.`,
    notices: [
      ...(disagrees
        ? ["This file's summary disagrees with its dependencies. The counts shown are computed from the dependencies."]
        : []),
      ...(rangesOnly
        ? [
            report.ecosystem === "github-actions"
              ? "Refs come from workflow uses: lines."
              : "Versions come from declared ranges because no package-lock.json was read. Yarn and pnpm lockfiles are not read in v1.",
          ]
        : []),
    ],
    warnings: [...report.warnings],
  };

  const view = buildGraveyard(deps);
  const groups = GRADE_ORDER.map((g) => {
    const group = view.groups.find((x) => x.grade === g)!;
    return { grade: g, title: `${GRADE_INFO[g].label} (${recount[g]})`, keys: group.graves.map((x) => x.key) };
  });
  const byKey = new Map(deps.map((d) => [d.name, d]));
  const tombstones: TagFacts[] = groups.flatMap((g) =>
    g.keys.map((key) => {
      const d = byKey.get(key)!;
      const unknown = d.death.parts.filter((p) => p.status === "unknown").length;
      return {
        key,
        grade: d.death.grade,
        label: `${d.name}, ${d.death.grade}, score ${d.death.score} of 100`,
        name: cut(d.name),
        score: String(d.death.score),
        scoreText: `Death score ${d.death.score} out of 100: ${d.death.grade}. 0 is alive, 100 is dead.`,
        gradeWord: GRADE_INFO[d.death.grade].label,
        summary: cut(summaryLine({ name: d.name, death: d.death } as never)),
        badge: unknown > 0 ? `${unknown} unknown` : null,
        badgeLabel: unknown > 0 ? `${unknown} unknown ${unknown === 1 ? "signal" : "signals"}` : null,
      };
    }),
  );

  const open = byKey.get(openName)!;
  const rows = open.death.parts.map((p) => `signal|${p.status === "unknown" ? "Unknown" : "Known"}|${p.points} / ${p.weight}`);
  let sum = open.death.parts.reduce((a, p) => a + p.points, 0);
  if (open.death.calibration) {
    rows.push(`calibration|Calibration|+${open.death.calibration.points}`);
    sum += open.death.calibration.points;
  }
  const mismatches: string[] = [];
  if (sum !== open.death.score) mismatches.push(`Breakdown does not add up: rows sum to ${sum}, score is ${open.death.score}`);
  const real = toGrade(open.death.score);
  if (real !== open.death.grade) {
    mismatches.push(
      `Grade mismatch: the file says ${open.death.grade}, but a score of ${open.death.score} is ${real} (${GRADE_INFO[real].min}-${GRADE_INFO[real].max})`,
    );
  }
  return {
    header,
    groups,
    tombstones,
    skipped: report.skipped.map((k) => `${k.name} ${k.specifier}: ${k.reason} (${k.kind})`),
    breakdown: { caption: `Score breakdown for ${open.name}`, rows: rows.sort(), total: `${open.death.score} / 100`, mismatches },
  };
}

/** The part of ToeFacts that ExpectedFacts promises. */
function project(f: ToeFacts): ExpectedFacts {
  const b = f.breakdown;
  return {
    header: f.header as HeaderFacts,
    groups: f.groups,
    tombstones: f.tombstones,
    skipped: f.skipped,
    breakdown: {
      caption: b?.caption ?? "",
      rows: (b?.rows ?? []).map((r) => `${r.kind}|${r.status}|${r.points}`).sort(),
      total: b?.total ?? "",
      mismatches: b?.mismatches ?? [],
    },
  };
}

export async function checkScanFacts(report: ScanReport, openIndex: number, mutate?: ToeMutate): Promise<void> {
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
    page.click(opener!);
    mutate?.(page.document, { report, openName: dep.name });

    const actual = toeFacts(page.document.body);
    if (actual.breakdown === null) fail("no breakdown in the open panel");
    const reference = renderReferenceToeFacts(report, dep.name);
    // graveyard-ui-actions B2: a github-actions report has its own Lockfile_Note (checked in `expectedFacts` below);
    // the frozen reference only knows the npm sentence, so the reference takes the note the page is expected to show.
    const a = { ...actual, proof: null };
    if (report.ecosystem === "github-actions") {
      const note = expectedFacts(report, dep.name).header.notices.filter((n) => n.startsWith("Refs come from"));
      // graveyard-ui-actions B3: the "Deprecated on npm" label is "Deprecated" for a github-actions report.
      if (reference.breakdown) {
        reference.breakdown = JSON.parse(JSON.stringify(reference.breakdown).replaceAll("Deprecated on npm", "Deprecated"));
      }
      if (reference.header) {
        reference.header.notices = [
          ...reference.header.notices.filter((n) => !n.startsWith("Versions come from")),
          ...note,
        ];
      }
    }
    if (!same(a, reference)) {
      fail(`facts differ from the Reference_Views:\nactual=${JSON.stringify(a)}\nreference=${JSON.stringify(reference)}`);
    }
    const want = expectedFacts(report, dep.name);
    const got = project(actual);
    for (const key of Object.keys(want) as Array<keyof ExpectedFacts>) {
      if (!same(got[key], want[key])) fail(`${key}: page ${JSON.stringify(got[key])}, report says ${JSON.stringify(want[key])}`);
    }
  } finally {
    page.destroy();
  }
}

const GRADES = ["dead", "dying", "ailing", "alive"] as const;

/** scanReportArb, sometimes with one grade that disagrees with its score (so the Band and notices matter). */
export const toeScanReportArb: fc.Arbitrary<ScanReport> = fc
  .tuple(scanReportArb, fc.option(fc.record({ at: fc.nat({ max: 11 }), grade: fc.constantFrom(...GRADES) }), { nil: undefined, freq: 4 }))
  .map(([report, t]) => (t ? tamperGrade(report, report.dependencies[t.at % report.dependencies.length]!.name, t.grade) : report));

export function build(mutate?: ToeMutate): fc.IAsyncProperty<[ScanReport, number]> {
  return fc.asyncProperty(toeScanReportArb, openPackageArb, async (report, index) => {
    await checkScanFacts(report, index, mutate);
  });
}
