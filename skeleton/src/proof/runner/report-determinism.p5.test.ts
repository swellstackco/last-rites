// Feature: proof-harness, Property 5: Determinism
import fc from "fast-check";
import { describe, it } from "vitest";
import { FIXED_SEED, assertProperty } from "../../death-score/fc-runner.js";
import { FAULT_FAMILY, SYNTHETIC_CASES, moduleFor, usageResultFor } from "../test-support/synthetic-recipes.js";
import { appendAttempt, serializeProofReport } from "../report.js";
import type { ProofAttempt, ProofReport } from "../types.js";
import { runProof } from "./run-proof.js";
import type { ProofInput, ProofResult } from "./types.js";

/** A proof input as the caller gives it: the seed may be absent (the default is then FIXED_SEED). */
export type RenderInput = Omit<ProofInput, "seed"> & { seed?: number };

/** What Property 5 is about: from a proof input to the bytes of a report file. */
export type ReportImpl = (input: RenderInput) => string;

export function attemptOf(r: ProofResult, candidateName: string): Omit<ProofAttempt, "attempt"> {
  return {
    candidate: { name: candidateName, source: "module.exports = () => 0;\n" },
    status: r.status,
    weak: r.weak,
    numRuns: r.numRuns,
    runs: r.runs,
    seed: r.seed,
    shapes: r.shapes,
    ...(r.counterexample && r.oldOutput !== undefined
      ? {
          counterexample: {
            shape: r.counterexample.shape,
            input: r.counterexample.input,
            shrinks: r.counterexample.shrinks,
            path: r.counterexample.path,
            oldOutput: r.oldOutput,
            newOutput: r.newOutput ?? "",
            oldProjected: r.oldProjected ?? "",
            newProjected: r.newProjected ?? "",
          },
        }
      : {}),
    ...(r.recommendation ? { recommendation: r.recommendation } : {}),
    ...(r.error ? { error: r.error } : {}),
    sabotage: r.sabotage,
  };
}

export function headerOf(input: RenderInput): ProofReport {
  return {
    repo: "synthetic/repo",
    package: input.package,
    filesScanned: input.usage.filesScanned,
    callSites: input.usage.callSites,
    importSites: input.usage.importSites,
    attempts: [],
  };
}

export const REAL_REPORT_IMPL: ReportImpl = (input) => {
  const result = runProof({ ...input, seed: input.seed ?? FIXED_SEED });
  return serializeProofReport(appendAttempt(headerOf(input), attemptOf(result, "candidate.js")));
};

const inputArb: fc.Arbitrary<RenderInput> = fc
  .record({
    caseIdx: fc.nat({ max: SYNTHETIC_CASES.length - 1 }),
    faultIdx: fc.nat({ max: FAULT_FAMILY.length }), // the last one is "no fault"
    seed: fc.option(fc.nat({ max: 100000 }), { nil: undefined }),
    sites: fc.integer({ min: 0, max: 3 }),
    filesScanned: fc.constantFrom(0, 2, 2, 2),
    withImport: fc.boolean(),
    brokenOracle: fc.boolean(),
  })
  .map((s): RenderInput => {
    const c = SYNTHETIC_CASES[s.caseIdx]!;
    const fault = FAULT_FAMILY[s.faultIdx];
    const usage = usageResultFor(c.shape, s.sites);
    return {
      package: c.recipe.package,
      usage: { ...usage, filesScanned: s.filesScanned, importSites: s.withImport ? usage.importSites : [] },
      recipe: c.recipe,
      oracle: s.brokenOracle ? {} : moduleFor(c.shape, c.oracle),
      candidate: moduleFor(c.shape, fault ? fault.wrap(c.oracle, c) : c.candidate),
      numRuns: 100,
      seed: s.seed,
    } as RenderInput;
  });

type Clock = { now: () => number };

export function build(impl: ReportImpl = REAL_REPORT_IMPL) {
  return fc.property(inputArb, fc.nat({ max: 50 }), (input, burn) => {
    const clock = Date as unknown as Clock;
    const realNow = clock.now;
    const texts: string[] = [];
    const times: number[] = [];
    try {
      for (let i = 0; i < 3; i++) {
        // Between runs: consume randomness, move the clock, create unrelated arbitraries.
        for (let k = 0; k < burn + i; k++) Math.random();
        const t = 1_700_000_000_000 + (burn + 1) * 7919 * (i + 1);
        times.push(t);
        clock.now = () => t;
        fc.sample(fc.string(), { numRuns: 3, seed: burn + i });
        texts.push(impl(input));
      }
    } finally {
      clock.now = realNow;
    }
    if (texts[0] !== texts[1] || texts[1] !== texts[2]) {
      throw new Error(`report text differs between runs:\n--- 1\n${texts[0]}\n--- 2\n${texts[1]}`);
    }
    const text = texts[0]!;
    if (/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text)) throw new Error("report text holds an ISO timestamp");
    for (const t of times) if (text.includes(String(t))) throw new Error(`report text holds the clock value ${t}`);
    const proc = (globalThis as { process?: { cwd?: () => string } }).process;
    const cwd = proc?.cwd?.();
    if (cwd && cwd.length > 1 && text.includes(cwd)) throw new Error("report text holds the process directory");
  });
}

describe("Property 5: Determinism", () => {
  it("holds for runProof plus serializeProofReport", () => {
    assertProperty("determinism", build(REAL_REPORT_IMPL));
  });
});
