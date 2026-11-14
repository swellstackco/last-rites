import fc from "fast-check";
import type { GradeBand } from "@last-rites/skeleton";
import { buildGraveyard } from "@last-rites/skeleton/graveyard";
import { ensure, graveRecordsArb } from "@last-rites/skeleton/graveyard/testing";
import type { ScanReport, ScannedDependency, SkippedEntry } from "@last-rites/exorcist-npm/report";
import { buildReportView } from "../../model/report-view.js";

export type BuildReportViewFn = typeof buildReportView;

const GRADES: readonly GradeBand[] = ["dead", "dying", "ailing", "alive"];

const skippedArb: fc.Arbitrary<SkippedEntry[]> = fc.array(
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 6 }),
    kind: fc.constant("dependencies" as const),
    specifier: fc.constantFrom("file:../x", "workspace:*", "git+https://x"),
    reason: fc.constantFrom("file" as const, "workspace" as const, "git" as const),
  }),
  { maxLength: 4 },
);

type Tamper = "none" | "total" | GradeBand | "skipped";

/** A ScanReport whose dependencies come from the view-model generator; the summary is correct or tampered. */
export const reportArb: fc.Arbitrary<ScanReport> = fc
  .tuple(
    graveRecordsArb,
    skippedArb,
    fc.constantFrom<Tamper>("none", "none", "total", "dead", "dying", "ailing", "alive", "skipped"),
    fc.integer({ min: 1, max: 5 }),
    fc.array(fc.constantFrom<"lockfile" | "range">("lockfile", "range"), { minLength: 60, maxLength: 60 }),
    fc.array(fc.string({ maxLength: 20 }), { maxLength: 3 }),
  )
  .map(([records, skipped, tamper, delta, sources, warnings]) => {
    const dependencies: ScannedDependency[] = records.map((r, i) => ({
      name: r.name,
      kinds: ["dependencies"],
      declaredRange: "^1.0.0",
      versionSource: sources[i % sources.length]!,
      // Not read by the header; the property is about grades and counts only.
      signals: {} as ScannedDependency["signals"],
      unknownReasons: {},
      evidenceWarnings: [],
      death: r.death,
    }));
    const summary = { total: dependencies.length, skipped: skipped.length, alive: 0, ailing: 0, dying: 0, dead: 0 };
    for (const d of dependencies) summary[d.death.grade] += 1;
    if (tamper === "total" || tamper === "skipped") summary[tamper] += delta;
    else if (tamper !== "none") summary[tamper] += delta;
    return { repo: "o/r", ref: "HEAD", scannedAt: "2026-11-13T04:09:00.000Z", dependencies, skipped, warnings, summary };
  });

/** Property 4, header half: header counts equal the grouped list sizes and an independent recount. */
export function build(impl: BuildReportViewFn = buildReportView) {
  return fc.property(reportArb, fc.constantFrom<"demo" | "live">("demo", "live"), (report, source) => {
    const before = JSON.stringify(report);
    const view = impl(report, source);
    const reference = buildGraveyard(report.dependencies);

    let sum = 0;
    view.graveyard.groups.forEach((g, i) => {
      const grade = GRADES[i]!;
      const recount = report.dependencies.filter((d) => d.death.grade === grade).length;
      ensure(view.header.counts[grade] === g.graves.length, `header.counts.${grade} ${view.header.counts[grade]} must equal list size ${g.graves.length}`);
      ensure(view.header.counts[grade] === recount, `header.counts.${grade} ${view.header.counts[grade]} must equal recount ${recount}`);
      ensure(view.header.counts[grade] === reference.counts[grade], `header.counts.${grade} must equal the view counts`);
      sum += view.header.counts[grade];
    });
    ensure(view.header.total === report.dependencies.length, `header.total ${view.header.total} must equal dependencies.length ${report.dependencies.length} (skipped excluded)`);
    ensure(sum === view.header.total, `header counts sum ${sum} must equal total ${view.header.total}`);
    ensure(view.header.skipped === report.skipped.length, "header.skipped must be the skipped count");

    const s = report.summary;
    const differs =
      s.total !== report.dependencies.length ||
      GRADES.some((g) => s[g] !== report.dependencies.filter((d) => d.death.grade === g).length);
    ensure(view.header.summaryDisagrees === differs, `summaryDisagrees ${view.header.summaryDisagrees} must be ${differs}`);
    ensure(JSON.stringify(report) === before, "the report must not be mutated");
  });
}
