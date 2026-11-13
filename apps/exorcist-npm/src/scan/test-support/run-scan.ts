import { createScanPipeline } from "../pipeline.js";
import type { PipelineParts } from "../pipeline.js";
import type { ScanOutcome } from "../types.js";
import { createCountingClock } from "./counting-clock.js";
import type { CountingClock } from "./counting-clock.js";
import { createGatedEvidence, driveScan } from "./gated-evidence.js";
import type { GateFailure, GatedEvidence } from "./gated-evidence.js";
import { memoryFiles } from "./memory-files.js";

export interface RunScanOptions {
  concurrency?: number;
  profileOf?: (name: string) => number;
  failures?: ReadonlyMap<string, GateFailure>;
  picks?: readonly number[];
  maxDependencies?: number;
}

export interface RunScanResult {
  outcome: ScanOutcome;
  gate: GatedEvidence;
  counting: CountingClock;
}

/** Run the real pipeline over in-memory seams: generated files, gated evidence, counting clock. */
export async function runScan(
  parts: PipelineParts,
  manifestText: string,
  lockfileText: string | undefined,
  opts: RunScanOptions = {},
): Promise<RunScanResult> {
  const files = memoryFiles(manifestText, lockfileText);
  const counting = createCountingClock();
  const gate = createGatedEvidence({ profileOf: opts.profileOf ?? (() => 0), ...(opts.failures ? { failures: opts.failures } : {}) });
  const pipeline = createScanPipeline(
    {
      evidence: gate.stage,
      files: files.source,
      clock: counting.clock,
      limits: { maxDependencies: opts.maxDependencies ?? 300, concurrency: opts.concurrency ?? 4 },
    },
    parts,
  );
  const outcome = await driveScan(pipeline({ owner: "o", repo: "r" }), gate, opts.picks ?? [0]);
  return { outcome, gate, counting };
}

/** Deterministic profile for a name from a generated table. */
export function profileFromTable(table: readonly number[]): (name: string) => number {
  return (name) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return table[h % Math.max(1, table.length)] ?? 0;
  };
}
