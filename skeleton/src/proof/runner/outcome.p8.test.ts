// Feature: proof-harness, Property 8: Outcome equivalence including exceptions
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assertProperty } from "../../death-score/fc-runner.js";
import { deepClone } from "./clone.js";
import { structuralEqual } from "./equal.js";
import { capture, outcomesAgree } from "./outcome.js";
import type { Outcome, Projection } from "./types.js";

/** The three functions Property 8 is about; sabotage lists replace them one at a time. */
export interface OutcomeImpl {
  structuralEqual(a: unknown, b: unknown): boolean;
  deepClone<T>(value: T): T;
  outcomesAgree(projection: Projection, a: Outcome, b: Outcome): boolean;
}

export const REAL_OUTCOME_IMPL: OutcomeImpl = { structuralEqual, deepClone, outcomesAgree };

const IDENTITY: Projection = { name: "identity", observes: "value", apply: (v) => v };
const IS_UNDEFINED: Projection = { name: "isUndefined", observes: "definedness", apply: (v) => v === undefined };

class Box {
  constructor(readonly field: unknown) {}
}

// A description is plain data; `make` builds a fresh value from it every time, so two builds never share identity.
type Prim = string | number | boolean | bigint | null | undefined;
type D =
  | { t: "prim"; v: Prim }
  | { t: "arr"; items: D[] }
  | { t: "obj"; entries: [string, D][] }
  | { t: "date"; ms: number }
  | { t: "inst"; field: D };

type Order = "same" | "reverse" | "rotate";

function define(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

function reorder<T>(items: readonly T[], order: Order): T[] {
  if (order === "reverse") return [...items].reverse();
  if (order === "rotate") return [...items.slice(1), ...items.slice(0, 1)];
  return [...items];
}

function make(d: D, order: Order = "same"): unknown {
  switch (d.t) {
    case "prim":
      return d.v;
    case "arr":
      return d.items.map((x) => make(x, order));
    case "obj": {
      const o: Record<string, unknown> = {};
      for (const [k, v] of reorder(d.entries, order)) define(o, k, make(v, order));
      return o;
    }
    case "date":
      return new Date(d.ms);
    case "inst":
      return new Box(make(d.field, order));
  }
}

const primArb: fc.Arbitrary<D> = fc
  .oneof(
    fc.string(),
    fc.integer(),
    fc.double(),
    fc.boolean(),
    fc.constant(null),
    fc.constant(undefined),
    fc.bigInt(),
    fc.constant(-0),
    fc.constant(0),
    fc.constant(NaN),
  )
  .map((v) => ({ t: "prim", v }) as D);

const msArb = fc.oneof(fc.integer({ min: -8.64e15, max: 8.64e15 }), fc.constant(NaN));
const keyArb = fc.oneof(
  fc.constantFrom("__proto__", "constructor", "toString", "a", "b", ""),
  fc.string({ maxLength: 4 }),
);

function descArb(withInstances: boolean): fc.Arbitrary<D> {
  return fc.letrec<{ node: D; arr: D; obj: D; date: D; inst: D }>((tie) => ({
    node: fc.oneof(
      { maxDepth: 4, depthSize: "small" },
      primArb,
      tie("arr"),
      tie("obj"),
      tie("date"),
      ...(withInstances ? [tie("inst")] : []),
    ),
    arr: fc.array(tie("node"), { maxLength: 4 }).map((items): D => ({ t: "arr", items })),
    obj: fc
      .uniqueArray(fc.tuple(keyArb, tie("node")), { selector: (e) => e[0], maxLength: 4 })
      .map((entries): D => ({ t: "obj", entries })),
    date: msArb.map((ms): D => ({ t: "date", ms })),
    inst: tie("node").map((field): D => ({ t: "inst", field })),
  })).node;
}

function fail(msg: string): never {
  throw new Error(msg);
}

function isPlain(v: object): boolean {
  return Object.getPrototypeOf(v) === Object.prototype;
}

/** The clone must mirror `a`: new containers, same primitives (`Object.is`), own keys kept. */
function checkClone(a: unknown, c: unknown, path: string): void {
  if (Array.isArray(a)) {
    if (c === a) fail(`deepClone returned the same array at ${path}`);
    if (!Array.isArray(c) || c.length !== a.length) fail(`deepClone changed the array at ${path}`);
    a.forEach((x, i) => checkClone(x, (c as unknown[])[i], `${path}[${i}]`));
  } else if (a instanceof Date) {
    if (c === a || !(c instanceof Date) || !Object.is(c.getTime(), a.getTime())) fail(`deepClone broke the Date at ${path}`);
  } else if (typeof a === "object" && a !== null && isPlain(a)) {
    if (c === a) fail(`deepClone returned the same object at ${path}`);
    if (typeof c !== "object" || c === null || !isPlain(c)) fail(`deepClone changed the prototype at ${path}`);
    for (const k of Object.keys(a)) {
      if (!Object.hasOwn(c, k)) fail(`deepClone lost the own key ${JSON.stringify(k)} at ${path}`);
      checkClone((a as Record<string, unknown>)[k], (c as Record<string, unknown>)[k], `${path}.${k}`);
    }
    if (Object.keys(c).length !== Object.keys(a).length) fail(`deepClone added keys at ${path}`);
  } else if (!Object.is(a, c)) {
    fail(`deepClone changed ${String(a)} to ${String(c)} at ${path}`);
  }
}

/** Like `capture`, but keeps the thrown message on the side so that a wrong comparison could see it. */
function captureWithMessage(f: () => unknown): Outcome {
  try {
    return { kind: "returned", value: f() };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { kind: "threw", message } as Outcome;
  }
}

/** Build Property 8 over an implementation bundle. */
export function build(impl: OutcomeImpl) {
  const eq = impl.structuralEqual;
  return fc.property(
    descArb(false),
    descArb(true),
    fc.constantFrom<Order>("reverse", "rotate"),
    fc.tuple(primArb, primArb).filter(([p, q]) => !Object.is((p as { v: Prim }).v, (q as { v: Prim }).v)),
    fc.tuple(msArb, msArb),
    fc.record({
      aThrows: fc.boolean(),
      bThrows: fc.boolean(),
      msgA: fc.string(),
      msgB: fc.string(),
      throwString: fc.boolean(),
      useReorder: fc.boolean(),
      projection: fc.constantFrom(IDENTITY, IS_UNDEFINED),
    }),
    fc.tuple(descArb(false), fc.string()),
    (pure, withInst, order, [pd, qd], [ms1, ms2], sc, [other]) => {
      // structuralEqual: reflexive, symmetric, independent of key order.
      const a = make(pure);
      const b = make(pure);
      if (!eq(a, a)) fail(`not reflexive on ${fc.stringify(a)}`);
      if (!eq(a, b) || !eq(b, a)) fail(`two builds of ${fc.stringify(a)} are not equal`);
      const permuted = make(pure, order);
      if (!eq(a, permuted) || !eq(permuted, a)) {
        fail(`key order matters: ${fc.stringify(a)} vs ${fc.stringify(permuted)}`);
      }

      // -0 / 0, NaN, array order, length.
      if (eq(-0, 0) || eq(0, -0)) fail("-0 must differ from 0");
      if (eq([-0], [0]) || eq({ k: -0 }, { k: 0 })) fail("-0 must differ from 0 inside containers");
      if (!eq(NaN, NaN) || !eq([NaN], [NaN]) || !eq({ k: NaN }, { k: NaN })) fail("NaN must equal NaN");
      const p = make(pd);
      const q = make(qd);
      if (eq([p, q], [q, p])) fail(`array order ignored for ${fc.stringify([p, q])}`);
      if (eq([p], [p, q])) fail("array length ignored");
      if (eq({ a: p }, { a: q }) || eq({ a: p }, { b: p })) fail("object difference ignored");
      if (eq({ a: p, b: q }, { a: p, b: p }) && !Object.is(p, q)) fail("object value difference ignored");
      if (eq([[p, q]], [[q, p]])) fail("nested array order ignored");

      // Date by time value.
      if (!eq(new Date(ms1), new Date(ms1))) fail("equal Dates differ");
      if (!Object.is(ms1, ms2) && eq(new Date(ms1), new Date(ms2))) fail(`Dates ${ms1} and ${ms2} compare equal`);

      // Class instances compare by identity.
      const i1 = new Box(p);
      const i2 = new Box(p);
      if (!eq(i1, i1)) fail("an instance must equal itself");
      if (eq(i1, i2) || eq([i1], [i2])) fail("distinct class instances with equal fields compare equal");

      // deepClone.
      const src = make(withInst);
      const cl = impl.deepClone(src);
      checkClone(src, cl, "$");
      if (!eq(src, cl)) fail(`clone is not structurally equal to ${fc.stringify(src)}`);
      const plain = make(pure);
      const plainClone = impl.deepClone(plain);
      if (typeof plain === "object" && plain !== null && !(plain instanceof Date) && plainClone === plain) {
        fail("deepClone returned the same object");
      }
      const special = impl.deepClone([-0, NaN, undefined, 5n, new Date(ms1)]);
      if (!Object.is(special[0], -0) || !Object.is(special[1], NaN) || special[2] !== undefined || special[3] !== 5n) {
        fail("deepClone changed -0, NaN, undefined or a bigint");
      }
      const holder: Record<string, unknown> = {};
      define(holder, "__proto__", { polluted: true });
      define(holder, "constructor", 1);
      const holderClone = impl.deepClone(holder);
      if (!Object.hasOwn(holderClone, "__proto__") || Object.getPrototypeOf(holderClone) !== Object.prototype) {
        fail("deepClone must define an own __proto__ key, not assign it");
      }
      if (!Object.hasOwn(holderClone, "constructor") || !eq(holder, holderClone)) fail("deepClone lost an own key");
      const arrClone = impl.deepClone([[1], { a: [2] }]);
      (arrClone[0] as number[]).push(9);
      if (arrClone.length !== 2) fail("clone is not an array of the same length");

      // outcomesAgree.
      const va = (): unknown => make(pure);
      const vb = (): unknown => (sc.useReorder ? make(pure, order) : make(withInst === pure ? pure : pd));
      const thrower = (throws: boolean, msg: string, value: () => unknown) => (): unknown => {
        if (throws) throw sc.throwString ? msg : new Error(msg);
        return value();
      };
      const oa = captureWithMessage(thrower(sc.aThrows, sc.msgA, va));
      const ob = captureWithMessage(thrower(sc.bThrows, sc.msgB, vb));
      // The real `capture` must see the same kinds.
      const ra = capture(thrower(sc.aThrows, sc.msgA, va));
      if (ra.kind !== oa.kind) fail("capture and the test capture disagree");
      const got = impl.outcomesAgree(sc.projection, oa, ob);
      let want: boolean;
      if (oa.kind === "threw" && ob.kind === "threw") want = true;
      else if (oa.kind === "threw" || ob.kind === "threw") want = false;
      else if (sc.projection.name === "isUndefined") want = (oa.value === undefined) === (ob.value === undefined);
      else want = eq(oa.value, ob.value);
      if (got !== want) {
        fail(`outcomesAgree(${sc.projection.name}, ${fc.stringify(oa)}, ${fc.stringify(ob)}) gave ${got}, wanted ${want}`);
      }
      // Both threw with different messages: still equal. One threw: never equal.
      const t1 = captureWithMessage(thrower(true, sc.msgA, va));
      const t2 = captureWithMessage(thrower(true, `${sc.msgB}|${other}|2`, va));
      if (!impl.outcomesAgree(sc.projection, t1, t2)) fail("two throws with different messages must agree");
      const r1 = captureWithMessage(va);
      if (impl.outcomesAgree(sc.projection, t1, r1) || impl.outcomesAgree(sc.projection, r1, t1)) {
        fail("a throw and a return must not agree");
      }
      if (!impl.outcomesAgree(IDENTITY, { kind: "returned", value: NaN }, { kind: "returned", value: NaN })) {
        fail("NaN outcomes must agree");
      }
      if (impl.outcomesAgree(IDENTITY, { kind: "returned", value: -0 }, { kind: "returned", value: 0 })) {
        fail("-0 and 0 outcomes must differ");
      }
    },
  );
}

describe("Property 8: Outcome equivalence including exceptions", () => {
  it("holds for structuralEqual, deepClone and outcomesAgree", () => {
    assertProperty("outcome equivalence", build(REAL_OUTCOME_IMPL));
  });

  it("deepClone refuses to recurse past depth 1000", () => {
    let v: unknown = 1;
    for (let i = 0; i < 1100; i++) v = [v];
    expect(() => deepClone(v)).toThrow(/deeper than 1000/);
  });
});
