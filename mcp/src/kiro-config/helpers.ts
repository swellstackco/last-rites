// Small pure helpers shared by the Kiro Config_Validators. Every function is total: it never throws.

export type CheckError = { path: string; message: string };
export type Check = { ok: true } | { ok: false; error: CheckError };

export const OK: Check = { ok: true };

export function fail(path: string, message: string): Check {
  return { ok: false, error: { path, message } };
}

/** Joins a parent path and a key: `""` + `a` is `a`, `a` + `b` is `a.b`. */
export function joinPath(base: string, key: string): string {
  return base === "" ? key : `${base}.${key}`;
}

export function indexPath(base: string, index: number): string {
  return `${base}[${index}]`;
}

export type ParsedJson = { ok: true; value: unknown } | { ok: false; error: CheckError };

/** Parses JSON text. Path of a parse failure is the empty string (the whole file). */
export function parseJson(text: unknown): ParsedJson {
  if (typeof text !== "string") return { ok: false, error: { path: "", message: "file content is not text" } };
  if (text.trim() === "") return { ok: false, error: { path: "", message: "file is empty" } };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: { path: "", message: "file is not valid JSON" } };
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks that `value` is an object whose keys are all in `required` or `optional`, and that every `required` key is
 * present. The first offence wins: missing required keys (in list order), then unknown keys (in key order).
 */
export function objectWith(
  value: unknown,
  path: string,
  spec: { required: readonly string[]; optional?: readonly string[] },
): Check {
  if (!isPlainObject(value)) return fail(path, "must be an object");
  for (const key of spec.required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) return fail(joinPath(path, key), "required field is missing");
  }
  const known = new Set<string>([...spec.required, ...(spec.optional ?? [])]);
  for (const key of Object.keys(value)) {
    if (!known.has(key)) return fail(joinPath(path, key), "unknown field");
  }
  return OK;
}

/** Checks `obj[key]` is a string (non-empty by default). Assumes `obj` passed `objectWith`; an absent key is ok. */
export function stringField(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  opts: { allowEmpty?: boolean } = {},
): Check {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return OK;
  const v = obj[key];
  if (typeof v !== "string") return fail(joinPath(path, key), "must be a string");
  if (!opts.allowEmpty && v.trim() === "") return fail(joinPath(path, key), "must not be empty");
  return OK;
}

export function boolField(obj: Record<string, unknown>, key: string, path: string): Check {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return OK;
  return typeof obj[key] === "boolean" ? OK : fail(joinPath(path, key), "must be a boolean");
}

export function numberField(obj: Record<string, unknown>, key: string, path: string): Check {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return OK;
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? OK : fail(joinPath(path, key), "must be a number");
}

/** Checks `value` is an array and every item passes `each`; the first failing item wins. */
export function arrayOf(value: unknown, path: string, each: (item: unknown, itemPath: string) => Check): Check {
  if (!Array.isArray(value)) return fail(path, "must be an array");
  for (let i = 0; i < value.length; i++) {
    const r = each(value[i], indexPath(path, i));
    if (!r.ok) return r;
  }
  return OK;
}

export function stringItem(item: unknown, itemPath: string): Check {
  return typeof item === "string" ? OK : fail(itemPath, "must be a string");
}

/** Optional array-of-strings field. */
export function stringArrayField(obj: Record<string, unknown>, key: string, path: string): Check {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return OK;
  return arrayOf(obj[key], joinPath(path, key), stringItem);
}

/** Optional object whose values are all strings. */
export function stringMapField(obj: Record<string, unknown>, key: string, path: string): Check {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return OK;
  const v = obj[key];
  const p = joinPath(path, key);
  if (!isPlainObject(v)) return fail(p, "must be an object");
  for (const k of Object.keys(v)) {
    if (typeof v[k] !== "string") return fail(joinPath(p, k), "must be a string");
  }
  return OK;
}

/** Runs checks in order and returns the first failure. */
export function firstFailure(...checks: Check[]): Check {
  for (const c of checks) if (!c.ok) return c;
  return OK;
}

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;

export function isKebab(s: string): boolean {
  return KEBAB.test(s);
}

export function isSemver(s: string): boolean {
  return SEMVER.test(s);
}
