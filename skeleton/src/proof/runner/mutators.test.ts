import { describe, expect, it } from "vitest";
import { BUILT_IN_MUTATORS, applicableMutators } from "./mutators.js";
import type { CallShape, Mutator, OutputKind, Projection } from "./types.js";
import { SYNTHETIC_CASES } from "../test-support/synthetic-recipes.js";

const VALUE: Projection = { name: "identity", observes: "value", apply: (v) => v };
const DEFINED: Projection = { name: "isUndefined", observes: "definedness", apply: (v) => v === undefined };
const base = SYNTHETIC_CASES[0]!.shape;

function shapeWith(p: Partial<CallShape>): CallShape {
  return { ...base, ...p };
}

const get = (name: Mutator["name"]): Mutator => BUILT_IN_MUTATORS.find((m) => m.name === name)!;
const names = (s: CallShape): string[] => applicableMutators(s).map((m) => m.name);

describe("BUILT_IN_MUTATORS", () => {
  it("lists the six mutators in order", () => {
    expect(BUILT_IN_MUTATORS.map((m) => m.name)).toEqual([
      "reverse-array",
      "drop-last",
      "return-undefined",
      "swap-first-two-args",
      "add-key",
      "return-defined",
    ]);
  });

  it("reverse-array and drop-last change arrays and leave other values alone", () => {
    expect(get("reverse-array").wrap(() => [1, 2, 3])()).toEqual([3, 2, 1]);
    expect(get("drop-last").wrap(() => [1, 2, 3])()).toEqual([1, 2]);
    expect(get("drop-last").wrap(() => [])()).toEqual([]);
    expect(get("reverse-array").wrap(() => 5)()).toBe(5);
    expect(get("drop-last").wrap(() => "x")()).toBe("x");
  });

  it("return-undefined returns undefined", () => {
    expect(get("return-undefined").wrap(() => 5)()).toBeUndefined();
  });

  it("swap-first-two-args swaps only the first two", () => {
    expect(get("swap-first-two-args").wrap((...a) => a)(1, 2, 3)).toEqual([2, 1, 3]);
    expect(get("swap-first-two-args").wrap((...a) => a)(1)).toEqual([1]);
  });

  it("add-key adds __sabotage__ to a copy of a plain object and ignores other values", () => {
    const original = { a: [1] };
    const out = get("add-key").wrap(() => original)() as Record<string, unknown>;
    expect(out).toEqual({ a: [1], __sabotage__: true });
    expect(out).not.toBe(original);
    expect(original).toEqual({ a: [1] });
    expect(get("add-key").wrap(() => [1])()).toEqual([1]);
    expect(get("add-key").wrap(() => 3)()).toBe(3);
  });

  it("return-defined returns a defined value", () => {
    expect(get("return-defined").wrap(() => undefined)()).toEqual({ __sabotage__: "defined" });
  });

  it("every wrapper calls the real function with this and the same arguments, and keeps a throw", () => {
    const holder = { seen: [] as unknown[] };
    for (const m of BUILT_IN_MUTATORS) {
      holder.seen.length = 0;
      const wrapped = m.wrap(function (this: unknown, ...a: unknown[]) {
        holder.seen.push(this, ...a);
        return [1, 2];
      });
      const call = (wrapped as (...a: unknown[]) => unknown).bind(holder);
      call(10, 20);
      expect(holder.seen[0]).toBe(holder);
      expect(holder.seen.length).toBe(3);
      const thrower = m.wrap(() => {
        throw new Error("x");
      });
      expect(() => thrower()).toThrow("x");
    }
  });

  it("does not modify deep-frozen arguments or results", () => {
    const deepFreeze = <T>(v: T): T => {
      if (typeof v === "object" && v !== null) for (const x of Object.values(v)) deepFreeze(x);
      return Object.freeze(v);
    };
    const arg = deepFreeze({ list: [1, 2, 3], o: { k: 1 } });
    const arr = deepFreeze([3, 1, 2]);
    const obj = deepFreeze({ a: [1], b: { c: 2 } });
    const results = [arr, obj, 5, undefined];
    for (const m of BUILT_IN_MUTATORS) {
      for (const r of results) {
        expect(() => m.wrap(() => r)(arg, arg)).not.toThrow(); // frozen writes would throw in strict mode
      }
    }
    expect(arr).toEqual([3, 1, 2]);
    expect(obj).toEqual({ a: [1], b: { c: 2 } });
  });
});

describe("applicableMutators", () => {
  const kinds: OutputKind[] = ["array", "object", "boolean", "opaque"];
  it("follows the applicability table for every combination", () => {
    for (const outputKind of kinds) {
      for (const projection of [VALUE, DEFINED]) {
        for (const argCount of [0, 1, 2, 3]) {
          for (const orderSensitive of [false, true]) {
            const s = shapeWith({ outputKind, projection, argCount, orderSensitive });
            const want: string[] = [];
            if (outputKind === "array" && projection.observes === "value") want.push("reverse-array", "drop-last");
            want.push("return-undefined");
            if (argCount >= 2 && orderSensitive) want.push("swap-first-two-args");
            if (outputKind === "object" && projection.observes === "value") want.push("add-key");
            if (projection.observes === "definedness") want.push("return-defined");
            expect(names(s)).toEqual(want);
          }
        }
      }
    }
  });

  it("filters an injected list and keeps its order", () => {
    const s = shapeWith({ outputKind: "array", projection: VALUE });
    const reversed = [...BUILT_IN_MUTATORS].reverse();
    expect(applicableMutators(s, reversed).map((m) => m.name)).toEqual(["return-undefined", "drop-last", "reverse-array"]);
    expect(applicableMutators(s, [])).toEqual([]);
  });
});
