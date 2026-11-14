import fc from "fast-check";
import type { ActionManifest } from "../../evidence/manifest.js";
import { checkContract } from "../../proof/contract-check.js";
import type { ContractCheck, ContractInput, ContractViolationKind } from "../../proof/contract-check.js";
import type { NamedProperty } from "../sabotage-runner.js";

/** The seam under test (Properties 9 and 10). */
export interface ContractImpl {
  checkContract(input: ContractInput): ContractCheck;
}
export const realContractImpl: ContractImpl = { checkContract };

/** A small alphabet, with a case pair, so overlaps are likely. */
const NAMES = ["a", "A", "b", "c", "d-1", "ünï"];
const nameArb = fc.constantFrom(...NAMES);
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

const flagsArb = fc.record({ required: fc.boolean(), hasDefault: fc.boolean() });

const randomCaseArb: fc.Arbitrary<ContractInput> = fc
  .record({
    withKeys: fc.uniqueArray(nameArb, { maxLength: 5 }),
    mapping: fc.dictionary(nameArb, fc.oneof(nameArb, fc.constant(null)), { maxKeys: 6 }),
    inputs: fc.dictionary(nameArb, flagsArb, { maxKeys: 6 }),
    outputs: fc.uniqueArray(nameArb, { maxLength: 4 }),
    outputRefs: fc.array(nameArb, { maxLength: 4 }),
  })
  .map(build);

/** Mostly consistent cases (the check passes), with a few faults mixed in by `fault`. */
const consistentCaseArb: fc.Arbitrary<ContractInput> = fc
  .record({
    mapping: fc.dictionary(nameArb, fc.oneof(nameArb, fc.constant(null)), { maxKeys: 6 }),
    pick: fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
    extra: fc.dictionary(nameArb, flagsArb, { maxKeys: 3 }),
    outputs: fc.uniqueArray(nameArb, { maxLength: 4 }),
    refPick: fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
    req: fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
  })
  .map((r) => {
    const keys = Object.keys(r.mapping).filter((_, i) => r.pick[i]);
    const targets = [...new Set(keys.map((k) => r.mapping[k]).filter((t): t is string => t !== null))];
    const inputs: Record<string, { required: boolean; hasDefault: boolean }> = {};
    // an extra input is never required without a default
    for (const [n, f] of Object.entries(r.extra)) inputs[n] = { required: f.required && f.hasDefault, hasDefault: f.hasDefault };
    targets.forEach((t, i) => {
      inputs[t] = { required: r.req[i % 6]!, hasDefault: false };
    });
    return build({
      withKeys: keys,
      mapping: r.mapping,
      inputs,
      outputs: r.outputs,
      outputRefs: r.outputs.filter((_, i) => r.refPick[i % 4]),
    });
  });

interface Raw {
  withKeys: string[];
  mapping: Record<string, string | null>;
  inputs: Record<string, { required: boolean; hasDefault: boolean }>;
  outputs: string[];
  outputRefs: string[];
}

function build(r: Raw): ContractInput {
  const withMap: Record<string, string> = {};
  r.withKeys.forEach((k, i) => {
    withMap[k] = `v${i}`;
  });
  const manifest: ActionManifest = { inputs: new Map(Object.entries(r.inputs)), outputs: new Set(r.outputs) };
  return {
    withMap,
    replacement: {
      from: "o/old",
      kind: "action",
      to: "n/new",
      toRef: "v1",
      sourceUrl: "https://github.com/o/old",
      replacementUrl: "https://github.com/n/new",
      inputs: r.mapping,
    },
    manifest,
    outputRefs: r.outputRefs,
  };
}

/** Passing and failing cases, both common. */
export const contractCaseArb: fc.Arbitrary<ContractInput> = fc.oneof(
  { weight: 3, arbitrary: consistentCaseArb },
  { weight: 2, arbitrary: randomCaseArb },
);

/** The reference: four set comprehensions. */
export function reference(i: ContractInput): {
  unmapped: string[];
  undeclared: string[];
  requiredMissing: string[];
  outputsMissing: string[];
  dropped: string[];
  renamed: string[];
  required: string[];
} {
  const inputs = i.replacement.inputs;
  const keys = Object.keys(i.withMap);
  const mappedNames = new Set(keys.filter((k) => has(inputs, k) && inputs[k] !== null).map((k) => inputs[k] as string));
  const sorted = (xs: string[]): string[] => [...new Set(xs)].sort(cmp);
  const reqNames = [...i.manifest.inputs].filter(([, f]) => f.required && !f.hasDefault).map(([n]) => n);
  return {
    unmapped: sorted(keys.filter((k) => !has(inputs, k))),
    undeclared: sorted([...mappedNames].filter((n) => !i.manifest.inputs.has(n))),
    requiredMissing: sorted(reqNames.filter((n) => !mappedNames.has(n))),
    outputsMissing: sorted(i.outputRefs.filter((o) => !i.manifest.outputs.has(o))),
    dropped: sorted(keys.filter((k) => has(inputs, k) && inputs[k] === null)),
    renamed: sorted(keys.filter((k) => has(inputs, k) && inputs[k] !== null && inputs[k] !== k)),
    required: sorted(reqNames.filter((n) => mappedNames.has(n))),
  };
}

export function referenceFirst(i: ContractInput): { kind: ContractViolationKind; name: string } | undefined {
  const r = reference(i);
  if (r.unmapped.length) return { kind: "input_unmapped", name: r.unmapped[0]! };
  if (r.undeclared.length) return { kind: "input_undeclared", name: r.undeclared[0]! };
  if (r.requiredMissing.length) return { kind: "input_required", name: r.requiredMissing[0]! };
  if (r.outputsMissing.length) return { kind: "output_missing", name: r.outputsMissing[0]! };
  return undefined;
}

const must = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

export const contractProperties: NamedProperty<ContractImpl>[] = [
  {
    name: "P9 the check is ok exactly when the reference finds no violation, and names the reference's first",
    build: (impl) =>
      fc.property(contractCaseArb, (c) => {
        const got = impl.checkContract(c);
        const want = referenceFirst(c);
        if (want === undefined) {
          must(got.ok, `expected ok, got ${JSON.stringify(got)}`);
          return;
        }
        must(!got.ok, `expected ${JSON.stringify(want)}, got ok`);
        if (!got.ok) must(got.violation.kind === want.kind && got.violation.name === want.name, `expected ${JSON.stringify(want)}, got ${JSON.stringify(got.violation)}`);
      }),
  },
  {
    name: "P9 dropped, renamed and required list exactly the dropped, renamed and supplied-required names",
    build: (impl) =>
      fc.property(consistentCaseArb, (c) => {
        if (referenceFirst(c) !== undefined) return;
        const got = impl.checkContract(c);
        must(got.ok, "expected ok");
        if (!got.ok) return;
        const r = reference(c);
        must(JSON.stringify([got.dropped, got.renamed, got.required]) === JSON.stringify([r.dropped, r.renamed, r.required]), `lists differ: ${JSON.stringify(got)} vs ${JSON.stringify(r)}`);
      }),
  },
  {
    name: "P9 a case of every violation kind is reported with the right kind",
    build: (impl) =>
      fc.property(consistentCaseArb, fc.constantFrom<ContractViolationKind>("input_unmapped", "input_undeclared", "input_required", "output_missing"), (c, kind) => {
        if (referenceFirst(c) !== undefined) return;
        let broken: ContractInput;
        if (kind === "input_unmapped") broken = { ...c, withMap: { ...c.withMap, "zz-unmapped": "x" } };
        else if (kind === "input_undeclared") {
          broken = { ...c, replacement: { ...c.replacement, inputs: { ...c.replacement.inputs, "zz-unmapped": "zz-new" } }, withMap: { ...c.withMap, "zz-unmapped": "x" } };
        } else if (kind === "input_required") {
          broken = { ...c, manifest: { ...c.manifest, inputs: new Map([...c.manifest.inputs, ["zz-required", { required: true, hasDefault: false }]]) } };
        } else broken = { ...c, outputRefs: [...c.outputRefs, "zz-out"] };
        const got = impl.checkContract(broken);
        must(!got.ok && got.violation.kind === kind, `${kind}: got ${JSON.stringify(got)}`);
      }),
  },
  {
    name: "P9 the check never throws on odd input",
    build: (impl) =>
      fc.property(contractCaseArb, fc.constantFrom("constructor", "__proto__", "toString", ""), (c, odd) => {
        const withMap = Object.defineProperty({ ...c.withMap }, odd, { value: "x", enumerable: true, configurable: true, writable: true });
        const got = impl.checkContract({ ...c, withMap });
        must(typeof got.ok === "boolean", "no result");
      }),
  },
];
