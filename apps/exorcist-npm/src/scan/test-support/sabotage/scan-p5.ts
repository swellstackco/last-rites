import { SIGNAL_NAMES, scoreDeath } from "@last-rites/skeleton";
import type { PackageSignals } from "@last-rites/skeleton";
import type { Sabotage } from "../../../evidence/test-support/sabotage-runner.js";
import type { EvidenceStage } from "../../../evidence/index.js";
import { assembleReport } from "../../assemble.js";
import type { AssembleReport } from "../../assemble.js";
import { REAL_PARTS } from "../../pipeline.js";
import type { PipelineParts, ScanOne } from "../../pipeline.js";

/** Names required by Requirement 14.10 for this list. */
export const SCAN_P5_REQUIRED: readonly string[] = ["one failed evidence call fails the whole scan"];

const withScanOne = (scanOne: ScanOne): PipelineParts => ({ ...REAL_PARTS, scanOne });

const isFailed = (d: { unknownReasons: Record<string, { category?: string } | undefined> }): boolean =>
  d.unknownReasons["deprecated"]?.category === "network_error";

const alwaysFails: EvidenceStage = () => Promise.reject(new Error("poisoned"));
const poisoned = new WeakSet<object>();

const aliveSignals = (): PackageSignals => {
  const s: Record<string, unknown> = {};
  for (const n of SIGNAL_NAMES) {
    const boolean = n === "deprecated" || n === "repoArchived" || n === "knownReplacementExists";
    s[n] = { kind: "known", value: boolean ? false : 0 };
  }
  return s as unknown as PackageSignals;
};

const assembleWith = (edit: (r: ReturnType<AssembleReport>) => ReturnType<AssembleReport>): AssembleReport => (input) =>
  edit(assembleReport(input));

export const SCAN_P5_SABOTAGES: ReadonlyArray<Sabotage<PipelineParts>> = [
  {
    name: "one failed evidence call fails the whole scan",
    impl: withScanOne(async (entry, ctx) => {
      const r = await REAL_PARTS.scanOne(entry, ctx);
      if (r.failed) throw new Error("evidence failed");
      return r;
    }),
  },
  {
    name: "drop the failed dependency from dependencies",
    impl: {
      ...REAL_PARTS,
      assemble: assembleWith((r) => ({ ...r, dependencies: r.dependencies.filter((d) => !isFailed(d)) })),
    },
  },
  {
    name: "failed as alive",
    impl: withScanOne(async (entry, ctx) => {
      const r = await REAL_PARTS.scanOne(entry, ctx);
      if (!r.failed) return r;
      const signals = aliveSignals();
      return { ...r, dep: { ...r.dep, signals, unknownReasons: {}, death: scoreDeath(signals) } };
    }),
  },
  {
    name: "failure poisons later entries",
    impl: withScanOne(async (entry, ctx) => {
      const evidence = poisoned.has(ctx.evidence) ? alwaysFails : ctx.evidence;
      const r = await REAL_PARTS.scanOne(entry, { ...ctx, evidence });
      if (r.failed) poisoned.add(ctx.evidence);
      return r;
    }),
  },
  {
    name: "no report warning for a failed entry",
    impl: {
      ...REAL_PARTS,
      assemble: assembleWith((r) => ({ ...r, warnings: r.warnings.filter((w) => !w.startsWith("evidence failed for ")) })),
    },
  },
  {
    name: "failed entry keeps stale reasons",
    impl: withScanOne(async (entry, ctx) => {
      const r = await REAL_PARTS.scanOne(entry, ctx);
      return r.failed ? { ...r, dep: { ...r.dep, unknownReasons: {} } } : r;
    }),
  },
];
