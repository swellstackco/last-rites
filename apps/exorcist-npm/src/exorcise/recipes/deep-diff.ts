import fc from "fast-check";
import type { CallShape, Outcome, Projection } from "@graveyard-kit/skeleton/proof/runner";
import type { CallSite } from "@graveyard-kit/skeleton/proof";
import { loadOracle } from "../oracles.js";
import type { AppRecipe } from "./types.js";

const IS_UNDEFINED: Projection = {
  name: "isUndefined",
  observes: "definedness",
  apply: (v) => v === undefined,
};

export const KEYS = ["a", "b", "*", "_id", "className", "fields", "type"] as const;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const leaf: fc.Arbitrary<Json> = fc.oneof(
  fc.string({ maxLength: 6 }),
  fc.integer({ min: -5, max: 5 }),
  fc.boolean(),
  fc.constant(null),
  fc.constantFrom("", "ü", "*", "_id"),
);

const tree: (depth?: number) => fc.Arbitrary<Json> = fc.memo<Json>((depth: number): fc.Arbitrary<Json> => {
  if (depth <= 1) return leaf;
  const inner: fc.Arbitrary<Json> = tree(depth - 1);
  return fc.oneof(
    leaf,
    fc.array(inner, { maxLength: 3 }),
    fc.dictionary(fc.constantFrom(...KEYS), inner, { maxKeys: 4 }),
  );
});
export const treeArb: fc.Arbitrary<Json> = tree(4);

export function isJson(v: unknown, depth = 0): boolean {
  if (depth > 20) return false;
  if (v === null || typeof v === "string" || typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v) && !Object.is(v, -0);
  if (Array.isArray(v)) return v.every((x) => isJson(x, depth + 1));
  if (typeof v === "object") {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return false;
    return Object.values(v as object).every((x) => isJson(x, depth + 1));
  }
  return false;
}

/** Deep clone with the key order of every object reversed. */
export function cloneReordered(v: Json): Json {
  if (Array.isArray(v)) return v.map(cloneReordered);
  if (v !== null && typeof v === "object") {
    const out: { [k: string]: Json } = {};
    for (const k of Object.keys(v).reverse()) out[k] = cloneReordered(v[k]!);
    return out;
  }
  return v;
}

type Path = (string | number)[];

function paths(v: Json, prefix: Path = []): Path[] {
  const out: Path[] = [prefix];
  if (Array.isArray(v)) v.forEach((x, i) => out.push(...paths(x, [...prefix, i])));
  else if (v !== null && typeof v === "object")
    for (const k of Object.keys(v)) out.push(...paths(v[k]!, [...prefix, k]));
  return out;
}

function sameJson(a: Json, b: Json): boolean {
  return JSON.stringify(cloneReordered(a)) === JSON.stringify(cloneReordered(b));
}

function replaceAt(v: Json, path: Path, value: Json): Json {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (Array.isArray(v)) return v.map((x, i) => (i === head ? replaceAt(x, rest, value) : x));
  const out: { [k: string]: Json } = {};
  for (const k of Object.keys(v as object)) {
    out[k] = k === head ? replaceAt((v as { [k: string]: Json })[k]!, rest, value) : (v as { [k: string]: Json })[k]!;
  }
  return out;
}

function getAt(v: Json, path: Path): Json {
  let cur: Json = v;
  for (const p of path) cur = (cur as never)[p as never];
  return cur;
}

/** A clone of `v` with exactly one value replaced by something that is not deep equal to it. */
export function cloneWithOneChange(v: Json, pick: number, replacement: Json): Json {
  const all = paths(v);
  const path = all[pick % all.length]!;
  const old = getAt(v, path);
  const next = sameJson(old, replacement) ? [old] : replacement;
  return replaceAt(v, path, next);
}

const pairArb: fc.Arbitrary<unknown[]> = fc.oneof(
  treeArb.map((t): unknown[] => [t, cloneReordered(t)]),
  fc.tuple(treeArb, fc.nat(), leaf).map(([t, pick, r]): unknown[] => [t, cloneWithOneChange(t, pick, r)]),
  fc.tuple(treeArb, treeArb).map((p): unknown[] => p),
);

const shape: CallShape = {
  id: "deep-diff",
  member: "",
  argCount: 2,
  outputKind: "opaque",
  orderSensitive: false,
  projection: IS_UNDEFINED,
  accepts: (site: CallSite) =>
    site.member === "" &&
    site.argCount === 2 &&
    site.new !== true &&
    !site.argTexts.some((t) => t.startsWith("...")) &&
    site.consumedAs === "undefined-check",
  arbitrary: pairArb,
  guard: (args) => args.length === 2 && isJson(args[0]) && isJson(args[1]),
  classify: (_args: unknown[], oracle: Outcome) =>
    oracle.kind !== "returned" ? [] : [oracle.value === undefined ? "equal-pair" : "unequal-pair"],
  requiredLabels: ["equal-pair", "unequal-pair"],
};

export const deepDiffRecipe: AppRecipe = {
  package: "deep-diff",
  expectedVersion: "1.0.2",
  shapes: [shape],
  loadOracle: () => loadOracle("deep-diff"),
};
