// Feature: proof-harness, Property 1: Differential soundness
import { SYNTHETIC_CASES, moduleFor, usageFor } from "@last-rites/skeleton/proof/testing";
import type { CallSite, UsageSurfaceResult } from "@last-rites/skeleton/proof";
import { runProof, type CallShape, type ProofInput, type ProofResult, type Recipe } from "@last-rites/skeleton/proof/runner";
import fc from "fast-check";
import { describe, it } from "vitest";
import { assertProperty } from "../evidence/test-support/fc-runner.js";
import { RECIPES } from "./recipes/index.js";

/** The one function Property 1 is about; sabotage lists replace it. */
export interface DifferentialImpl {
  runProof(input: ProofInput): ProofResult;
}

export const REAL_DIFFERENTIAL_IMPL: DifferentialImpl = { runProof };

type Fn = (...a: unknown[]) => unknown;

interface P1Case {
  name: string;
  recipe: Recipe;
  oracle: unknown;
  oracleVersion?: string;
  /** An independently written, equivalent module (synthetic cases only). */
  independent?: unknown;
}

const smallInt = fc.integer({ min: -20, max: 20 });

// A member that reads `this`: it only works when called as a method of its module.
const thisReaderShape: CallShape = {
  id: "this-reader",
  member: "m",
  argCount: 1,
  outputKind: "opaque",
  orderSensitive: false,
  projection: { name: "identity", observes: "value", apply: (v) => v },
  accepts: (s) => s.member === "m" && s.argCount === 1 && s.new !== true,
  arbitrary: fc.tuple(smallInt).map((t): unknown[] => t),
  guard: (a) => a.length === 1 && Number.isInteger(a[0]),
  classify: (_a, o) => (o.kind === "returned" ? ["returns"] : ["throws"]),
  requiredLabels: ["returns"],
};

// A BigInt output: JSON.stringify throws on it.
const bigintShape: CallShape = {
  id: "bigint-double",
  member: "",
  argCount: 1,
  outputKind: "opaque",
  orderSensitive: false,
  projection: { name: "identity", observes: "value", apply: (v) => v },
  accepts: (s) => s.member === "" && s.argCount === 1 && s.new !== true,
  arbitrary: fc.tuple(smallInt).map((t): unknown[] => t),
  guard: (a) => a.length === 1 && Number.isInteger(a[0]),
  classify: () => ["big"],
  requiredLabels: ["big"],
};

function buildCases(): P1Case[] {
  const cases: P1Case[] = [];
  for (const name of ["intersect", "deep-diff"]) {
    const recipe = RECIPES[name]!;
    const loaded = recipe.loadOracle!()!;
    cases.push({ name, recipe, oracle: loaded.module, oracleVersion: loaded.version });
  }
  for (const c of SYNTHETIC_CASES) {
    cases.push({ name: c.name, recipe: c.recipe, oracle: moduleFor(c.shape, c.oracle), independent: moduleFor(c.shape, c.candidate) });
  }
  const reader = {
    k: 5,
    m(this: { k: number }, x: unknown): number {
      return (x as number) + this.k;
    },
  };
  cases.push({
    name: "this-reader",
    recipe: { package: "synthetic-this-reader", shapes: [thisReaderShape] },
    oracle: reader,
    independent: { m: (x: unknown) => (x as number) + 5 },
  });
  cases.push({
    name: "bigint-double",
    recipe: { package: "synthetic-bigint", shapes: [bigintShape] },
    oracle: (x: unknown) => BigInt(x as number) * 2n,
    independent: (x: unknown) => BigInt(x as number) + BigInt(x as number),
  });
  return cases;
}

export const P1_CASES: readonly P1Case[] = buildCases();

/** A candidate that calls through to `module` as a method call (`module[member](...a)`). */
export function callThrough(module: unknown, shapes: readonly CallShape[]): unknown {
  const target = module as Record<string, Fn> & Fn;
  const wrapper: Record<string, unknown> & Fn =
    typeof module === "function" ? (((...a: unknown[]) => target(...a)) as Record<string, unknown> & Fn) : ({} as never);
  for (const s of shapes) {
    if (s.member === "") continue;
    wrapper[s.member] = (...a: unknown[]) => target[s.member]!(...a);
  }
  return wrapper;
}

function sitesFor(shape: CallShape, n: number, index: number): CallSite[] {
  return usageFor(shape, n).map((c) => {
    const site: CallSite = { ...c, file: `src/s${index}/${c.file.slice(4)}` };
    // The shape decides which consumption it needs (deep-diff: an undefined check).
    return shape.accepts(site) ? site : { ...site, consumedAs: "undefined-check" };
  });
}

export function build(impl: DifferentialImpl = REAL_DIFFERENTIAL_IMPL) {
  return fc.property(
    fc.nat({ max: P1_CASES.length - 1 }),
    fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 4, maxLength: 4 }),
    fc.nat({ max: 2 }),
    fc.nat({ max: 1_000_000 }),
    (caseIdx, counts, form, seed) => {
      const c = P1_CASES[caseIdx]!;
      const shapes = c.recipe.shapes;
      const callSites = shapes.flatMap((s, i) => sitesFor(s, counts[i % counts.length]!, i));
      for (const s of callSites) {
        if (!shapes.some((x) => x.accepts(s))) throw new Error(`${c.name}: test bug, a generated site is not accepted`);
      }
      const usage: UsageSurfaceResult = {
        package: c.recipe.package,
        filesScanned: callSites.length,
        callSites,
        importSites: [],
        warnings: [],
      };
      const useIndependent = form === 2 && c.independent !== undefined;
      const candidate = form === 0 ? c.oracle : useIndependent ? c.independent : callThrough(c.oracle, shapes);
      const label = `${c.name} / candidate form ${useIndependent ? "independent" : form === 0 ? "oracle" : "call-through"} / seed ${seed}`;
      const r = impl.runProof({
        package: c.recipe.package,
        usage,
        recipe: c.recipe,
        oracle: c.oracle,
        ...(c.oracleVersion !== undefined ? { oracleVersion: c.oracleVersion } : {}),
        candidate,
        numRuns: 100,
        seed,
      });
      if (r.status !== "proved") {
        throw new Error(`${label}: status ${r.status} ${r.error ? `(${r.error.code}: ${r.error.message})` : ""} ${r.counterexample ? `input ${r.counterexample.input} old ${r.oldOutput} new ${r.newOutput}` : ""}`);
      }
      if (r.counterexample !== undefined) throw new Error(`${label}: proved with a counterexample`);
      if (r.error !== undefined) throw new Error(`${label}: proved with an error`);
      if (r.shapes.some((s) => s.status === "failed" || s.status === "error")) throw new Error(`${label}: a shape did not pass`);
    },
  );
}

describe("Property 1: differential soundness", () => {
  it("an Oracle, a call-through wrapper of it and an equivalent candidate are proved", () => {
    assertProperty("Property 1: differential soundness", build(REAL_DIFFERENTIAL_IMPL));
  });
});
