// Feature: proof-harness, Property 7: Sabotage accounting and the weak flag
import fc from "fast-check";
import { describe, it } from "vitest";
import { assertProperty } from "../../death-score/fc-runner.js";
import { usageFor } from "../test-support/synthetic-recipes.js";
import type { UsageSurfaceResult } from "../types.js";
import { BUILT_IN_MUTATORS } from "./mutators.js";
import { runProof } from "./run-proof.js";
import type { CallShape, Mutator, OutputKind, ProofInput, ProofResult, Projection, Recipe } from "./types.js";

/** The one function Property 7 is about; sabotage lists replace it. */
export interface SabotageImpl {
  runProof(input: ProofInput): ProofResult;
}

export const REAL_SABOTAGE_IMPL: SabotageImpl = { runProof };

type Fn = (...a: unknown[]) => unknown;
type Mode = "proved" | "counterexample" | "no-call-sites" | "candidate-missing";
type Name = Mutator["name"];

const IDENTITY: Projection = { name: "identity", observes: "value", apply: (v) => v };
const IS_UNDEFINED: Projection = { name: "isUndefined", observes: "definedness", apply: (v) => v === undefined };

interface ShapeSpec {
  outputKind: OutputKind;
  argCount: number;
  orderSensitive: boolean;
  /** The oracle function really is symmetric in its arguments (so swapping them is an equivalent mutant). */
  symmetric: boolean;
  /** Length of an array output. */
  maxLen: number;
  /** An opaque shape whose output is always undefined. */
  undefinedOutput: boolean;
  /** An opaque shape observed through `isUndefined`. */
  definedness: boolean;
  sites: number;
}

interface Scenario {
  specs: ShapeSpec[];
  mode: Mode;
  mutatorNames: Name[];
  seed: number;
}

const ALL_NAMES = BUILT_IN_MUTATORS.map((m) => m.name);

const specArb: fc.Arbitrary<ShapeSpec> = fc
  .record({
    outputKind: fc.constantFrom<OutputKind>("array", "array", "object", "boolean", "opaque", "opaque"),
    argCount: fc.integer({ min: 1, max: 3 }),
    orderSensitive: fc.boolean(),
    symmetric: fc.boolean(),
    maxLen: fc.constantFrom(0, 1, 2, 5),
    undefinedOutput: fc.boolean(),
    definedness: fc.boolean(),
    sites: fc.integer({ min: 0, max: 2 }),
  })
  .map((s) => ({
    ...s,
    undefinedOutput: s.outputKind === "opaque" && s.undefinedOutput,
    definedness: s.outputKind === "opaque" && s.definedness,
  }));

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    specs: fc.array(specArb, { minLength: 1, maxLength: 3 }),
    mode: fc.constantFrom<Mode>("proved", "proved", "proved", "proved", "counterexample", "no-call-sites", "candidate-missing"),
    // The built-ins, a subset (in any order) or none.
    mutatorNames: fc.oneof(
      fc.constant<Name[]>([...ALL_NAMES]),
      fc.constant<Name[]>([...ALL_NAMES]),
      fc.shuffledSubarray([...ALL_NAMES]),
      fc.constant<Name[]>([]),
    ),
    seed: fc.nat({ max: 1_000_000 }),
  })
  .map((s) => {
    // At least one shape must receive a call site, unless the mode says there is none.
    const specs = s.specs.map((x) => ({ ...x }));
    if (s.mode !== "no-call-sites" && specs.every((x) => x.sites === 0)) specs[0]!.sites = 1;
    return { ...s, specs };
  });

/** The independent reference for the applicability table of Requirement 8.3. */
function applicableByTable(name: Name, spec: ShapeSpec): boolean {
  const observesValue = !spec.definedness;
  switch (name) {
    case "reverse-array":
    case "drop-last":
      return spec.outputKind === "array" && observesValue;
    case "add-key":
      return spec.outputKind === "object" && observesValue;
    case "swap-first-two-args":
      return spec.argCount >= 2 && spec.orderSensitive;
    case "return-undefined":
      return true;
    case "return-defined":
      return !observesValue;
  }
}

const inRange = (v: unknown): boolean => typeof v === "number" && Number.isInteger(v) && v >= -20 && v <= 20;

function oracleFn(spec: ShapeSpec): Fn {
  const nums = (a: unknown[]): number[] => a as number[];
  switch (spec.outputKind) {
    case "array":
      return (...a) => {
        const src = spec.symmetric ? [...nums(a)].sort((x, y) => x - y) : nums(a);
        return Array.from({ length: spec.maxLen }, (_, i) => src[i % src.length]! + i);
      };
    case "object":
      return (...a) =>
        spec.symmetric
          ? { sum: nums(a).reduce((s, v) => s + v, 0) }
          : Object.fromEntries(nums(a).map((v, i) => [`k${i}`, v]));
    case "boolean":
      return (...a) => (spec.symmetric ? Math.min(...nums(a)) > 0 : nums(a)[0]! > 0);
    case "opaque":
      return (...a) => {
        if (spec.undefinedOutput) return undefined;
        return spec.symmetric ? nums(a).reduce((s, v) => s + v, 0) : nums(a).reduce((s, v, i) => s + v * (i + 1), 0);
      };
  }
}

function shapeOf(spec: ShapeSpec, i: number): CallShape {
  return {
    id: `s${i}`,
    member: `m${i}`,
    argCount: spec.argCount,
    outputKind: spec.outputKind,
    orderSensitive: spec.orderSensitive,
    projection: spec.definedness ? IS_UNDEFINED : IDENTITY,
    accepts: (site) => site.member === `m${i}` && site.argCount === spec.argCount && site.new !== true,
    arbitrary: fc
      .array(fc.integer({ min: -20, max: 20 }), { minLength: spec.argCount, maxLength: spec.argCount })
      .map((t): unknown[] => t),
    guard: (args) => args.length === spec.argCount && args.every(inRange),
    classify: () => ["x"],
    requiredLabels: ["x"],
  };
}

/** Every layer a Mutator could reach is frozen, except fast-check's own arbitraries. */
function freezeShallow<T extends object>(v: T): T {
  return Object.freeze(v);
}

export function build(impl: SabotageImpl = REAL_SABOTAGE_IMPL) {
  return fc.property(scenarioArb, (s) => {
    const shapes = s.specs.map(shapeOf);
    const ctx = fc.stringify(s);

    // Any argument a Mutator wrote into reaches the functions below out of range.
    const violations: string[] = [];
    const watch = (f: Fn, side: string): Fn =>
      function (this: unknown, ...a: unknown[]) {
        if (!a.every(inRange)) violations.push(`${side} received ${fc.stringify(a)}`);
        return f.apply(this, a);
      };

    const oracleHolder: Record<string, unknown> = {};
    const candidateHolder: Record<string, unknown> = {};
    s.specs.forEach((spec, i) => {
      const f = oracleFn(spec);
      oracleHolder[`m${i}`] = watch(f, "oracle");
      candidateHolder[`m${i}`] =
        s.mode === "counterexample"
          ? watch(() => {
              throw new Error("wrong");
            }, "candidate")
          : s.mode === "candidate-missing"
            ? undefined
            : watch(f, "candidate");
    });

    const callSites = shapes.flatMap((shape, i) =>
      s.mode === "no-call-sites"
        ? []
        : usageFor(shape, s.specs[i]!.sites).map((c) => ({ ...c, file: `src/s${i}/${c.file.slice(4)}` })),
    );
    const usage: UsageSurfaceResult = {
      package: "synthetic-p7",
      filesScanned: 3,
      callSites,
      importSites: [],
      warnings: [],
    };
    const recipe: Recipe = { package: "synthetic-p7", shapes: freezeShallow(shapes.map((x) => freezeShallow(x))) };
    const mutators: Mutator[] = s.mutatorNames.map((n) => BUILT_IN_MUTATORS.find((m) => m.name === n)!);
    const frozenMutators = freezeShallow(mutators.map((m) => freezeShallow({ ...m })));
    const oracle = freezeShallow(oracleHolder);
    const candidate = freezeShallow(candidateHolder);
    const input: ProofInput = freezeShallow({
      package: "synthetic-p7",
      usage: freezeShallow({
        ...usage,
        callSites: freezeShallow(callSites.map((c) => freezeShallow({ ...c, argTexts: freezeShallow([...c.argTexts]) }))),
        importSites: freezeShallow([]),
        warnings: freezeShallow([]),
      }),
      recipe,
      oracle,
      candidate,
      numRuns: 100,
      seed: s.seed,
      mutators: frozenMutators,
    });
    const keysBefore = [Object.keys(oracle).join(), Object.keys(candidate).join()];

    const r = impl.runProof(input);

    const fail = (msg: string): never => {
      throw new Error(`${msg}\n  scenario: ${ctx}\n  sabotage: ${fc.stringify(r.sabotage)} weak=${r.weak} status=${r.status}`);
    };
    if (violations.length > 0) fail(`a Mutator or the harness modified an argument: ${violations[0]}`);
    if ([Object.keys(oracle).join(), Object.keys(candidate).join()].join() !== keysBefore.join()) {
      fail("a module changed");
    }

    // The scenario really produced the status it was built for.
    const expectedStatus = {
      proved: "proved",
      counterexample: "counterexample",
      "no-call-sites": "no-call-sites",
      "candidate-missing": "error",
    }[s.mode];
    if (r.status !== expectedStatus) fail(`status ${r.status}, expected ${expectedStatus}`);

    const { applied, caught, survivors } = r.sabotage;
    if (s.mode !== "proved") {
      if (applied !== 0 || caught !== 0 || survivors.length !== 0) fail("a non-proved status carries sabotage");
      if (r.weak) fail("a non-proved status is weak");
      return;
    }

    // Applicable pairs among the shapes that ran, in shape order then mutator order.
    const pairs: { name: string; shapeIdx: number; mutator: Name }[] = [];
    s.specs.forEach((spec, i) => {
      if (spec.sites === 0) return;
      for (const n of s.mutatorNames) if (applicableByTable(n, spec)) pairs.push({ name: `s${i}:${n}`, shapeIdx: i, mutator: n });
    });
    if (applied !== pairs.length) fail(`applied ${applied}, expected ${pairs.length}`);
    if (applied !== caught + survivors.length) fail("applied is not caught plus survivors");
    if (new Set(survivors).size !== survivors.length) fail("survivors are not unique");
    const index = new Map(pairs.map((p, i) => [p.name, i]));
    let last = -1;
    for (const name of survivors) {
      if (!/^s\d+:[a-z-]+$/.test(name)) fail(`malformed survivor ${name}`);
      const at = index.get(name);
      if (at === undefined) fail(`survivor ${name} is not an applicable pair`);
      else if (at <= last) fail(`survivors are out of order at ${name}`);
      else last = at;
    }
    if (r.weak !== (applied === 0 || survivors.length > 0)) fail("the weak flag does not follow the rule");

    // Mutants whose fate follows from the shape alone.
    for (const p of pairs) {
      const spec = s.specs[p.shapeIdx]!;
      const survived = survivors.includes(p.name);
      const must = (cond: boolean, expectSurvive: boolean, why: string): void => {
        if (cond && survived !== expectSurvive) fail(`${p.name} ${survived ? "survived" : "was caught"}: ${why}`);
      };
      must(p.mutator === "add-key", false, "an added key always shows");
      must(p.mutator === "return-undefined", spec.undefinedOutput, "equivalent only for an undefined output");
      must(p.mutator === "return-undefined" && !spec.undefinedOutput, false, "a defined output becomes undefined");
      must(p.mutator === "return-defined", !spec.undefinedOutput, "equivalent only for a defined output");
      must(p.mutator === "return-defined" && spec.undefinedOutput, false, "an undefined output becomes defined");
      must(p.mutator === "swap-first-two-args" && spec.symmetric, true, "a symmetric function ignores the order");
      must(p.mutator === "reverse-array" && spec.maxLen === 0, true, "an empty array reversed is equal");
      must(p.mutator === "drop-last" && spec.maxLen === 0, true, "dropping from an empty array changes nothing");
      must(p.mutator === "drop-last" && spec.maxLen >= 1, false, "dropping the last element always shows");
    }
  });
}

describe("Property 7: Sabotage accounting and the weak flag", () => {
  it("holds for runProof", () => {
    assertProperty("sabotage accounting", build(REAL_SABOTAGE_IMPL));
  });
});
