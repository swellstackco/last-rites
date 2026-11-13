// Differential runner: one Call_Shape, one Oracle, one Candidate, one seed.
import fc from "fast-check";
import type { ProofErrorCode } from "../types.js";
import { deepClone } from "./clone.js";
import { capture, isThenable, outcomesAgree, render, renderOutcome } from "./outcome.js";
import type { CallShape, Outcome } from "./types.js";

/** A member found on a module: the function and the object that holds it (`this`). */
export interface ResolvedMember {
  fn: (...a: unknown[]) => unknown;
  thisArg: unknown;
}

/** The arbitrary produced a value `guard` rejects, or no run at all. */
export class ArbitraryMismatch extends Error {}
/** A side returned a thenable. */
export class AsyncOutput extends Error {}
/** Recipe code (`guard`, `classify`, Projection, clone) threw. */
export class RecipeFailure extends Error {}

export interface ShapeCounterexample {
  args: unknown[];
  input: string;
  shrinks: number;
  path: string;
  oldOutput: string;
  newOutput: string;
  oldProjected: string;
  newProjected: string;
}

export interface ShapeRun {
  id: string;
  status: "passed" | "failed" | "error";
  /** Runs fast-check executed (the failing run included, shrink attempts not). */
  runs: number;
  /** Label counts. Note: on a failed shape the counts also include shrink attempts. */
  coverage: Record<string, number>;
  counterexample?: ShapeCounterexample;
  error?: { code: ProofErrorCode; message: string };
}

export interface ShapeConfig {
  numRuns: number;
  seed: number;
}

/** Runs recipe code; anything it throws becomes a `RecipeFailure` with a generic message. */
function safely<T>(shape: CallShape, what: string, f: () => T): T {
  try {
    return f();
  } catch (e) {
    if (e instanceof ArbitraryMismatch || e instanceof AsyncOutput || e instanceof RecipeFailure) throw e;
    throw new RecipeFailure(`${shape.id}: ${what} threw`);
  }
}

function guardOrThrow(shape: CallShape, args: unknown[]): void {
  const ok = safely(shape, "guard", () => shape.guard(args));
  if (!ok) throw new ArbitraryMismatch(`${shape.id}: the arbitrary produced arguments that guard rejects`);
}

function call(m: ResolvedMember, args: unknown[]): unknown {
  return m.fn.apply(m.thisArg, args);
}

function rejectThenables(shape: CallShape, ...outcomes: Outcome[]): void {
  for (const o of outcomes) {
    if (o.kind === "returned" && isThenable(o.value)) {
      try {
        (o.value as PromiseLike<unknown>).then(undefined, () => undefined); // no unhandled rejection
      } catch {
        // ignore
      }
      throw new AsyncOutput(`${shape.id}: a side returned a thenable`);
    }
  }
}

function errorOf(e: unknown): { code: ProofErrorCode; message: string } | undefined {
  if (e instanceof ArbitraryMismatch) return { code: "arbitrary_mismatch", message: e.message };
  if (e instanceof AsyncOutput) return { code: "async_not_supported", message: e.message };
  if (e instanceof RecipeFailure) return { code: "recipe_failure", message: e.message };
  return undefined;
}

export function runShape(
  shape: CallShape,
  oracle: ResolvedMember,
  candidate: ResolvedMember,
  cfg: ShapeConfig,
): ShapeRun {
  const coverage = new Map<string, number>();
  const both = (args: unknown[]): [Outcome, Outcome] => {
    const forOracle = safely(shape, "cloning the arguments", () => deepClone(args));
    const forCandidate = safely(shape, "cloning the arguments", () => deepClone(args));
    return [capture(() => call(oracle, forOracle)), capture(() => call(candidate, forCandidate))];
  };
  const snapshot = (): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [k, v] of coverage) out[k] = v;
    return out;
  };

  try {
    const prop = fc.property(shape.arbitrary, (args) => {
      guardOrThrow(shape, args);
      const [a, b] = both(args);
      rejectThenables(shape, a, b);
      for (const l of safely(shape, "classify", () => shape.classify(args, a))) {
        coverage.set(l, (coverage.get(l) ?? 0) + 1);
      }
      return safely(shape, "projection", () => outcomesAgree(shape.projection, a, b));
    });
    const d = fc.check(prop, { numRuns: cfg.numRuns, seed: cfg.seed });

    if (!d.failed) {
      if (d.numRuns === 0) {
        return {
          id: shape.id,
          status: "error",
          runs: 0,
          coverage: snapshot(),
          error: { code: "arbitrary_mismatch", message: `${shape.id}: the arbitrary produced no value` },
        };
      }
      return { id: shape.id, status: "passed", runs: d.numRuns, coverage: snapshot() };
    }

    const err = errorOf(d.errorInstance);
    if (err) return { id: shape.id, status: "error", runs: d.numRuns, coverage: snapshot(), error: err };

    const args = (d.counterexample as [unknown[]])[0];
    // Re-run both sides on fresh clones, so the rendered outputs are exactly what a re-run gives.
    const [a, b] = both(args);
    const project = (o: Outcome): string =>
      o.kind === "threw" ? "<threw>" : safely(shape, "projection", () => render(shape.projection.apply(o.value)));
    return {
      id: shape.id,
      status: "failed",
      runs: d.numRuns,
      coverage: snapshot(),
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
  } catch (e) {
    const err = errorOf(e) ?? { code: "recipe_failure" as const, message: `${shape.id}: the recipe failed` };
    return { id: shape.id, status: "error", runs: 0, coverage: snapshot(), error: err };
  }
}
