import { scoreDeath } from "@last-rites/skeleton";
import type { Sabotage } from "../../../evidence/test-support/sabotage-runner.js";
import { assembleReport } from "../../assemble.js";
import type { AssembleReport } from "../../assemble.js";
import { REAL_PARTS } from "../../pipeline.js";
import type { PipelineParts } from "../../pipeline.js";
import type { ScannedDependency } from "../../types.js";
import { evidenceFor } from "../gated-evidence.js";

/** Names required by Requirement 14.10 for this list. */
export const SCAN_P4_REQUIRED: readonly string[] = ["sort by score ascending", "omit the name tiebreak"];

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The real report with `dependencies` replaced by a different sort of the input. */
function sortedBy(sort: (a: ScannedDependency, b: ScannedDependency) => number): AssembleReport {
  return (input) => ({ ...assembleReport(input), dependencies: [...input.scanned].sort(sort) });
}

function summaryEdit(edit: (s: ReturnType<AssembleReport>["summary"], skipped: number) => void): AssembleReport {
  return (input) => {
    const r = assembleReport(input);
    const summary = { ...r.summary };
    edit(summary, input.skipped.length);
    return { ...r, summary };
  };
}

const withAssemble = (assemble: AssembleReport): PipelineParts => ({ ...REAL_PARTS, assemble });

export const SCAN_P4_SABOTAGES: ReadonlyArray<Sabotage<PipelineParts>> = [
  {
    name: "sort by score ascending",
    impl: withAssemble(sortedBy((a, b) => a.death.score - b.death.score || cmp(a.name, b.name))),
  },
  { name: "omit the name tiebreak", impl: withAssemble(sortedBy((a, b) => b.death.score - a.death.score)) },
  {
    name: "tiebreak by name descending",
    impl: withAssemble(sortedBy((a, b) => b.death.score - a.death.score || cmp(b.name, a.name))),
  },
  {
    name: "tiebreak with localeCompare",
    impl: withAssemble(sortedBy((a, b) => b.death.score - a.death.score || a.name.localeCompare(b.name))),
  },
  {
    name: "summary counts a dying dependency as dead",
    impl: withAssemble(
      summaryEdit((s) => {
        s.dead += s.dying;
        s.dying = 0;
      }),
    ),
  },
  {
    name: "summary total includes skipped names",
    impl: withAssemble(
      summaryEdit((s, skipped) => {
        s.total += skipped;
      }),
    ),
  },
  {
    name: "scanOne drops replacement",
    impl: {
      ...REAL_PARTS,
      scanOne: async (entry, ctx) => {
        const r = await REAL_PARTS.scanOne(entry, ctx);
        const { replacement: _drop, ...dep } = r.dep;
        return { ...r, dep };
      },
    },
  },
  {
    name: "scanOne scores a constant",
    impl: {
      ...REAL_PARTS,
      scanOne: async (entry, ctx) => {
        const r = await REAL_PARTS.scanOne(entry, ctx);
        return { ...r, dep: { ...r.dep, death: scoreDeath(evidenceFor(0, "constant").signals) } };
      },
    },
  },
];
