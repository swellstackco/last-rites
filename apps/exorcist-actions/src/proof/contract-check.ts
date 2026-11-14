// The swap contract check (Requirement 13). Pure and total.
import type { ActionManifest } from "../evidence/manifest.js";
import type { ActionReplacement } from "../replacements.js";

export type ContractViolationKind = "input_unmapped" | "input_undeclared" | "input_required" | "output_missing";
export interface ContractViolation {
  kind: ContractViolationKind;
  name: string;
}

export interface ContractInput {
  withMap: Readonly<Record<string, string>>;
  replacement: ActionReplacement;
  manifest: ActionManifest;
  outputRefs: readonly string[];
}

export type ContractCheck =
  | { ok: true; runs: number; dropped: string[]; renamed: string[]; required: string[] }
  | { ok: false; runs: number; violation: ContractViolation };

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Four groups are evaluated per use. */
export const CONTRACT_RUNS = 4;

/**
 * Passes iff there is no unmapped old input, no mapped name the replacement does not declare, no required
 * input without default that the mapped `with` leaves out, and no referenced output the replacement lacks.
 * The first violation is chosen by kind in that order, then by name in UTF-16 order.
 */
export function checkContract(input: ContractInput): ContractCheck {
  const inputs: Readonly<Record<string, string | null>> = input.replacement?.inputs ?? {};
  const keys = Object.keys(input.withMap ?? {});
  const unmapped: string[] = [];
  const undeclared: string[] = [];
  const dropped: string[] = [];
  const renamed: string[] = [];
  const supplied = new Set<string>();
  for (const k of keys) {
    if (!has(inputs, k)) {
      unmapped.push(k);
      continue;
    }
    const to = inputs[k];
    if (to === null || to === undefined) {
      dropped.push(k);
      continue;
    }
    supplied.add(to);
    if (to !== k) renamed.push(k);
    if (!input.manifest.inputs.has(to)) undeclared.push(to);
  }
  const requiredMissing: string[] = [];
  const required: string[] = [];
  for (const [name, flags] of input.manifest.inputs) {
    if (!flags.required || flags.hasDefault) continue;
    (supplied.has(name) ? required : requiredMissing).push(name);
  }
  const outputsMissing = [...new Set(input.outputRefs)].filter((o) => !input.manifest.outputs.has(o));

  const groups: [ContractViolationKind, string[]][] = [
    ["input_unmapped", unmapped],
    ["input_undeclared", undeclared],
    ["input_required", requiredMissing],
    ["output_missing", outputsMissing],
  ];
  for (const [kind, names] of groups) {
    if (names.length > 0) return { ok: false, runs: CONTRACT_RUNS, violation: { kind, name: [...names].sort(cmp)[0]! } };
  }
  return { ok: true, runs: CONTRACT_RUNS, dropped: dropped.sort(cmp), renamed: renamed.sort(cmp), required: required.sort(cmp) };
}
