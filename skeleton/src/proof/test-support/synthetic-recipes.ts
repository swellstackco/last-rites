// Pure synthetic oracles, candidates and call shapes for testing the runner without any real package.
import fc from "fast-check";
import type { CallShape, Outcome, Projection, Recipe } from "../runner/types.js";
import type { CallSite, UsageSurfaceResult } from "../types.js";

type Fn = (...a: unknown[]) => unknown;

const IDENTITY: Projection = { name: "identity", observes: "value", apply: (v) => v };

export interface SyntheticCase {
  /** Same as the shape id. */
  name: string;
  shape: CallShape;
  recipe: Recipe;
  /** The reference function (the Oracle). */
  oracle: Fn;
  /** An independently written, behaviour-equivalent function. */
  candidate: Fn;
}

function shapeBase(
  id: string,
  member: string,
  argCount: number,
  arbitrary: fc.Arbitrary<unknown[]>,
  rest: Pick<CallShape, "outputKind" | "orderSensitive" | "guard" | "classify" | "requiredLabels">,
): CallShape {
  return {
    id,
    member,
    argCount,
    projection: IDENTITY,
    accepts: (site) => site.member === member && site.argCount === argCount && site.new !== true,
    arbitrary,
    ...rest,
  };
}

const isIntArray = (v: unknown): boolean => Array.isArray(v) && v.every((x) => Number.isInteger(x));
const smallInt = fc.integer({ min: -20, max: 20 });

// sort-unique over integer arrays.
const sortUniqueShape = shapeBase(
  "sort-unique",
  "unique",
  1,
  fc.tuple(fc.array(smallInt, { maxLength: 8 })).map((t): unknown[] => t),
  {
    outputKind: "array",
    orderSensitive: false,
    guard: (args) => args.length === 1 && isIntArray(args[0]),
    classify: (args) => {
      const a = args[0] as number[];
      return a.length === 0 ? ["empty"] : new Set(a).size < a.length ? ["has-duplicates"] : ["unique"];
    },
    requiredLabels: ["empty", "has-duplicates"],
  },
);

// guarded-sqrt throws on negatives and puts the input in the message.
const guardedSqrtShape = shapeBase(
  "guarded-sqrt",
  "",
  1,
  fc.tuple(fc.integer({ min: -10, max: 100 })).map((t): unknown[] => t),
  {
    outputKind: "opaque",
    orderSensitive: false,
    guard: (args) => args.length === 1 && Number.isInteger(args[0]),
    classify: (_args, oracle: Outcome) => [oracle.kind === "threw" ? "throws" : "returns"],
    requiredLabels: ["throws", "returns"],
  },
);

// subtract(a, b) is order sensitive.
const subtractShape = shapeBase(
  "subtract",
  "subtract",
  2,
  fc.tuple(smallInt, smallInt).map((t): unknown[] => t),
  {
    outputKind: "opaque",
    orderSensitive: true,
    guard: (args) => args.length === 2 && Number.isInteger(args[0]) && Number.isInteger(args[1]),
    classify: (args) => [(args[0] as number) === (args[1] as number) ? "equal-operands" : "different-operands"],
    requiredLabels: ["different-operands"],
  },
);

// make-record returns plain objects.
const makeRecordShape = shapeBase(
  "make-record",
  "record",
  2,
  fc.tuple(fc.string({ maxLength: 6 }), fc.array(smallInt, { maxLength: 3 })).map((t): unknown[] => t),
  {
    outputKind: "object",
    orderSensitive: false,
    guard: (args) => args.length === 2 && typeof args[0] === "string" && isIntArray(args[1]),
    classify: (args) => [(args[0] as string) === "" ? "empty-id" : "named"],
    requiredLabels: ["named"],
  },
);

// first-of-two: the smaller operand; symmetric in its arguments.
const firstOfTwoShape = shapeBase(
  "first-of-two",
  "",
  2,
  fc.tuple(smallInt, smallInt).map((t): unknown[] => t),
  {
    outputKind: "opaque",
    orderSensitive: false,
    guard: (args) => args.length === 2 && Number.isInteger(args[0]) && Number.isInteger(args[1]),
    classify: () => ["pair"],
    requiredLabels: ["pair"],
  },
);

function recipeOf(shape: CallShape): Recipe {
  return { package: `synthetic-${shape.id}`, shapes: [shape] };
}

export const SYNTHETIC_CASES: readonly SyntheticCase[] = [
  {
    name: "sort-unique",
    shape: sortUniqueShape,
    recipe: recipeOf(sortUniqueShape),
    oracle: (a) => [...new Set(a as number[])].sort((x, y) => x - y),
    candidate: (a) => {
      const out: number[] = [];
      for (const x of [...(a as number[])].sort((p, q) => p - q)) if (out[out.length - 1] !== x) out.push(x);
      return out;
    },
  },
  {
    name: "guarded-sqrt",
    shape: guardedSqrtShape,
    recipe: recipeOf(guardedSqrtShape),
    oracle: (n) => {
      if ((n as number) < 0) throw new Error(`negative input: ${String(n)}`);
      return Math.sqrt(n as number);
    },
    candidate: (n) => {
      if ((n as number) < 0) throw new RangeError("cannot take the root of a negative number");
      return Math.sqrt(n as number);
    },
  },
  {
    name: "subtract",
    shape: subtractShape,
    recipe: recipeOf(subtractShape),
    oracle: (a, b) => (a as number) - (b as number),
    candidate: (a, b) => (a as number) + -(b as number),
  },
  {
    name: "make-record",
    shape: makeRecordShape,
    recipe: recipeOf(makeRecordShape),
    oracle: (id, tags) => ({ id, tags: tags as number[], count: (tags as number[]).length }),
    candidate: (id, tags) => ({ count: (tags as number[]).length, tags: [...(tags as number[])], id }),
  },
  {
    name: "first-of-two",
    shape: firstOfTwoShape,
    recipe: recipeOf(firstOfTwoShape),
    oracle: (a, b) => ((a as number) <= (b as number) ? a : b),
    candidate: (a, b) => Math.min(a as number, b as number),
  },
];

/** A module for a case: member "" is the function itself, otherwise an object holding it under the member. */
export function moduleFor(shape: CallShape, fn: Fn): unknown {
  if (shape.member === "") return fn;
  const holder: Record<string, unknown> = {};
  holder[shape.member] = function (this: unknown, ...a: unknown[]) {
    return fn.apply(this, a);
  };
  return holder;
}

/** `n` call sites that `shape.accepts`, with distinct positions. */
export function usageFor(shape: CallShape, n: number): CallSite[] {
  const sites: CallSite[] = [];
  for (let i = 0; i < n; i++) {
    sites.push({
      file: `src/file${i}.js`,
      line: i + 1,
      column: 3,
      callee: shape.member === "" ? "pkg" : `pkg.${shape.member}`,
      member: shape.member,
      argCount: shape.argCount,
      argTexts: Array.from({ length: shape.argCount }, (_, k) => `arg${k}`),
      enclosing: "src",
    });
  }
  return sites;
}

/** A usage result with `n` accepted sites and one import site. */
export function usageResultFor(shape: CallShape, n: number, pkg = `synthetic-${shape.id}`): UsageSurfaceResult {
  return {
    package: pkg,
    filesScanned: Math.max(n, 1),
    callSites: usageFor(shape, n),
    importSites: [{ file: "src/file0.js", line: 1, column: 1, form: "require" }],
    warnings: [],
  };
}

export interface Fault {
  name: string;
  /** Builds a faulty candidate from the oracle function and its case. */
  wrap(oracle: Fn, c: SyntheticCase): Fn;
  /** True when the fault cannot be seen through the harness (the argument clones hide it). */
  equivalent?: true;
}

const isArray = (v: unknown): v is unknown[] => Array.isArray(v);

export const FAULT_FAMILY: readonly Fault[] = [
  { name: "identity", wrap: (_f, _c) => (...a) => a[0] },
  { name: "de-duplicate", wrap: (f) => (...a) => { const r = f(...a); return isArray(r) ? [...new Set(r)] : r; } },
  { name: "reverse", wrap: (f) => (...a) => { const r = f(...a); return isArray(r) ? [...r].reverse() : r; } },
  { name: "drop-last", wrap: (f) => (...a) => { const r = f(...a); return isArray(r) ? r.slice(0, -1) : r; } },
  {
    name: "off-by-one on a threshold",
    wrap: (f) => (...a) => {
      const r = f(...a);
      return typeof r === "number" && r >= 5 ? r + 1 : r;
    },
  },
  {
    name: "throw on empty",
    wrap: (f) => (...a) => {
      if (a.length === 0 || (isArray(a[0]) && a[0].length === 0) || a[0] === "") throw new Error("empty");
      return f(...a);
    },
  },
  {
    name: "mutate its input",
    equivalent: true,
    wrap: (f) => (...a) => {
      const r = f(...a.map((x) => (isArray(x) ? [...x] : x)));
      for (const x of a) if (isArray(x)) x.push(999);
      return r;
    },
  },
  { name: "swap arguments", wrap: (f) => (...a) => (a.length >= 2 ? f(a[1], a[0], ...a.slice(2)) : f(...a)) },
];
