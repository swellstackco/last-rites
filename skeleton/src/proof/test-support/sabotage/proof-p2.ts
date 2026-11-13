// Sabotage_List for Property 2 (counterexample reality). Each entry is a deliberately wrong runShape.
import fc from "fast-check";
import type { RunShapeImpl } from "../../runner/differential.p2.test.js";
import { runShape, type ResolvedMember, type ShapeRun } from "../../runner/differential.js";
import { deepClone } from "../../runner/clone.js";
import { capture, outcomesAgree, render, renderOutcome } from "../../runner/outcome.js";
import type { CallShape, Outcome } from "../../runner/types.js";
import type { Sabotage } from "../../../graveyard/test-support/sabotage-runner.js";

export const P2_REQUIRED = [
  "reports the pre-shrink arguments",
  "swaps old and new output",
  "renders the new output from a different call",
  "passes the same argument object to both sides",
  "reports the arguments of the last passing run",
] as const;

const call = (m: ResolvedMember, args: unknown[]): unknown => m.fn.apply(m.thisArg, args);

/** A small differential runner with one switchable defect. Only what Property 2 looks at is filled in. */
function naive(mode: "shared" | "last-passing") {
  return (shape: CallShape, oracle: ResolvedMember, candidate: ResolvedMember, cfg: { numRuns: number; seed: number }): ShapeRun => {
    let previous: unknown[] | undefined;
    const sides = (args: unknown[]): [Outcome, Outcome] => {
      if (mode === "shared") {
        const one = deepClone(args); // one object for both sides (fast-check's own value stays intact)
        return [capture(() => call(oracle, one)), capture(() => call(candidate, one))];
      }
      return [capture(() => call(oracle, deepClone(args))), capture(() => call(candidate, deepClone(args)))];
    };
    const prop = fc.property(shape.arbitrary, (args) => {
      const [a, b] = sides(args);
      const ok = outcomesAgree(shape.projection, a, b);
      if (ok) previous = args;
      return ok;
    });
    const d = fc.check(prop, { numRuns: cfg.numRuns, seed: cfg.seed });
    if (!d.failed) return { id: shape.id, status: "passed", runs: d.numRuns, coverage: {} };
    const shrunk = (d.counterexample as [unknown[]])[0];
    const args = mode === "last-passing" && previous ? previous : shrunk;
    const [a, b] = sides(deepClone(args));
    const project = (o: Outcome): string => (o.kind === "threw" ? "<threw>" : render(shape.projection.apply(o.value)));
    return {
      id: shape.id,
      status: "failed",
      runs: d.numRuns,
      coverage: {},
      counterexample: {
        args,
        input: fc.stringify(args),
        shrinks: d.numShrinks,
        path: d.counterexamplePath ?? "",
        oldOutput: renderOutcome(a),
        newOutput: renderOutcome(b),
        oldProjected: project(a),
        newProjected: project(b),
      },
    };
  };
}

function postProcess(f: (r: ShapeRun, c: { shape: CallShape; oracle: ResolvedMember; candidate: ResolvedMember }) => ShapeRun): RunShapeImpl {
  return {
    runShape: (shape, oracle, candidate, cfg) =>
      f(runShape(shape, oracle, candidate, cfg), { shape, oracle, candidate }),
  };
}

export const P2_SABOTAGES: readonly Sabotage<RunShapeImpl>[] = [
  {
    name: "reports the pre-shrink arguments",
    impl: { runShape: (shape, oracle, candidate, cfg) => runShape({ ...shape, arbitrary: shape.arbitrary.noShrink() }, oracle, candidate, cfg) },
  },
  {
    name: "swaps old and new output",
    impl: postProcess((r) => {
      const c = r.counterexample;
      if (!c) return r;
      return {
        ...r,
        counterexample: { ...c, oldOutput: c.newOutput, newOutput: c.oldOutput, oldProjected: c.newProjected, newProjected: c.oldProjected },
      };
    }),
  },
  {
    name: "renders the new output from a different call",
    impl: postProcess((r, { candidate }) => {
      const c = r.counterexample;
      if (!c) return r;
      const other = renderOutcome(capture(() => call(candidate, [])));
      return { ...r, counterexample: { ...c, newOutput: other, newProjected: other } };
    }),
  },
  { name: "passes the same argument object to both sides", impl: { runShape: naive("shared") } },
  { name: "reports the arguments of the last passing run", impl: { runShape: naive("last-passing") } },
];
