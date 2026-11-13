// deepClone: gives each side of a differential run its own copy of the arguments.

const MAX_DEPTH = 1000;

/** Thrown past the depth guard; `runProof` reports it as `recipe_failure`. */
export class CloneDepthError extends Error {
  constructor() {
    super(`value nested deeper than ${MAX_DEPTH} levels`);
  }
}

function define(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

function clone(v: unknown, depth: number): unknown {
  if (typeof v !== "object" || v === null) return v; // primitives incl. -0, NaN, undefined, bigint; functions as is
  if (depth > MAX_DEPTH) throw new CloneDepthError();
  if (Array.isArray(v)) return v.map((x) => clone(x, depth + 1));
  if (v instanceof Date) return new Date(v.getTime());
  if (!isPlainObject(v)) return v;
  const out: Record<string, unknown> = Object.getPrototypeOf(v) === null ? Object.create(null) : {};
  for (const key of Object.keys(v)) define(out, key, clone((v as Record<string, unknown>)[key], depth + 1));
  return out;
}

export function deepClone<T>(value: T): T {
  return clone(value, 0) as T;
}
