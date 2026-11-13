import { describe, expect, it } from "vitest";
import { loadOracle } from "./oracles.js";

type Fn = ((...a: unknown[]) => unknown) & { big?: unknown };

describe("loadOracle", () => {
  it("pins the exact versions", () => {
    expect(loadOracle("intersect")?.version).toBe("1.0.1");
    expect(loadOracle("deep-diff")?.version).toBe("1.0.2");
  });

  it("intersect behaves as pinned", () => {
    const fn = loadOracle("intersect")!.module as Fn;
    expect(fn([["a", "b"], ["b"]])).toEqual(["b"]);
    expect(typeof fn.big).toBe("function");
  });

  it("deep-diff reports undefined for equal and an array for different", () => {
    const dd = loadOracle("deep-diff")!.module as Fn;
    expect(dd({ a: 1 }, { a: 1 })).toBeUndefined();
    expect(Array.isArray(dd({ a: 1 }, { a: 2 }))).toBe(true);
  });

  it("returns undefined for anything else", () => {
    expect(loadOracle("left-pad")).toBeUndefined();
    expect(loadOracle("node-abort-controller")).toBeUndefined();
    expect(loadOracle("../x")).toBeUndefined();
  });
});
