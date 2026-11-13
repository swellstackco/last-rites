// Feature: proof-harness, Property 2: Counterexample reality
import fc from "fast-check";
import { describe, it } from "vitest";
import { assertProperty } from "../../death-score/fc-runner.js";
import { FAULT_FAMILY, SYNTHETIC_CASES, moduleFor } from "../test-support/synthetic-recipes.js";
import { deepClone } from "./clone.js";
import { runShape, type ResolvedMember } from "./differential.js";
import { capture, outcomesAgree, renderOutcome, render, resolveMember } from "./outcome.js";
import type { CallShape } from "./types.js";

/** The one function Property 2 is about; sabotage lists replace it. */
export interface RunShapeImpl {
  runShape: typeof runShape;
}

export const REAL_RUN_SHAPE_IMPL: RunShapeImpl = { runShape };

const CFG_RUNS = 100;

function resolve(shape: CallShape, fn: (...a: unknown[]) => unknown): ResolvedMember {
  const r = resolveMember(moduleFor(shape, fn), shape.member);
  if (!r) throw new Error("member not found");
  return r;
}

function call(m: ResolvedMember, args: unknown[]): unknown {
  return m.fn.apply(m.thisArg, args);
}

const MUTATE = FAULT_FAMILY.find((f) => f.name === "mutate its input")!;

export function build(impl: RunShapeImpl = REAL_RUN_SHAPE_IMPL) {
  return fc.property(
    fc.nat({ max: SYNTHETIC_CASES.length - 1 }),
    fc.nat({ max: FAULT_FAMILY.length }), // FAULT_FAMILY.length means no fault
    fc.boolean(),
    fc.nat({ max: 1_000_000 }),
    (caseIdx, faultIdx, oracleMutates, seed) => {
      const c = SYNTHETIC_CASES[caseIdx]!;
      const fault = FAULT_FAMILY[faultIdx];
      const oracleFn = oracleMutates ? MUTATE.wrap(c.oracle, c) : c.oracle;
      const candidateFn = fault ? fault.wrap(c.oracle, c) : c.candidate;
      const oracle = resolve(c.shape, oracleFn);
      const candidate = resolve(c.shape, candidateFn);
      const label = `${c.name} / ${fault?.name ?? "no fault"} / oracleMutates=${oracleMutates} / seed ${seed}`;
      const run = impl.runShape(c.shape, oracle, candidate, { numRuns: CFG_RUNS, seed });

      if (run.status === "error") throw new Error(`${label}: unexpected error ${run.error?.code}`);

      // Faults the argument clones hide, and a correct candidate, must pass.
      if (faultIdx === FAULT_FAMILY.length || fault?.equivalent) {
        if (run.status !== "passed") throw new Error(`${label}: an equivalent candidate did not pass (${run.status})`);
        return;
      }
      if (run.status !== "failed") return; // a rare fault may stay unseen in 100 runs
      const ce = run.counterexample;
      if (!ce) throw new Error(`${label}: failed without a counterexample`);

      // The reported arguments are real, and both sides really differ on fresh clones of them.
      if (!c.shape.guard(ce.args)) throw new Error(`${label}: reported args fail guard: ${fc.stringify(ce.args)}`);
      const a = capture(() => call(oracle, deepClone(ce.args)));
      const b = capture(() => call(candidate, deepClone(ce.args)));
      if (outcomesAgree(c.shape.projection, a, b)) {
        throw new Error(`${label}: both sides agree on the reported args ${fc.stringify(ce.args)}`);
      }
      // The rendered fields equal what a re-run renders.
      const project = (o: typeof a): string => (o.kind === "threw" ? "<threw>" : render(c.shape.projection.apply(o.value)));
      const expected = {
        input: fc.stringify(ce.args),
        oldOutput: renderOutcome(a),
        newOutput: renderOutcome(b),
        oldProjected: project(a),
        newProjected: project(b),
      };
      for (const k of Object.keys(expected) as (keyof typeof expected)[]) {
        if (ce[k] !== expected[k]) throw new Error(`${label}: ${k} is ${ce[k]} but a re-run gives ${expected[k]}`);
      }
      if (run.runs < 1 || run.runs > CFG_RUNS) throw new Error(`${label}: runs ${run.runs} out of range`);

      // The (seed, path) pair replays to exactly these arguments, and they cannot shrink any further.
      const replay = fc.check(
        fc.property(c.shape.arbitrary, (args) =>
          outcomesAgree(
            c.shape.projection,
            capture(() => call(oracle, deepClone(args))),
            capture(() => call(candidate, deepClone(args))),
          ),
        ),
        { numRuns: CFG_RUNS, seed, path: ce.path },
      );
      if (!replay.failed) throw new Error(`${label}: replaying path ${ce.path} did not fail`);
      const replayed = fc.stringify((replay.counterexample as [unknown[]])[0]);
      if (replayed !== ce.input) {
        throw new Error(`${label}: reported ${ce.input} is not the shrunk counterexample (replay gives ${replayed})`);
      }
    },
  );
}

describe("Property 2: Counterexample reality", () => {
  it("holds for runShape", () => {
    assertProperty("counterexample reality", build(REAL_RUN_SHAPE_IMPL));
  });
});
