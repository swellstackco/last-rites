// Mutators: deliberately wrong wrappers around a function. Each calls the real function first (so a throw and
// any side effect stay the same) and returns a new value. None writes to its inputs or to global state.
import { deepClone } from "./clone.js";
import type { CallShape, Mutator } from "./types.js";

type Fn = (...a: unknown[]) => unknown;

const observesValue = (s: CallShape): boolean => s.projection.observes === "value";
const arrayValue = (s: CallShape): boolean => s.outputKind === "array" && observesValue(s);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

export const BUILT_IN_MUTATORS: readonly Mutator[] = [
  {
    name: "reverse-array",
    applicable: arrayValue,
    wrap: (f: Fn): Fn =>
      function (this: unknown, ...a: unknown[]) {
        const r = f.apply(this, a);
        return Array.isArray(r) ? [...r].reverse() : r;
      },
  },
  {
    name: "drop-last",
    applicable: arrayValue,
    wrap: (f: Fn): Fn =>
      function (this: unknown, ...a: unknown[]) {
        const r = f.apply(this, a);
        return Array.isArray(r) ? r.slice(0, -1) : r;
      },
  },
  {
    name: "return-undefined",
    applicable: () => true,
    wrap: (f: Fn): Fn =>
      function (this: unknown, ...a: unknown[]) {
        f.apply(this, a);
        return undefined;
      },
  },
  {
    name: "swap-first-two-args",
    applicable: (s) => s.argCount >= 2 && s.orderSensitive,
    wrap: (f: Fn): Fn =>
      function (this: unknown, ...a: unknown[]) {
        return f.apply(this, a.length >= 2 ? [a[1], a[0], ...a.slice(2)] : a);
      },
  },
  {
    name: "add-key",
    applicable: (s) => s.outputKind === "object" && observesValue(s),
    wrap: (f: Fn): Fn =>
      function (this: unknown, ...a: unknown[]) {
        const r = f.apply(this, a);
        if (!isPlainObject(r)) return r;
        const copy = deepClone(r);
        Object.defineProperty(copy, "__sabotage__", { value: true, enumerable: true, writable: true, configurable: true });
        return copy;
      },
  },
  {
    name: "return-defined",
    applicable: (s) => s.projection.observes === "definedness",
    wrap: (f: Fn): Fn =>
      function (this: unknown, ...a: unknown[]) {
        f.apply(this, a);
        return Object.freeze({ __sabotage__: "defined" });
      },
  },
];

/** The mutators of `list` (default: the built-ins) that apply to `shape`, in list order. */
export function applicableMutators(shape: CallShape, list: readonly Mutator[] = BUILT_IN_MUTATORS): Mutator[] {
  return list.filter((m) => m.applicable(shape));
}
