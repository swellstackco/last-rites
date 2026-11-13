import fc from "fast-check";
import { structuralEqual } from "./equal.js";
import type { Outcome, Projection } from "./types.js";

/** Calls `f`; a throw of anything becomes `{ kind: "threw" }` and the thrown value is dropped. */
export function capture(f: () => unknown): Outcome {
  try {
    return { kind: "returned", value: f() };
  } catch {
    return { kind: "threw" };
  }
}

export function isThenable(v: unknown): boolean {
  return (
    (typeof v === "object" || typeof v === "function") &&
    v !== null &&
    typeof (v as { then?: unknown }).then === "function"
  );
}

/** Both threw: equal whatever the messages. Exactly one threw: different. Else compare projections. */
export function outcomesAgree(projection: Projection, a: Outcome, b: Outcome): boolean {
  if (a.kind === "threw" || b.kind === "threw") return a.kind === b.kind;
  return structuralEqual(projection.apply(a.value), projection.apply(b.value));
}

const LIMIT = 2000;

/** `fc.stringify`, cut to 2000 UTF-16 code units followed by `…`. */
export function render(v: unknown): string {
  const s = fc.stringify(v);
  return s.length > LIMIT ? s.slice(0, LIMIT) + "…" : s;
}

export function renderOutcome(o: Outcome): string {
  return o.kind === "threw" ? "<threw>" : render(o.value);
}

/**
 * Finds `member` ("" for the module itself, else a "."-joined property path) on `module`.
 * `thisArg` is the object holding the function (undefined for the module itself).
 */
export function resolveMember(
  module: unknown,
  member: string,
): { fn: (...a: unknown[]) => unknown; thisArg: unknown } | undefined {
  let holder: unknown = undefined;
  let cur: unknown = module;
  if (member !== "") {
    for (const key of member.split(".")) {
      if ((typeof cur !== "object" && typeof cur !== "function") || cur === null) return undefined;
      holder = cur;
      cur = (cur as Record<string, unknown>)[key];
    }
  }
  return typeof cur === "function" ? { fn: cur as (...a: unknown[]) => unknown, thisArg: holder } : undefined;
}
