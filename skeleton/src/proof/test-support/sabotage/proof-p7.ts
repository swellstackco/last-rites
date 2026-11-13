// Sabotage_List for Property 7 (sabotage accounting and the weak flag). Each entry is a deliberately wrong runProof.
import type { SabotageImpl } from "../../runner/sabotage.p7.test.js";
import { BUILT_IN_MUTATORS, applicableMutators } from "../../runner/mutators.js";
import { runProof } from "../../runner/run-proof.js";
import type { Mutator, ProofInput, ProofResult } from "../../runner/types.js";
import type { Sabotage } from "../../../graveyard/test-support/sabotage-runner.js";

export const P7_REQUIRED = [
  "weak ignores survivors",
  "weak false when applied is 0",
  "survivors include the caught mutants",
  "sabotage check for a counterexample status",
  "applied counted before filtering by applicability",
  "survivors in discovery order of a reversed mutator list",
  "a Mutator that writes into its argument",
] as const;

const impl = (f: (input: ProofInput) => ProofResult): SabotageImpl => ({ runProof: f });

/** The shapes that ran in a result, with the mutator list the input used. */
function ranShapes(input: ProofInput, r: ProofResult) {
  const ran = new Set(r.shapes.filter((s) => s.status !== "skipped").map((s) => s.id));
  return (input.recipe?.shapes ?? []).filter((s) => ran.has(s.id));
}

export const P7_SABOTAGES: readonly Sabotage<SabotageImpl>[] = [
  {
    name: "weak ignores survivors",
    impl: impl((input) => {
      const r = runProof(input);
      return r.status === "proved" ? { ...r, weak: r.sabotage.applied === 0 } : r;
    }),
  },
  {
    name: "weak false when applied is 0",
    impl: impl((input) => {
      const r = runProof(input);
      return r.status === "proved" ? { ...r, weak: r.sabotage.survivors.length > 0 } : r;
    }),
  },
  {
    name: "survivors include the caught mutants",
    impl: impl((input) => {
      const r = runProof(input);
      if (r.status !== "proved") return r;
      const list = input.mutators ?? BUILT_IN_MUTATORS;
      const survivors = ranShapes(input, r).flatMap((s) => applicableMutators(s, list).map((m) => `${s.id}:${m.name}`));
      return { ...r, sabotage: { ...r.sabotage, survivors } };
    }),
  },
  {
    name: "sabotage check for a counterexample status",
    impl: impl((input) => {
      const r = runProof(input);
      if (r.status !== "counterexample") return r;
      // The oracle against itself is proved, and so runs every applicable mutant.
      return { ...r, sabotage: runProof({ ...input, candidate: input.oracle }).sabotage };
    }),
  },
  {
    name: "applied counted before filtering by applicability",
    impl: impl((input) => {
      const r = runProof(input);
      if (r.status !== "proved") return r;
      const list = input.mutators ?? BUILT_IN_MUTATORS;
      return { ...r, sabotage: { ...r.sabotage, applied: ranShapes(input, r).length * list.length } };
    }),
  },
  {
    name: "survivors in discovery order of a reversed mutator list",
    impl: impl((input) => runProof({ ...input, mutators: [...(input.mutators ?? BUILT_IN_MUTATORS)].reverse() })),
  },
  {
    name: "a Mutator that writes into its argument",
    impl: impl((input) => {
      const writing = (input.mutators ?? BUILT_IN_MUTATORS).map(
        (m): Mutator => ({
          ...m,
          wrap: (f) =>
            m.wrap(function (this: unknown, ...a: unknown[]) {
              if (a.length > 0) a[0] = 999;
              return f.apply(this, a);
            }),
        }),
      );
      return runProof({ ...input, mutators: writing });
    }),
  },
];
