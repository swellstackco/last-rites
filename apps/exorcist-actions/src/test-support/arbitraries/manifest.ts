// Generated `action.yml` texts with their model (Property 6). Scalars are rendered with JSON.stringify
// (a valid YAML double-quoted scalar) so no generated name or value can change the structure.
import fc from "fast-check";

export type RequiredSpec = undefined | boolean | "true" | "false" | "yes";
export type DefaultSpec = undefined | null | string | number | boolean;

export interface InputSpec {
  name: string;
  required: RequiredSpec;
  default: DefaultSpec;
  description: boolean;
}

export interface ManifestSpec {
  inputs: InputSpec[];
  outputs: string[];
  using: string | undefined;
  /** `inputs: {}` / `outputs: {}` written even when empty. */
  explicitEmpty: boolean;
  decoyRunsOutputs: string[];
  comments: boolean;
  /** Order of the top-level sections. */
  order: string[];
}

export interface ManifestModel {
  inputs: Map<string, { required: boolean; hasDefault: boolean }>;
  outputs: Set<string>;
  using: string | undefined;
}

const NAMES = ["token", "toolchain", "profile", "Key-2", "a.b", "ünï", "x_9", "with-dash", "k1", "日本", "default", "required"];
const OUTPUTS = ["version", "cache-hit", "o1", "Result", "ünï-out"];

export const usingValueArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: 0, max: 40 }).map((n) => `node${n}`) },
  { weight: 3, arbitrary: fc.constantFrom("composite", "docker") },
  { weight: 3, arbitrary: fc.constantFrom("", "node", "node20x", "Node20", "javascript", "node-20", "node016", "python3", "nodejs") },
);

const requiredArb: fc.Arbitrary<RequiredSpec> = fc.constantFrom<RequiredSpec[]>(undefined, true, false, "true", "false", "yes");
const defaultArb: fc.Arbitrary<DefaultSpec> = fc.constantFrom<DefaultSpec[]>(undefined, null, "", "x", "stable", 0, 42, false, true);

const inputArb: fc.Arbitrary<InputSpec> = fc.record({
  name: fc.constantFrom(...NAMES),
  required: requiredArb,
  default: defaultArb,
  description: fc.boolean(),
});

const SECTIONS = ["name", "description", "inputs", "outputs", "runs", "branding"];

export const manifestSpecArb: fc.Arbitrary<ManifestSpec> = fc.record({
  inputs: fc.uniqueArray(inputArb, { maxLength: 6, selector: (i) => i.name }),
  outputs: fc.uniqueArray(fc.constantFrom(...OUTPUTS), { maxLength: 4 }),
  using: fc.option(usingValueArb, { nil: undefined }),
  explicitEmpty: fc.boolean(),
  decoyRunsOutputs: fc.uniqueArray(fc.constantFrom("decoy-a", "decoy-b"), { maxLength: 2 }),
  comments: fc.boolean(),
  order: fc.shuffledSubarray(SECTIONS, { minLength: SECTIONS.length, maxLength: SECTIONS.length }),
});

const q = (s: string): string => JSON.stringify(s);
const scalar = (v: string | number | boolean | null): string => (typeof v === "string" ? q(v) : String(v));

export function renderManifest(spec: ManifestSpec): string {
  const c = (text: string): string => (spec.comments ? `${text} # ünï 日本 note\n` : `${text}\n`);
  const sections: Record<string, string> = {
    name: c(`name: ${q("An action")}`),
    description: c(`description: ${q("Does a thing: with a colon")}`),
    inputs:
      spec.inputs.length === 0
        ? spec.explicitEmpty
          ? c("inputs: {}")
          : ""
        : c("inputs:") +
          spec.inputs
            .map((i) => {
              const lines = [`  ${q(i.name)}:`];
              if (i.description) lines.push(`    description: ${q("d")}`);
              if (i.required !== undefined) lines.push(`    required: ${scalar(i.required)}`);
              if (i.default !== undefined) lines.push(`    default: ${i.default === null ? "null" : scalar(i.default)}`);
              if (lines.length === 1) lines.push("    {}");
              return lines.join("\n") + "\n";
            })
            .join(""),
    outputs:
      spec.outputs.length === 0
        ? spec.explicitEmpty
          ? c("outputs: {}")
          : ""
        : c("outputs:") + spec.outputs.map((o) => `  ${q(o)}:\n    description: ${q("o")}\n`).join(""),
    runs:
      "runs:\n" +
      (spec.using !== undefined ? `  using: ${q(spec.using)}\n` : "") +
      (spec.decoyRunsOutputs.length > 0
        ? "  outputs:\n" + spec.decoyRunsOutputs.map((o) => `    ${q(o)}:\n      value: x\n`).join("")
        : "") +
      `  main: ${q("index.js")}\n`,
    branding: "branding:\n  icon: box\n",
  };
  return spec.order.map((k) => sections[k] ?? "").join("");
}

export function modelOf(spec: ManifestSpec): ManifestModel {
  const inputs = new Map<string, { required: boolean; hasDefault: boolean }>();
  for (const i of spec.inputs) {
    inputs.set(i.name, {
      required: i.required === true || i.required === "true",
      hasDefault: i.default !== undefined && i.default !== null,
    });
  }
  return { inputs, outputs: new Set(spec.outputs), using: spec.using };
}

export const manifestArb: fc.Arbitrary<{ text: string; model: ManifestModel }> = manifestSpecArb.map((spec) => ({
  text: renderManifest(spec),
  model: modelOf(spec),
}));

/** Texts that are not a YAML mapping (or not YAML at all). */
export const nonMappingArb: fc.Arbitrary<string> = fc.constantFrom(
  "",
  "scalar",
  "42",
  "null",
  "- a\n- b\n",
  "# only a comment\n",
  "a: [unclosed",
  "a: b: c\n",
  "key: 'unterminated\n",
  "[1, 2",
  "{",
);
