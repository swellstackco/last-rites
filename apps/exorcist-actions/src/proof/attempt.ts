// Maps check results and sabotage summaries to the existing ProofAttempt / ProofReport (Requirement 14.4 to 14.6).
import type { CallSite, CounterexampleRecord, ProofAttempt, ProofReport, SabotageSummary } from "@graveyard-kit/skeleton/proof";
import { sortSites } from "@graveyard-kit/skeleton/proof";
import type { ActionUse } from "../inventory/types.js";
import { formatUses } from "../inventory/uses.js";
import type { ContractCheck, ContractViolationKind } from "./contract-check.js";
import { actionProofName } from "./names.js";
import type { PinCheck } from "./pin-check.js";

export type NewAttempt = Omit<ProofAttempt, "attempt">;

const NO_SABOTAGE: SabotageSummary = { applied: 0, caught: 0, survivors: [] };
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const keyOf = (u: ActionUse): string => `${u.owner}/${u.repo}@${u.ref}`;
const dash = (s: string): string => (s === "" ? "-" : s);
const splitLines = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
const body = (l: string): string => l.replace(/\r?\n$/, "");

/** `weak` rule of `parseProofReport`: proved, and (nothing applied or a Mutant survived). */
export const isWeak = (status: ProofAttempt["status"], s: SabotageSummary): boolean =>
  status === "proved" && (s.applied === 0 || s.survivors.length > 0);

// ------------------------------------------------------------------ call sites

const cut = (s: string): string => {
  const c = s.replace(/\s+/g, " ").trim();
  return c.length > 200 ? c.slice(0, 200) + "…" : c;
};

/** One CallSite per use (Requirement 14.6). */
export function callSitesOf(uses: readonly ActionUse[]): CallSite[] {
  return sortSites(
    uses.map((u): CallSite => {
      const names = u.withKeys.length > 0 ? u.withKeys.map((k) => k.name) : Object.keys(u.with);
      return {
        file: u.file,
        line: u.line,
        column: u.column,
        callee: formatUses(u),
        member: "",
        argCount: Object.keys(u.with).length,
        argTexts: names.map((n) => cut(`${n}: ${u.with[n] ?? ""}`)),
        enclosing: "src",
      };
    }),
  );
}

/** The empty report for one action: `package` is the Action_Proof_Name, `repo` the label. */
export function buildProofReport(
  label: string,
  commit: string | undefined,
  actionName: string,
  filesRead: number,
  uses: readonly ActionUse[],
): ProofReport {
  return {
    repo: label,
    ...(commit !== undefined ? { commit } : {}),
    package: actionProofName(actionName),
    filesScanned: filesRead,
    callSites: callSitesOf(uses),
    importSites: [],
    attempts: [],
  };
}

// ------------------------------------------------------------------ the changed lines

/** `- old` / `+ new` lines, in file order. Common head and tail are trimmed; the middle is an LCS diff. */
export function changedLines(originals: ReadonlyMap<string, string>, rewritten: ReadonlyMap<string, string>): string {
  const out: string[] = [];
  for (const file of [...new Set([...originals.keys(), ...rewritten.keys()])].sort(cmp)) {
    const a = splitLines(originals.get(file) ?? "").map(body);
    const b = splitLines(rewritten.get(file) ?? "").map(body);
    let head = 0;
    while (head < a.length && head < b.length && a[head] === b[head]) head++;
    let tail = 0;
    while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
    out.push(...diffMiddle(a.slice(head, a.length - tail), b.slice(head, b.length - tail)));
  }
  return out.join("\n");
}

function diffMiddle(a: string[], b: string[]): string[] {
  if (a.length * b.length > 4_000_000) return [...a.map((l) => `- ${l}`), ...b.map((l) => `+ ${l}`)];
  const w = b.length + 1;
  const t = new Uint32Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      t[i * w + j] = a[i] === b[j] ? t[(i + 1) * w + j + 1]! + 1 : Math.max(t[(i + 1) * w + j]!, t[i * w + j + 1]!);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i++;
      j++;
    } else if (i < a.length && (j >= b.length || t[(i + 1) * w + j]! >= t[i * w + j + 1]!)) out.push(`- ${a[i++]}`);
    else out.push(`+ ${b[j++]}`);
  }
  return out;
}

// ------------------------------------------------------------------ attempts

export interface Texts {
  originals: ReadonlyMap<string, string>;
  rewritten: ReadonlyMap<string, string>;
}

export interface PinAttemptInput extends Texts {
  actionName: string;
  check: PinCheck;
  /** The uses that were pinned. */
  pinned: readonly ActionUse[];
  sabotage: SabotageSummary;
}

export function buildPinAttempt(i: PinAttemptInput): NewAttempt {
  const candidate = { name: `pin-${actionProofName(i.actionName)}`, source: changedLines(i.originals, i.rewritten) };
  const files = new Set(i.pinned.map((u) => u.file)).size;
  if (i.check.ok) {
    return {
      candidate,
      status: "proved",
      weak: isWeak("proved", i.sabotage),
      numRuns: i.check.runs,
      runs: i.check.runs,
      seed: 0,
      shapes: [{ id: "pin", status: "passed", runs: i.check.runs, coverage: { files, uses: i.pinned.length } }],
      sabotage: i.sabotage,
    };
  }
  const v = i.check.violation;
  const use = i.pinned.find((u) => u.file === v.file && u.line === v.line);
  const counterexample: CounterexampleRecord = {
    shape: "pin",
    input: `${v.file}:${v.line} ${use ? keyOf(use) : "-"}`,
    shrinks: 0,
    path: v.kind,
    oldOutput: v.kind === "bytes" ? dash(body(v.original)) : "-",
    newOutput: v.kind === "bytes" ? dash(body(v.rewritten)) : "-",
    oldProjected: v.kind === "sha" ? dash(v.resolved) : "-",
    newProjected: v.kind === "sha" ? dash(v.written) : "-",
  };
  return {
    candidate,
    status: "counterexample",
    weak: false,
    numRuns: i.check.runs,
    runs: i.check.runs,
    seed: 0,
    shapes: [{ id: "pin", status: "failed", runs: i.check.runs, coverage: { files, uses: i.pinned.length } }],
    counterexample,
    sabotage: NO_SABOTAGE,
  };
}

export interface ContractAttemptInput extends Texts {
  actionName: string;
  /** One check per swapped use, in inventory order. */
  results: readonly { use: ActionUse; check: ContractCheck }[];
  sabotage: SabotageSummary;
}

const EXPECTED: Record<ContractViolationKind, string> = {
  input_unmapped: "mapped",
  input_undeclared: "declared",
  input_required: "supplied",
  output_missing: "declared",
};

export function buildContractAttempt(i: ContractAttemptInput): NewAttempt {
  const candidate = { name: `swap-${actionProofName(i.actionName)}`, source: changedLines(i.originals, i.rewritten) };
  const runs = i.results.reduce((n, r) => n + r.check.runs, 0);
  const coverage: Record<string, number> = { uses: i.results.length };
  const bump = (k: string): void => {
    coverage[k] = (coverage[k] ?? 0) + 1;
  };
  for (const r of i.results) {
    if (!r.check.ok) continue;
    r.check.dropped.forEach((n) => bump(`dropped.${n}`));
    r.check.renamed.forEach((n) => bump(`renamed.${n}`));
    r.check.required.forEach((n) => bump(`required.${n}`));
  }
  const failing = i.results.find((r) => !r.check.ok);
  if (failing === undefined || failing.check.ok) {
    return {
      candidate,
      status: "proved",
      weak: isWeak("proved", i.sabotage),
      numRuns: runs,
      runs,
      seed: 0,
      shapes: [{ id: "contract", status: "passed", runs, coverage }],
      sabotage: i.sabotage,
    };
  }
  const v = failing.check.violation;
  return {
    candidate,
    status: "counterexample",
    weak: false,
    numRuns: runs,
    runs,
    seed: 0,
    shapes: [{ id: "contract", status: "failed", runs, coverage }],
    counterexample: {
      shape: "contract",
      input: `${failing.use.file}:${failing.use.line} ${v.name}`,
      shrinks: 0,
      path: v.kind,
      oldOutput: "-",
      newOutput: "-",
      oldProjected: EXPECTED[v.kind],
      newProjected: "missing",
    },
    sabotage: NO_SABOTAGE,
  };
}

/** An unavailable source: `error` with `recipe_failure`, never proved. */
export function buildErrorAttempt(shape: "pin" | "contract", message: string): NewAttempt {
  return {
    status: "error",
    weak: false,
    numRuns: 0,
    runs: 0,
    seed: 0,
    shapes: [{ id: shape, status: "error", runs: 0, coverage: {} }],
    error: { code: "recipe_failure", message },
    sabotage: NO_SABOTAGE,
  };
}
