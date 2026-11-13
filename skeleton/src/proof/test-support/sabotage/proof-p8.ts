// Sabotage_List for Property 8 (outcome equivalence). Each entry is a deliberately wrong implementation bundle.
import fc from "fast-check";
import type { OutcomeImpl } from "../../runner/outcome.p8.test.js";
import { REAL_OUTCOME_IMPL } from "../../runner/outcome.p8.test.js";
import type { Outcome, Projection } from "../../runner/types.js";
import type { Sabotage } from "../../../graveyard/test-support/sabotage-runner.js";

export const P8_REQUIRED = [
  "compare thrown messages",
  "-0 treated as 0",
  "NaN never equal",
  "objects are key-order sensitive",
  "arrays sorted before comparing",
  "compare with JSON.stringify",
  "deepClone returns the same object",
  "deepClone assigns __proto__",
] as const;

const real = REAL_OUTCOME_IMPL;

interface EqOptions {
  prim: (a: unknown, b: unknown) => boolean;
  keyOrder?: boolean;
  sortArrays?: boolean;
}

/** A copy of the real comparison with one defect switched on. */
function makeEqual(o: EqOptions): (a: unknown, b: unknown) => boolean {
  const key = (v: unknown): string => fc.stringify(v);
  const eq = (a: unknown, b: unknown): boolean => {
    if (o.prim(a, b)) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      const x = o.sortArrays ? [...a].sort((m, n) => key(m).localeCompare(key(n))) : a;
      const y = o.sortArrays ? [...b].sort((m, n) => key(m).localeCompare(key(n))) : b;
      return x.every((v, i) => eq(v, y[i]));
    }
    if (a instanceof Date || b instanceof Date) {
      return a instanceof Date && b instanceof Date && Object.is(a.getTime(), b.getTime());
    }
    const pa = Object.getPrototypeOf(a) as unknown;
    const pb = Object.getPrototypeOf(b) as unknown;
    if ((pa !== Object.prototype && pa !== null) || (pb !== Object.prototype && pb !== null)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    if (o.keyOrder && ka.some((k, i) => k !== kb[i])) return false;
    return ka.every((k) => Object.hasOwn(b, k) && eq((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  };
  return eq;
}

/** `outcomesAgree` rebuilt on top of a given equality. */
function agreeWith(eq: (a: unknown, b: unknown) => boolean): OutcomeImpl["outcomesAgree"] {
  return (projection: Projection, a: Outcome, b: Outcome) => {
    if (a.kind === "threw" || b.kind === "threw") return a.kind === b.kind;
    return eq(projection.apply(a.value), projection.apply(b.value));
  };
}

function withEquality(eq: (a: unknown, b: unknown) => boolean): OutcomeImpl {
  return { ...real, structuralEqual: eq, outcomesAgree: agreeWith(eq) };
}

const sameValueZero = (a: unknown, b: unknown): boolean => a === b || (a !== a && b !== b); // eslint-disable-line no-self-compare

function define(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

export const P8_SABOTAGES: readonly Sabotage<OutcomeImpl>[] = [
  {
    name: "compare thrown messages",
    impl: {
      ...real,
      outcomesAgree: (projection, a, b) => {
        if (a.kind === "threw" && b.kind === "threw") {
          return (a as { message?: string }).message === (b as { message?: string }).message;
        }
        return real.outcomesAgree(projection, a, b);
      },
    },
  },
  {
    name: "-0 treated as 0",
    impl: withEquality(makeEqual({ prim: (a, b) => sameValueZero(a, b) })),
  },
  {
    name: "NaN never equal",
    impl: withEquality(makeEqual({ prim: (a, b) => a === b })),
  },
  {
    name: "objects are key-order sensitive",
    impl: withEquality(makeEqual({ prim: Object.is, keyOrder: true })),
  },
  {
    name: "arrays sorted before comparing",
    impl: withEquality(makeEqual({ prim: Object.is, sortArrays: true })),
  },
  {
    name: "compare with JSON.stringify",
    impl: withEquality((a, b) => JSON.stringify(a) === JSON.stringify(b)),
  },
  {
    name: "deepClone returns the same object",
    impl: { ...real, deepClone: <T>(v: T): T => v },
  },
  {
    name: "deepClone assigns __proto__",
    impl: {
      ...real,
      deepClone: <T>(value: T): T => {
        const copy = (v: unknown): unknown => {
          if (Array.isArray(v)) return v.map(copy);
          if (v instanceof Date) return new Date(v.getTime());
          if (typeof v === "object" && v !== null && Object.getPrototypeOf(v) === Object.prototype) {
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(v)) {
              if (k === "__proto__") out[k] = copy((v as Record<string, unknown>)[k]); // assignment, not define
              else define(out, k, copy((v as Record<string, unknown>)[k]));
            }
            return out;
          }
          return v;
        };
        return copy(value) as T;
      },
    },
  },
];
