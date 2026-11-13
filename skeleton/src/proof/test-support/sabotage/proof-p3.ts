// Sabotage_List for Property 3 (no trivial passes). Each entry is a deliberately wrong runProof.
import type { RunProofImpl } from "../../runner/run-proof.p3.test.js";
import { runProof } from "../../runner/run-proof.js";
import type { ProofInput, ProofResult } from "../../runner/types.js";
import type { Sabotage } from "../../../graveyard/test-support/sabotage-runner.js";

export const P3_REQUIRED = [
  "proved for zero call sites",
  "ignores unaccepted call sites",
  "skips the guard check",
  "skips the coverage check",
  "runs shapes that accept nothing",
  "filesScanned 0 is fine",
  "always recommends remove-dependency",
  "gates in a different order",
] as const;

const withRecipe = (input: ProofInput, f: (s: NonNullable<ProofInput["recipe"]>["shapes"][number]) => object): ProofInput =>
  input.recipe
    ? { ...input, recipe: { ...input.recipe, shapes: input.recipe.shapes.map((s) => ({ ...s, ...f(s) })) } }
    : input;

const impl = (f: (input: ProofInput) => ProofResult): RunProofImpl => ({ runProof: f });

export const P3_SABOTAGES: readonly Sabotage<RunProofImpl>[] = [
  {
    name: "proved for zero call sites",
    impl: impl((input) => {
      const r = runProof(input);
      return r.status === "no-call-sites" ? { ...r, status: "proved", recommendation: undefined } : r;
    }),
  },
  {
    name: "ignores unaccepted call sites",
    impl: impl((input) => {
      const shapes = input.recipe?.shapes ?? [];
      const callSites = input.usage.callSites.filter((c) => shapes.some((s) => s.accepts(c)));
      // Keep the original list when nothing is accepted, so the empty-usage gate is not what changes.
      return runProof({ ...input, usage: { ...input.usage, callSites: callSites.length > 0 ? callSites : input.usage.callSites } });
    }),
  },
  {
    name: "skips the guard check",
    impl: impl((input) => runProof(withRecipe(input, () => ({ guard: () => true })))),
  },
  {
    name: "skips the coverage check",
    impl: impl((input) => runProof(withRecipe(input, () => ({ requiredLabels: [] })))),
  },
  {
    name: "runs shapes that accept nothing",
    impl: impl((input) => runProof(withRecipe(input, () => ({ accepts: () => true })))),
  },
  {
    name: "filesScanned 0 is fine",
    impl: impl((input) => runProof({ ...input, usage: { ...input.usage, filesScanned: Math.max(1, input.usage.filesScanned) } })),
  },
  {
    name: "always recommends remove-dependency",
    impl: impl((input) => {
      const r = runProof(input);
      return r.status === "no-call-sites" ? { ...r, recommendation: "remove-dependency" } : r;
    }),
  },
  {
    name: "gates in a different order",
    impl: impl((input) => {
      // no_recipe is checked before the empty-usage gate.
      if (!input.recipe && input.usage.filesScanned > 0 && Number.isInteger(input.numRuns) && input.numRuns >= 100) {
        const r = runProof({ ...input, usage: { ...input.usage, callSites: input.usage.callSites } });
        return {
          ...r,
          status: "error",
          recommendation: undefined,
          error: { code: "no_recipe", message: `${input.package}: no recipe for this package` },
        };
      }
      return runProof(input);
    }),
  },
];
