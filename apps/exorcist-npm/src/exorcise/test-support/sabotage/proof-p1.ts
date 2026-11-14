// Sabotage_List for Property 1 (differential soundness). Each entry is runProof with one comparison defect added,
// built by rewriting the input (projection, or the functions of the two modules) before the real runProof runs.
import { runProof, type CallShape, type ProofInput } from "@last-rites/skeleton/proof/runner";
import type { Sabotage } from "../../../evidence/test-support/sabotage-runner.js";
import type { DifferentialImpl } from "../../recipes.p1.test.js";

export const P1_REQUIRED = [
  "compare outputs with ===",
  "compare thrown messages",
  "call without this",
  "project only the oracle side",
  "compare with JSON.stringify",
] as const;

type Fn = (...a: unknown[]) => unknown;

const impl = (rewrite: (input: ProofInput) => ProofInput): DifferentialImpl => ({
  runProof: (input) => runProof(rewrite(input)),
});

/** A rewritten Projection for every shape of the recipe. */
function withProjection(input: ProofInput, apply: (shape: CallShape, v: unknown) => unknown): ProofInput {
  if (!input.recipe) return input;
  const shapes = input.recipe.shapes.map(
    (s): CallShape => ({ ...s, projection: { ...s.projection, apply: (v) => apply(s, s.projection.apply(v)) } }),
  );
  return { ...input, recipe: { ...input.recipe, shapes } };
}

/** A copy of `module` whose shape members are `wrap(fn, shape)`; `this` is the original module. */
function mapModule(module: unknown, input: ProofInput, wrap: (f: Fn, shape: CallShape) => Fn): unknown {
  if (!input.recipe) return module;
  const mod = module as Record<string, Fn> & Fn;
  const bound = (s: CallShape): Fn => {
    const f = s.member === "" ? mod : mod[s.member];
    return typeof f === "function" ? (f as Fn) : (() => undefined);
  };
  const out: Record<string, unknown> & Fn =
    typeof module === "function"
      ? (((...a: unknown[]) => {
          const s = input.recipe!.shapes.find((x) => x.member === "");
          return s ? wrap((...b) => (mod as Fn)(...b), s)(...a) : (mod as Fn)(...a);
        }) as Record<string, unknown> & Fn)
      : ({} as never);
  for (const s of input.recipe.shapes) {
    if (s.member === "") continue;
    const f = bound(s);
    out[s.member] = wrap((...b) => f.apply(module, b), s);
  }
  return out;
}

const isObjectLike = (v: unknown): boolean => (typeof v === "object" && v !== null) || typeof v === "function";

export const P1_SABOTAGES: readonly Sabotage<DifferentialImpl>[] = [
  {
    // Every object-like projected value becomes a fresh symbol: reference identity, never equal.
    name: "compare outputs with ===",
    impl: impl((input) => withProjection(input, (_s, v) => (isObjectLike(v) ? Symbol("fresh") : v))),
  },
  {
    // A throw is turned into a returned message, so two different messages become different outcomes.
    name: "compare thrown messages",
    impl: impl((input) => {
      const wrap = (f: Fn): Fn => (...a) => {
        try {
          return f(...a);
        } catch (e) {
          return { threw: e instanceof Error ? e.message : String(e) };
        }
      };
      return { ...input, oracle: mapModule(input.oracle, input, wrap), candidate: mapModule(input.candidate, input, wrap) };
    }),
  },
  {
    // Both sides are called with `this` undefined instead of their module.
    name: "call without this",
    impl: impl((input) => {
      const strip = (module: unknown): unknown => {
        if (!input.recipe) return module;
        const mod = module as Record<string, Fn> & Fn;
        const out: Record<string, unknown> & Fn =
          typeof module === "function" ? (((...a: unknown[]) => (mod as Fn)(...a)) as Record<string, unknown> & Fn) : ({} as never);
        for (const s of input.recipe.shapes) {
          if (s.member === "") continue;
          const f = mod[s.member]!;
          out[s.member] = (...a: unknown[]) => {
            const detached = f;
            return detached(...a);
          };
        }
        return out;
      };
      return { ...input, oracle: strip(input.oracle), candidate: strip(input.candidate) };
    }),
  },
  {
    // The candidate's output goes through the Projection once more than the oracle's.
    name: "project only the oracle side",
    impl: impl((input) =>
      ({
        ...input,
        candidate: mapModule(input.candidate, input, (f, s) => (...a) => s.projection.apply(f(...a))),
      }),
    ),
  },
  {
    name: "compare with JSON.stringify",
    impl: impl((input) => withProjection(input, (_s, v) => JSON.stringify(v))),
  },
];
