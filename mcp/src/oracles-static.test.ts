import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { loadOracle } from "./oracles-static.js";

// The app's `loadOracle` is not part of the programmatic entry (and tsconfig forbids a relative import out of
// `src`), so the reference here is the same two lines it runs: `require(pkg)` and the installed package.json.
const require = createRequire(import.meta.url);
const reference = (pkg: string) => ({
  module: require(pkg) as unknown,
  version: (JSON.parse(readFileSync(require.resolve(`${pkg}/package.json`), "utf8")) as { version: string }).version,
});

/** Small deterministic generator, so the 50 samples are fixed. */
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("loadOracle (static)", () => {
  it("pins the versions", () => {
    expect(loadOracle("intersect")?.version).toBe("1.0.1");
    expect(loadOracle("deep-diff")?.version).toBe("1.0.2");
  });

  it("returns undefined for any other name", () => {
    for (const n of ["left-pad", "", "../intersect", "Intersect", "__proto__", "constructor"]) expect(loadOracle(n)).toBeUndefined();
  });

  it("agrees with the installed packages on version and module", () => {
    for (const pkg of ["intersect", "deep-diff"]) {
      const a = loadOracle(pkg)!;
      const b = reference(pkg);
      expect(a.version).toBe(b.version);
      expect(a.module).toBe(b.module);
    }
  });

  it("gives equal results on 50 fixed inputs", () => {
    const rnd = lcg(20261113);
    const arr = () => Array.from({ length: Math.floor(rnd() * 6) }, () => Math.floor(rnd() * 5));
    const obj = (): Record<string, number> => Object.fromEntries(Array.from({ length: Math.floor(rnd() * 4) }, () => [`k${Math.floor(rnd() * 4)}`, Math.floor(rnd() * 3)]));
    type Fn = (...a: unknown[]) => unknown;
    const si = loadOracle("intersect")!.module as Fn;
    const ri = reference("intersect").module as Fn;
    const sd = loadOracle("deep-diff")!.module as Fn;
    const rd = reference("deep-diff").module as Fn;
    for (let i = 0; i < 50; i++) {
      const [a, b] = [arr(), arr()];
      expect(si(a, b)).toEqual(ri(a, b));
      const [x, y] = [obj(), obj()];
      expect(sd(x, y)).toEqual(rd(x, y));
    }
  });
});
