import type { Sabotage } from "../../../evidence/test-support/sabotage-runner.js";
import { assembleReport } from "../../assemble.js";
import type { AssembleReport } from "../../assemble.js";
import { REAL_PARTS } from "../../pipeline.js";
import type { PipelineParts } from "../../pipeline.js";
import type { PoolRunner } from "../../pool.js";

/** Names required by Requirement 14.10 for this list. */
export const SCAN_P1_REQUIRED: readonly string[] = ["order report by completion order"];

/** Results appended in completion order instead of written by index. */
const completionOrderPool: PoolRunner = async (items, limit, worker, signal) => {
  const results: unknown[] = [];
  let next = 0;
  const loop = async (): Promise<void> => {
    while (!signal?.aborted && next < items.length) {
      const i = next++;
      results.push(await worker(items[i] as never, i));
    }
  };
  await Promise.all(Array.from({ length: Math.max(0, Math.min(limit, items.length)) }, () => loop()));
  return { results: results as never, stoppedEarly: false };
};

const unsortedAssemble: AssembleReport = (input) => {
  const real = assembleReport(input);
  return { ...real, dependencies: [...input.scanned] };
};

const randomTiebreakAssemble: AssembleReport = (input) => {
  const real = assembleReport(input);
  const dependencies = [...input.scanned].sort(
    (a, b) => b.death.score - a.death.score || (Math.random() < 0.5 ? -1 : 1),
  );
  return { ...real, dependencies };
};

const elapsedAssemble: AssembleReport = (input) => {
  const real = assembleReport(input);
  return { ...real, warnings: [...real.warnings, `scan took ${performance.now()} ms`] };
};

const everythingAtOnce: PoolRunner = async (items, _limit, worker) => ({
  results: (await Promise.all(items.map((item, i) => worker(item, i)))) as never,
  stoppedEarly: false,
});

export const SCAN_P1_SABOTAGES: ReadonlyArray<Sabotage<PipelineParts>> = [
  {
    name: "order report by completion order",
    impl: { ...REAL_PARTS, pool: completionOrderPool, assemble: unsortedAssemble },
  },
  { name: "random tiebreak", impl: { ...REAL_PARTS, assemble: randomTiebreakAssemble } },
  { name: "elapsed-time warning", impl: { ...REAL_PARTS, assemble: elapsedAssemble } },
  {
    name: "per-call now",
    impl: { ...REAL_PARTS, scanOne: (entry, ctx) => REAL_PARTS.scanOne(entry, { ...ctx, now: new Date() }) },
  },
  { name: "pool ignores the limit", impl: { ...REAL_PARTS, pool: everythingAtOnce } },
];
