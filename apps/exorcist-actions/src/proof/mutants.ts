// The five Mutants of the sabotage check (Requirement 14.1 to 14.3) and `runSabotage`.
import type { SabotageSummary } from "@graveyard-kit/skeleton/proof";
import type { ContractInput } from "./contract-check.js";
import type { PinCheckInput } from "./pin-check.js";

export type MutantId = "wrong-sha" | "extra-line" | "drop-required-input" | "rename-output" | "add-unmapped-input";

export interface Mutant<I> {
  id: MutantId;
  applicable(input: I): boolean;
  apply(input: I): I;
}

const lines = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function pinnedSorted(input: PinCheckInput) {
  return input.pinned
    .filter((u) => u.refKind === "mutable")
    .sort((a, b) => cmp(a.file, b.file) || a.line - b.line || a.column - b.column);
}

/** Where the first written sha sits in the rewritten texts. */
function firstShaSpot(input: PinCheckInput): { file: string; lineIdx: number; at: number } | undefined {
  for (const u of pinnedSorted(input)) {
    const text = input.rewritten.get(u.file);
    if (text === undefined) continue;
    const at = u.column - 1 + u.length - u.ref.length;
    const line = lines(text)[u.line - 1];
    if (line !== undefined && /^[0-9a-f]{40}/.test(line.slice(at))) return { file: u.file, lineIdx: u.line - 1, at };
  }
  return undefined;
}

/** The first rewritten line that holds no pinned use. */
function firstPlainLine(input: PinCheckInput): { file: string; lineIdx: number } | undefined {
  const pinnedLines = new Set(input.pinned.map((u) => `${u.file}\n${u.line - 1}`));
  for (const file of [...input.rewritten.keys()].sort(cmp)) {
    const ls = lines(input.rewritten.get(file)!);
    for (let i = 0; i < ls.length; i++) if (!pinnedLines.has(`${file}\n${i}`)) return { file, lineIdx: i };
  }
  return undefined;
}

function withText(input: PinCheckInput, file: string, edit: (ls: string[]) => void): PinCheckInput {
  const ls = lines(input.rewritten.get(file)!);
  edit(ls);
  const rewritten = new Map(input.rewritten);
  rewritten.set(file, ls.join(""));
  return { ...input, rewritten };
}

export const PIN_MUTANTS: readonly Mutant<PinCheckInput>[] = [
  {
    id: "wrong-sha",
    applicable: (i) => firstShaSpot(i) !== undefined,
    apply: (i) => {
      const spot = firstShaSpot(i)!;
      return withText(i, spot.file, (ls) => {
        const l = ls[spot.lineIdx]!;
        const c = l.charAt(spot.at);
        ls[spot.lineIdx] = l.slice(0, spot.at) + (c === "0" ? "1" : "0") + l.slice(spot.at + 1);
      });
    },
  },
  {
    id: "extra-line",
    applicable: (i) => firstPlainLine(i) !== undefined,
    apply: (i) => {
      const spot = firstPlainLine(i)!;
      return withText(i, spot.file, (ls) => {
        const l = ls[spot.lineIdx]!;
        const body = l.replace(/\r?\n$/, "");
        ls[spot.lineIdx] = body + " " + l.slice(body.length);
      });
    },
  },
];

const requiredNames = (i: ContractInput): Set<string> =>
  new Set([...i.manifest.inputs].filter(([, f]) => f.required && !f.hasDefault).map(([n]) => n));

/** The first required input (UTF-16 order) that some `with` key maps to. */
function suppliedRequired(i: ContractInput): string | undefined {
  const req = requiredNames(i);
  const hit = Object.keys(i.withMap)
    .filter((k) => has(i.replacement.inputs, k))
    .map((k) => i.replacement.inputs[k])
    .filter((to): to is string => typeof to === "string" && req.has(to))
    .sort(cmp);
  return hit[0];
}

export const CONTRACT_MUTANTS: readonly Mutant<ContractInput>[] = [
  {
    id: "drop-required-input",
    applicable: (i) => suppliedRequired(i) !== undefined,
    apply: (i) => {
      const name = suppliedRequired(i)!;
      const withMap: Record<string, string> = {};
      for (const [k, v] of Object.entries(i.withMap)) if (i.replacement.inputs[k] !== name) withMap[k] = v;
      return { ...i, withMap };
    },
  },
  {
    id: "rename-output",
    applicable: (i) => i.outputRefs.length > 0 && !i.manifest.outputs.has(i.outputRefs[0]! + "_x"),
    apply: (i) => ({ ...i, outputRefs: [i.outputRefs[0]! + "_x", ...i.outputRefs.slice(1)] }),
  },
  {
    id: "add-unmapped-input",
    applicable: () => true,
    apply: (i) => ({ ...i, withMap: { ...i.withMap, __unmapped__: "x" } }),
  },
];

/**
 * Feeds every applicable Mutant to `check` (true = the check accepted the input). A Mutant is caught only
 * when the check rejects it; a check that throws does not count as a rejection.
 */
export function runSabotage<I>(
  shape: string,
  input: I,
  check: (i: I) => boolean,
  mutants: readonly Mutant<I>[],
): SabotageSummary {
  let applied = 0;
  let caught = 0;
  const survivors: string[] = [];
  for (const m of mutants) {
    let applicable = false;
    try {
      applicable = m.applicable(input);
    } catch {
      applicable = false;
    }
    if (!applicable) continue;
    applied++;
    let accepted = true;
    try {
      accepted = check(m.apply(input));
    } catch {
      accepted = true;
    }
    if (accepted) survivors.push(`${shape}:${m.id}`);
    else caught++;
  }
  return { applied, caught, survivors };
}

/** A counterexample or error attempt never runs the Mutants: `{ 0, 0, [] }` (Requirement 14.3). */
export function sabotageFor(status: "proved" | "counterexample" | "no-call-sites" | "error", run: () => SabotageSummary): SabotageSummary {
  return status === "proved" ? run() : { applied: 0, caught: 0, survivors: [] };
}
