// Sabotage_List for Property 4 (sabotage completeness). Each entry is a subject (recipes + Mutators) with one defect,
// so that some applicable Mutator survives or the applicability table is wrong.
import type { CallShape, Mutator } from "@graveyard-kit/skeleton/proof/runner";
import type { Sabotage } from "../../../evidence/test-support/sabotage-runner.js";
import { REAL_P4_SUBJECT, type P4Subject } from "../../recipes.p4.test.js";

export const P4_REQUIRED = [
  "a Mutator that returns the original output",
  "an intersect arbitrary limited to lists of length 0 or 1",
  "a deep-diff arbitrary that never makes equal pairs",
  "a recipe claiming orderSensitive for a symmetric function",
  "a recipe declaring outputKind array for an object output",
] as const;

/** The real subject with the shapes of one case rewritten. */
const withShapes = (caseName: string, rewrite: (s: CallShape) => CallShape): P4Subject => ({
  ...REAL_P4_SUBJECT,
  cases: REAL_P4_SUBJECT.cases.map((c) => (c.name === caseName ? { ...c, shapes: c.shapes.map(rewrite) } : c)),
});

export const P4_SABOTAGES: readonly Sabotage<P4Subject>[] = [
  {
    name: P4_REQUIRED[0],
    impl: {
      ...REAL_P4_SUBJECT,
      // Claims to reverse (and so on) but hands back the original output.
      mutators: REAL_P4_SUBJECT.mutators.map((m): Mutator => ({ ...m, wrap: (f) => f })),
    },
  },
  {
    name: P4_REQUIRED[1],
    impl: withShapes("intersect", (s) => ({
      ...s,
      // At most one list of at most one id: the result has at most one element, so a reversal cannot show.
      arbitrary: s.arbitrary.map((args): unknown[] => [(args[0] as string[][]).slice(0, 1).map((l) => l.slice(0, 1))]),
    })),
  },
  {
    name: P4_REQUIRED[2],
    impl: withShapes("deep-diff", (s) => ({
      ...s,
      // The second value always differs from the first, so the Oracle never returns undefined.
      arbitrary: s.arbitrary.map((args): unknown[] => [args[0], { __other__: args[0] }]),
    })),
  },
  {
    name: P4_REQUIRED[3],
    impl: withShapes("first-of-two", (s) => ({ ...s, orderSensitive: true })),
  },
  {
    name: P4_REQUIRED[4],
    impl: withShapes("make-record", (s) => ({ ...s, outputKind: "array" })),
  },
];

