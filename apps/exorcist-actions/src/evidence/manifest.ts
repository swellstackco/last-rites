// The Action_Manifest parser (Requirement 5.2, 5.4, 5.6): pure and total.
import { parse } from "yaml";

export interface ActionManifest {
  inputs: ReadonlyMap<string, { required: boolean; hasDefault: boolean }>;
  outputs: ReadonlySet<string>;
  /** `runs.using`, when it is a string. */
  using?: string;
}

export type ManifestParse = { ok: true; manifest: ActionManifest } | { ok: false };

const isMapping = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * `required` is true for the boolean `true` or the string `"true"` (the conservative reading: more
 * required inputs means more violations, never fewer). `hasDefault` is true when the key `default`
 * exists with a non-null value (an empty string is an explicit default).
 */
function inputFlags(spec: unknown): { required: boolean; hasDefault: boolean } {
  if (!isMapping(spec)) return { required: false, hasDefault: false };
  const required = spec["required"] === true || spec["required"] === "true";
  const d = spec["default"];
  return { required, hasDefault: d !== undefined && d !== null };
}

/** Never throws. Text that is not a YAML mapping (or not YAML) gives `{ ok: false }`. */
export function parseActionManifest(text: string): ManifestParse {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch {
    return { ok: false };
  }
  if (!isMapping(doc)) return { ok: false };

  const inputs = new Map<string, { required: boolean; hasDefault: boolean }>();
  const rawInputs = doc["inputs"];
  if (isMapping(rawInputs)) for (const [k, v] of Object.entries(rawInputs)) inputs.set(k, inputFlags(v));

  const outputs = new Set<string>();
  const rawOutputs = doc["outputs"];
  if (isMapping(rawOutputs)) for (const k of Object.keys(rawOutputs)) outputs.add(k);

  const runs = doc["runs"];
  const using = isMapping(runs) && typeof runs["using"] === "string" ? runs["using"] : undefined;
  return { ok: true, manifest: { inputs, outputs, ...(using !== undefined ? { using } : {}) } };
}

const NODE = /^node(0|[1-9][0-9]*)$/;

/**
 * The Runtime_Rule: `node<N>` with N at most 16 is deprecated (true); N at least 20, `composite` and
 * `docker` are not (false); `node17` to `node19`, a missing value and any other string are unknown.
 */
export function runtimeSignal(using: string | undefined): boolean | undefined {
  if (typeof using !== "string") return undefined;
  if (using === "composite" || using === "docker") return false;
  const m = NODE.exec(using);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (n <= 16) return true;
  if (n >= 20) return false;
  return undefined;
}
