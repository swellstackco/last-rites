import type { Sabotage } from "@last-rites/skeleton/graveyard/testing";
import { buildReportView } from "../../model/report-view.js";
import type { ReportView } from "../../model/report-view.js";
import type { BuildReportViewFn } from "../properties/p4.js";

const real = buildReportView;

function patch(f: (v: ReportView, report: Parameters<BuildReportViewFn>[0]) => Partial<ReportView["header"]>): BuildReportViewFn {
  return (report, source) => {
    const v = real(report, source);
    return { ...v, header: { ...v.header, ...f(v, report) } };
  };
}

/** Header sabotages (the view-model sabotages live in the skeleton). */
export const P4_HEADER_SABOTAGES: readonly Sabotage<BuildReportViewFn>[] = [
  {
    name: "header counts copied from report.summary",
    impl: patch((_v, r) => ({ counts: { dead: r.summary.dead, dying: r.summary.dying, ailing: r.summary.ailing, alive: r.summary.alive } })),
  },
  { name: "header total includes skipped", impl: patch((v, r) => ({ total: v.header.total + r.skipped.length })) },
  { name: "summaryDisagrees always false", impl: patch(() => ({ summaryDisagrees: false })) },
  { name: "header counts dying as dead", impl: patch((v) => ({ counts: { ...v.header.counts, dead: v.header.counts.dead + v.header.counts.dying, dying: 0 } })) },
  { name: "header alive count off by one", impl: patch((v) => ({ counts: { ...v.header.counts, alive: v.header.counts.alive + 1 } })) },
];
