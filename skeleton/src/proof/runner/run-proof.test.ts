import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SYNTHETIC_CASES, moduleFor, usageResultFor, type SyntheticCase } from "../test-support/synthetic-recipes.js";
import type { CallSite } from "../types.js";
import { runProof } from "./run-proof.js";
import type { CallShape, ProofInput } from "./types.js";

function byName(name: string): SyntheticCase {
  const c = SYNTHETIC_CASES.find((x) => x.name === name);
  if (!c) throw new Error(`no case ${name}`);
  return c;
}

function inputFor(c: SyntheticCase, over: Partial<ProofInput> = {}): ProofInput {
  return {
    package: c.recipe.package,
    usage: usageResultFor(c.shape, 2),
    recipe: c.recipe,
    oracle: moduleFor(c.shape, c.oracle),
    oracleVersion: undefined,
    candidate: moduleFor(c.shape, c.candidate),
    numRuns: 100,
    seed: 11,
    ...over,
  };
}

const site = (over: Partial<CallSite>): CallSite => ({
  file: "src/x.js", line: 1, column: 1, callee: "pkg", member: "", argCount: 1, argTexts: ["a"], enclosing: "src", ...over,
});

describe("runProof statuses and error codes", () => {
  it("proves an equivalent candidate and runs the sabotage check", () => {
    const r = runProof(inputFor(byName("sort-unique")));
    expect(r.status).toBe("proved");
    expect(r.runs).toBe(100);
    expect(r.sabotage.applied).toBe(r.sabotage.caught + r.sabotage.survivors.length);
    expect(r.sabotage.applied).toBeGreaterThan(0);
    expect(r.shapes.map((s) => s.status)).toEqual(["passed"]);
  });

  it("returns a counterexample for a wrong candidate, with no sabotage", () => {
    const c = byName("sort-unique");
    const r = runProof(inputFor(c, { candidate: moduleFor(c.shape, (a) => (c.oracle(a) as number[]).reverse()) }));
    expect(r.status).toBe("counterexample");
    expect(r.counterexample?.shape).toBe("sort-unique");
    expect(r.sabotage).toEqual({ applied: 0, caught: 0, survivors: [] });
    expect(r.weak).toBe(false);
  });

  it("invalid_runs at 99 (and for non-integers), before every other gate", () => {
    const c = byName("subtract");
    const bad = { numRuns: 99, recipe: undefined, usage: { ...usageResultFor(c.shape, 0), filesScanned: 0 } };
    expect(runProof(inputFor(c, bad)).error?.code).toBe("invalid_runs");
    expect(runProof(inputFor(c, { numRuns: 150.5 })).error?.code).toBe("invalid_runs");
    expect(runProof(inputFor(c, { numRuns: 100 })).status).toBe("proved");
  });

  it("no_source_files before no-call-sites", () => {
    const c = byName("subtract");
    const r = runProof(inputFor(c, { usage: { ...usageResultFor(c.shape, 0), filesScanned: 0 } }));
    expect(r.error?.code).toBe("no_source_files");
    expect(r.shapes).toEqual([]);
  });

  it("no-call-sites recommends removal with zero import sites, review otherwise", () => {
    const c = byName("subtract");
    const u = usageResultFor(c.shape, 0);
    const none = runProof(inputFor(c, { usage: { ...u, importSites: [] }, recipe: undefined }));
    expect(none.status).toBe("no-call-sites");
    expect(none.recommendation).toBe("remove-dependency");
    expect(none.runs).toBe(0);
    const some = runProof(inputFor(c, { usage: u }));
    expect(some.status).toBe("no-call-sites");
    expect(some.recommendation).toBe("review-imports");
  });

  it("no_recipe, then oracle_version_mismatch", () => {
    const c = byName("subtract");
    expect(runProof(inputFor(c, { recipe: undefined })).error?.code).toBe("no_recipe");
    const versioned = { ...c.recipe, expectedVersion: "1.0.1" };
    expect(runProof(inputFor(c, { recipe: versioned, oracleVersion: "1.0.2" })).error?.code).toBe("oracle_version_mismatch");
    expect(runProof(inputFor(c, { recipe: versioned })).error?.code).toBe("oracle_version_mismatch");
    expect(runProof(inputFor(c, { recipe: versioned, oracleVersion: "1.0.1" })).status).toBe("proved");
  });

  it("unsupported_call_shapes names at most five sites, and beats missing members", () => {
    const c = byName("subtract");
    const stray = Array.from({ length: 7 }, (_, i) => site({ file: `f${i}.js`, line: i + 1, member: "nope" }));
    const r = runProof(inputFor(c, { usage: { ...usageResultFor(c.shape, 1), callSites: stray }, oracle: {}, candidate: undefined }));
    expect(r.error?.code).toBe("unsupported_call_shapes");
    expect(r.error?.message).toContain("f0.js:1");
    expect(r.error?.message).toContain("f4.js:5");
    expect(r.error?.message).not.toContain("f5.js");
    expect(r.shapes).toEqual([]);
  });

  it("oracle_missing_member before candidate_missing_member; no candidate at all", () => {
    const c = byName("subtract");
    expect(runProof(inputFor(c, { oracle: {}, candidate: {} })).error?.code).toBe("oracle_missing_member");
    expect(runProof(inputFor(c, { candidate: {} })).error?.code).toBe("candidate_missing_member");
    expect(runProof(inputFor(c, { candidate: undefined })).error?.code).toBe("candidate_missing_member");
  });

  it("lists shapes without accepted sites as skipped and never runs them", () => {
    const a = byName("subtract");
    const b = byName("sort-unique");
    let ranB = 0;
    const spy = (x: unknown) => {
      ranB++;
      return b.oracle(x);
    };
    const recipe = { package: "multi", shapes: [b.shape, a.shape] };
    const oracle = { unique: spy, subtract: a.oracle };
    const candidate = { unique: b.candidate, subtract: a.candidate };
    const r = runProof(inputFor(a, { recipe, oracle, candidate }));
    expect(r.status).toBe("proved");
    expect(r.shapes).toEqual([
      { id: "sort-unique", status: "skipped", runs: 0, coverage: {} },
      expect.objectContaining({ id: "subtract", status: "passed" }),
    ]);
    expect(ranB).toBe(0);
  });

  it("arbitrary_mismatch, async_not_supported and recipe_failure are reported in shape order", () => {
    const c = byName("subtract");
    const badGuard: CallShape = { ...c.shape, guard: () => false };
    const bad = runProof(inputFor(c, { recipe: { ...c.recipe, shapes: [badGuard] } }));
    expect(bad.error?.code).toBe("arbitrary_mismatch");
    expect(bad.status).toBe("error");
    expect(runProof(inputFor(c, { candidate: moduleFor(c.shape, async () => 1) })).error?.code).toBe("async_not_supported");
    const throwing: CallShape = { ...c.shape, classify: () => { throw new Error("x"); } };
    expect(runProof(inputFor(c, { recipe: { ...c.recipe, shapes: [throwing] } })).error?.code).toBe("recipe_failure");
  });

  it("errors beat counterexamples, and counterexamples beat insufficient_coverage", () => {
    const c = byName("subtract");
    const wrong = moduleFor(c.shape, () => 0);
    const noLabel: CallShape = { ...c.shape, requiredLabels: ["never"] };
    const r = runProof(inputFor(c, { candidate: wrong, recipe: { ...c.recipe, shapes: [noLabel] } }));
    expect(r.status).toBe("counterexample");
    const cov = runProof(inputFor(c, { recipe: { ...c.recipe, shapes: [noLabel] } }));
    expect(cov.error?.code).toBe("insufficient_coverage");
    expect(cov.error?.message).toContain("never");
    expect(cov.sabotage.applied).toBe(0);
  });

  it("an empty mutator list proves weakly with applied 0", () => {
    const r = runProof(inputFor(byName("subtract"), { mutators: [] }));
    expect(r.status).toBe("proved");
    expect(r.sabotage).toEqual({ applied: 0, caught: 0, survivors: [] });
    expect(r.weak).toBe(true);
  });

  it("an equivalent mutant survives and makes the proof weak", () => {
    const c = byName("subtract");
    const swapOnly = [{ name: "return-undefined" as const, applicable: () => true, wrap: (f: (...a: unknown[]) => unknown) => f }];
    const r = runProof(inputFor(c, { mutators: swapOnly }));
    expect(r.sabotage.survivors).toEqual(["subtract:return-undefined"]);
    expect(r.weak).toBe(true);
  });

  it("never throws on hostile input", () => {
    const c = byName("subtract");
    const hostile: unknown[] = [
      { ...inputFor(c), usage: undefined },
      inputFor(c, { recipe: { package: "x", shapes: [{ ...c.shape, accepts: () => { throw new Error("a"); } }] } }),
      inputFor(c, { mutators: [{ name: "add-key", applicable: () => { throw new Error("m"); }, wrap: (f) => f }] }),
      inputFor(c, { recipe: { package: "x", shapes: undefined as unknown as CallShape[] } }),
    ];
    for (const h of hostile) {
      const r = runProof(h as ProofInput);
      expect(r.status).toBe("error");
      expect(r.error?.code).toBe("recipe_failure");
      expect(r.error?.message).not.toMatch(/\bat\b.*:\d+/);
    }
  });

  it("is deterministic for a fixed input", () => {
    fc.assert(
      fc.property(fc.nat({ max: 1000 }), (seed) => {
        const c = byName("make-record");
        const a = JSON.stringify(runProof(inputFor(c, { seed })));
        return a === JSON.stringify(runProof(inputFor(c, { seed })));
      }),
      { numRuns: 5 },
    );
  });
});
