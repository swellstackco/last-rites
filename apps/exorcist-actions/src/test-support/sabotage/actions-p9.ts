import { checkContract } from "../../proof/contract-check.js";
import type { ContractCheck, ContractInput, ContractViolationKind } from "../../proof/contract-check.js";
import type { ContractImpl } from "../properties/actions-p9.js";
import type { Sabotage } from "../sabotage-runner.js";

const wrap = (f: (i: ContractInput) => ContractCheck): ContractImpl => ({ checkContract: f });
const withInputs = (i: ContractInput, inputs: Record<string, string | null>): ContractInput => ({ ...i, replacement: { ...i.replacement, inputs } });
const mapManifest = (i: ContractInput, f: (m: ContractInput["manifest"]) => ContractInput["manifest"]): ContractInput => ({ ...i, manifest: f(i.manifest) });

/** (a) a dropped input counts as unmapped. */
const droppedAsUnmapped = (i: ContractInput): ContractCheck =>
  checkContract(withInputs(i, Object.fromEntries(Object.entries(i.replacement.inputs).filter(([, v]) => v !== null))));

/** (b) no input is required. */
const skipRequired = (i: ContractInput): ContractCheck =>
  checkContract(mapManifest(i, (m) => ({ ...m, inputs: new Map([...m.inputs].map(([n, f]) => [n, { ...f, required: false }])) })));

/** (c) a required input with a default is still required. */
const defaultIgnored = (i: ContractInput): ContractCheck =>
  checkContract(mapManifest(i, (m) => ({ ...m, inputs: new Map([...m.inputs].map(([n, f]) => [n, { ...f, hasDefault: false }])) })));

/** (d) the outputs are checked against the inputs. */
const outputsAsInputs = (i: ContractInput): ContractCheck => checkContract(mapManifest(i, (m) => ({ ...m, outputs: new Set(m.inputs.keys()) })));

/** (e) an unmapped input passes (it is taken as kept under its own name). */
const passUnmapped = (i: ContractInput): ContractCheck =>
  checkContract(withInputs(i, { ...Object.fromEntries(Object.keys(i.withMap).map((k) => [k, k])), ...i.replacement.inputs }));

/** (f) names compare case-insensitively. */
const caseInsensitive = (i: ContractInput): ContractCheck =>
  checkContract(
    mapManifest(i, (m) => ({
      inputs: new Map([...m.inputs].map(([n, f]) => [n.toLowerCase(), f])),
      outputs: new Set([...m.outputs].map((o) => o.toLowerCase())),
      ...(m.using !== undefined ? { using: m.using } : {}),
    })),
  );

/** (g) output_missing is skipped when more than one output is referenced. */
const skipManyOutputs = (i: ContractInput): ContractCheck => checkContract(i.outputRefs.length > 1 ? { ...i, outputRefs: [] } : i);

/** (h) the last violation instead of the first (a compact reimplementation). */
const lastViolation = (i: ContractInput): ContractCheck => {
  const inputs = i.replacement.inputs;
  const has = (k: string): boolean => Object.prototype.hasOwnProperty.call(inputs, k);
  const keys = Object.keys(i.withMap);
  const mapped = new Set(keys.filter((k) => has(k) && inputs[k] !== null).map((k) => inputs[k] as string));
  const groups: [ContractViolationKind, string[]][] = [
    ["input_unmapped", keys.filter((k) => !has(k))],
    ["input_undeclared", [...mapped].filter((n) => !i.manifest.inputs.has(n))],
    ["input_required", [...i.manifest.inputs].filter(([n, f]) => f.required && !f.hasDefault && !mapped.has(n)).map(([n]) => n)],
    ["output_missing", i.outputRefs.filter((o) => !i.manifest.outputs.has(o))],
  ];
  const real = checkContract(i);
  if (real.ok) return real;
  for (const [kind, names] of [...groups].reverse()) {
    if (names.length > 0) return { ok: false, runs: real.runs, violation: { kind, name: [...names].sort().at(-1)! } };
  }
  return real;
};

export const sabotages: Sabotage<ContractImpl>[] = [
  { name: "(a) treat a dropped input as unmapped", impl: wrap(droppedAsUnmapped) },
  { name: "(b) skip the required-input check", impl: wrap(skipRequired) },
  { name: "(c) treat a required input with a default as missing", impl: wrap(defaultIgnored) },
  { name: "(d) check outputs against the inputs", impl: wrap(outputsAsInputs) },
  { name: "(e) pass unmapped inputs", impl: wrap(passUnmapped) },
  { name: "(f) compare names case-insensitively", impl: wrap(caseInsensitive) },
  { name: "(g) skip output_missing when there is more than one reference", impl: wrap(skipManyOutputs) },
  { name: "(h) report the last violation instead of the first", impl: wrap(lastViolation) },
];
