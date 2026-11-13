import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FAULT_FAMILY, SYNTHETIC_CASES, moduleFor, type SyntheticCase } from "../test-support/synthetic-recipes.js";
import { runShape, type ResolvedMember } from "./differential.js";
import { resolveMember } from "./outcome.js";
import type { CallShape } from "./types.js";

const CFG = { numRuns: 100, seed: 4242 };

function byName(name: string): SyntheticCase {
  const c = SYNTHETIC_CASES.find((x) => x.name === name);
  if (!c) throw new Error(`no case ${name}`);
  return c;
}

function resolve(shape: CallShape, fn: (...a: unknown[]) => unknown): ResolvedMember {
  const r = resolveMember(moduleFor(shape, fn), shape.member);
  if (!r) throw new Error("member not found");
  return r;
}

describe("runShape", () => {
  it("passes for an equivalent candidate and counts runs and labels", () => {
    const c = byName("sort-unique");
    const run = runShape(c.shape, resolve(c.shape, c.oracle), resolve(c.shape, c.candidate), CFG);
    expect(run.status).toBe("passed");
    expect(run.runs).toBe(100);
    expect(Object.keys(run.coverage)).toEqual(expect.arrayContaining(["empty", "has-duplicates"]));
    expect(Object.values(run.coverage).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("reports a shrunk counterexample with rendered outputs that a re-run reproduces", () => {
    const c = byName("sort-unique");
    const reverse = FAULT_FAMILY.find((f) => f.name === "reverse")!.wrap(c.oracle, c);
    const run = runShape(c.shape, resolve(c.shape, c.oracle), resolve(c.shape, reverse), CFG);
    expect(run.status).toBe("failed");
    expect(run.runs).toBeLessThanOrEqual(100);
    const ce = run.counterexample!;
    expect(ce.input).toBe(fc.stringify(ce.args));
    expect(ce.path).not.toBe("");
    expect(ce.shrinks).toBeGreaterThan(0);
    // Shrunk to the smallest array that reversing changes: two distinct integers.
    const arr = ce.args[0] as number[];
    expect(arr).toHaveLength(2);
    expect(ce.oldOutput).toBe(fc.stringify(c.oracle(...ce.args)));
    expect(ce.newOutput).toBe(fc.stringify(reverse(...ce.args)));
    expect(ce.oldProjected).toBe(ce.oldOutput);
    expect(ce.newProjected).toBe(ce.newOutput);
  });

  it("treats two throws as equal whatever the messages", () => {
    const c = byName("guarded-sqrt");
    const run = runShape(c.shape, resolve(c.shape, c.oracle), resolve(c.shape, c.candidate), CFG);
    expect(run.status).toBe("passed");
    expect(run.coverage["throws"]).toBeGreaterThan(0);
  });

  it("treats exactly one throw as different", () => {
    const c = byName("guarded-sqrt");
    const lenient = (n: unknown) => Math.sqrt(Math.abs(n as number));
    const run = runShape(c.shape, resolve(c.shape, c.oracle), resolve(c.shape, lenient), CFG);
    expect(run.status).toBe("failed");
    expect(run.counterexample!.args).toEqual([-1]);
    expect(run.counterexample!.oldOutput).toBe("<threw>");
    expect(run.counterexample!.newOutput).toBe("1");
  });

  it("reports async_not_supported for a thenable result", () => {
    const c = byName("subtract");
    const run = runShape(c.shape, resolve(c.shape, c.oracle), resolve(c.shape, async () => 1), CFG);
    expect(run.status).toBe("error");
    expect(run.error?.code).toBe("async_not_supported");
  });

  it("does not leak an unhandled rejection for a rejected thenable", async () => {
    const c = byName("subtract");
    const run = runShape(c.shape, resolve(c.shape, c.oracle), resolve(c.shape, () => Promise.reject(new Error("x"))), CFG);
    expect(run.error?.code).toBe("async_not_supported");
    await new Promise((r) => setTimeout(r, 5));
  });

  it("reports recipe_failure when classify throws, without a stack trace", () => {
    const c = byName("subtract");
    const shape: CallShape = { ...c.shape, classify: () => { throw new Error("boom at /secret/path"); } };
    const run = runShape(shape, resolve(shape, c.oracle), resolve(shape, c.candidate), CFG);
    expect(run.status).toBe("error");
    expect(run.error?.code).toBe("recipe_failure");
    expect(run.error?.message).not.toContain("/secret/path");
  });

  it("reports recipe_failure when the projection throws", () => {
    const c = byName("subtract");
    const shape: CallShape = { ...c.shape, projection: { name: "identity", observes: "value", apply: () => { throw new Error("p"); } } };
    expect(runShape(shape, resolve(shape, c.oracle), resolve(shape, c.candidate), CFG).error?.code).toBe("recipe_failure");
  });

  it("reports arbitrary_mismatch when guard fails", () => {
    const c = byName("subtract");
    const shape: CallShape = { ...c.shape, guard: () => false };
    const run = runShape(shape, resolve(shape, c.oracle), resolve(shape, c.candidate), CFG);
    expect(run.error?.code).toBe("arbitrary_mismatch");
  });

  it("reports recipe_failure when guard throws", () => {
    const c = byName("subtract");
    const shape: CallShape = { ...c.shape, guard: () => { throw new Error("g"); } };
    expect(runShape(shape, resolve(shape, c.oracle), resolve(shape, c.candidate), CFG).error?.code).toBe("recipe_failure");
  });

  it("reports recipe_failure when the arbitrary itself throws", () => {
    const c = byName("subtract");
    const shape: CallShape = { ...c.shape, arbitrary: fc.constant(0).map((): unknown[] => { throw new Error("gen"); }) };
    expect(runShape(shape, resolve(shape, c.oracle), resolve(shape, c.candidate), CFG).error?.code).toBe("recipe_failure");
  });

  it("calls a member with this set to the object holding it", () => {
    const c = byName("sort-unique");
    expect(c.shape.member).toBe("unique");
    const holder = { unique: function (this: unknown, a: unknown) { return this === holder ? c.oracle(a) : "wrong this"; } };
    const m = resolveMember(holder, "unique")!;
    expect(m.thisArg).toBe(holder);
    const run = runShape(c.shape, m, resolve(c.shape, c.candidate), CFG);
    expect(run.status).toBe("passed");
  });

  it("gives each side its own clone, so a mutating candidate cannot change the oracle's input", () => {
    const c = byName("sort-unique");
    const seenByOracle: string[] = [];
    const oracle = (a: unknown) => {
      seenByOracle.push(JSON.stringify(a));
      return c.oracle(a);
    };
    const mutating = (a: unknown) => {
      const r = c.candidate(a);
      (a as number[]).length = 0;
      (a as number[]).push(999);
      return r;
    };
    const run = runShape(c.shape, resolve(c.shape, oracle), resolve(c.shape, mutating), CFG);
    expect(run.status).toBe("passed");
    expect(seenByOracle.some((s) => s.includes("999"))).toBe(false);
  });

  it("generates the same inputs for the same seed and different inputs for another", () => {
    const c = byName("sort-unique");
    const inputs = (seed: number): string[] => {
      const seen: string[] = [];
      const spy = (a: unknown) => {
        seen.push(JSON.stringify(a));
        return c.oracle(a);
      };
      runShape(c.shape, resolve(c.shape, spy), resolve(c.shape, c.candidate), { numRuns: 100, seed });
      return seen;
    };
    expect(inputs(7)).toEqual(inputs(7));
    expect(inputs(7)).not.toEqual(inputs(8));
  });

  it("counts every executed run, and fewer when it fails early", () => {
    const c = byName("subtract");
    const passed = runShape(c.shape, resolve(c.shape, c.oracle), resolve(c.shape, c.candidate), { numRuns: 150, seed: 1 });
    expect(passed.runs).toBe(150);
    const failed = runShape(c.shape, resolve(c.shape, c.oracle), resolve(c.shape, () => 0), { numRuns: 150, seed: 1 });
    expect(failed.status).toBe("failed");
    expect(failed.runs).toBeLessThan(150);
  });
});
