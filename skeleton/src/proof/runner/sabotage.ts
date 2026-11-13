// Sabotage_Check: wrap the Candidate with each applicable Mutator and require the same property to fail.
import type { SabotageSummary } from "../types.js";
import { runShape, type ResolvedMember } from "./differential.js";
import { BUILT_IN_MUTATORS, applicableMutators } from "./mutators.js";
import type { CallShape, Mutator } from "./types.js";

export interface ShapeSides {
  oracle: ResolvedMember;
  candidate: ResolvedMember;
}

/**
 * `shapes` are the Call_Shapes that ran (in recipe order). A mutant is caught if and only if its run is a
 * counterexample; an `error` run counts as a survivor, because the mutant was not shown to fail.
 */
export function runSabotage(
  shapes: readonly CallShape[],
  resolve: (shape: CallShape) => ShapeSides,
  cfg: { numRuns: number; seed: number },
  mutators: readonly Mutator[] = BUILT_IN_MUTATORS,
): SabotageSummary {
  let applied = 0;
  let caught = 0;
  const survivors: string[] = [];
  for (const shape of shapes) {
    const { oracle, candidate } = resolve(shape);
    for (const mutator of applicableMutators(shape, mutators)) {
      applied++;
      const mutant: ResolvedMember = { fn: mutator.wrap(candidate.fn), thisArg: candidate.thisArg };
      const run = runShape(shape, oracle, mutant, cfg);
      if (run.status === "failed") caught++;
      else survivors.push(`${shape.id}:${mutator.name}`);
    }
  }
  return { applied, caught, survivors };
}
