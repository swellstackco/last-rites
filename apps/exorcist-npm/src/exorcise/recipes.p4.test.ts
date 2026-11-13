// Feature: proof-harness, Property 4: Sabotage completeness
// Property 4 drives the differential runner directly, as the sabotage check does.
import { SYNTHETIC_CASES, moduleFor, resolveMember, runShape } from "@graveyard-kit/skeleton/proof/testing";
import { BUILT_IN_MUTATORS, type CallShape, type Mutator } from "@graveyard-kit/skeleton/proof/runner";
import fc from "fast-check";
import { describe, it } from "vitest";
import { assertProperty } from "../evidence/test-support/fc-runner.js";
import { RECIPES } from "./recipes/index.js";

/** A recipe with its Oracle module. */
export interface P4Case {
  name: string;
  shapes: readonly CallShape[];
  oracle: unknown;
}

/** What Property 4 is about: the recipes (with their Oracles) and the Mutators. */
export interface P4Subject {
  cases: readonly P4Case[];
  mutators: readonly Mutator[];
}

function realCases(): P4Case[] {
  const cases: P4Case[] = [];
  for (const name of ["intersect", "deep-diff"]) {
    const recipe = RECIPES[name]!;
    cases.push({ name, shapes: recipe.shapes, oracle: recipe.loadOracle!()!.module });
  }
  for (const c of SYNTHETIC_CASES) cases.push({ name: c.name, shapes: c.recipe.shapes, oracle: moduleFor(c.shape, c.oracle) });
  return cases;
}

export const REAL_P4_SUBJECT: P4Subject = { cases: realCases(), mutators: BUILT_IN_MUTATORS };

/** Why a Mutator is not applicable to a shape (Requirement 8.3), or undefined when it is applicable. */
export function notApplicableReason(name: Mutator["name"], s: CallShape): string | undefined {
  const value = s.projection.observes === "value";
  switch (name) {
    case "reverse-array":
    case "drop-last":
      if (s.outputKind !== "array") return "outputKind is not array";
      return value ? undefined : "the projection does not observe the value";
    case "add-key":
      if (s.outputKind !== "object") return "outputKind is not object";
      return value ? undefined : "the projection does not observe the value";
    case "swap-first-two-args":
      if (s.argCount < 2) return "argCount is below 2";
      return s.orderSensitive ? undefined : "orderSensitive is false";
    case "return-undefined":
      return undefined;
    case "return-defined":
      return s.projection.observes === "definedness" ? undefined : "the projection does not observe definedness";
  }
}

export function build(subject: P4Subject = REAL_P4_SUBJECT) {
  const pairs = subject.cases.flatMap((c) => c.shapes.map((shape) => ({ c, shape })));
  return fc.property(fc.nat({ max: pairs.length - 1 }), fc.nat({ max: 1_000_000 }), (idx, seed) => {
    const { c, shape } = pairs[idx]!;
    const oracle = resolveMember(c.oracle, shape.member);
    if (!oracle) throw new Error(`${c.name}/${shape.id}: the oracle has no member "${shape.member}"`);
    for (const m of subject.mutators) {
      const reason = notApplicableReason(m.name, shape);
      const label = `${c.name}/${shape.id} with ${m.name} (seed ${seed})`;
      if (m.applicable(shape) !== (reason === undefined)) {
        throw new Error(`${label}: applicable() is ${String(m.applicable(shape))} but the table says ${reason ?? "applicable"}`);
      }
      if (reason !== undefined) continue;
      const mutant = { fn: m.wrap(oracle.fn), thisArg: oracle.thisArg };
      const run = runShape(shape, oracle, mutant, { numRuns: 100, seed });
      if (run.status === "error") throw new Error(`${label}: error ${run.error?.code}: ${run.error?.message}`);
      if (run.status !== "failed") throw new Error(`${label}: the mutant survived 100 runs`);
    }
  });
}

describe("Property 4: sabotage completeness", () => {
  it("every applicable Mutator applied to the Oracle is caught, and every other one has its stated reason", () => {
    assertProperty("Property 4: sabotage completeness", build(REAL_P4_SUBJECT));
  });
});
