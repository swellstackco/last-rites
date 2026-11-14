// runExorcise (Requirement 15): select the uses of one action, build the rewrite, prove it, record the
// attempt and, only for a solid proof and with --write, edit the workflow files. Never rejects. The only
// writes are `reports.writeAtomic` of changed Workflow_Files and of the --out report. No process, no git.
import { appendAttempt, parseProofReport, serializeProofReport } from "@last-rites/skeleton/proof";
import type { ProofAttempt, ProofReport, SabotageSummary } from "@last-rites/skeleton/proof";
import type { Outcome, ReportFs, SourceFs } from "@last-rites/exorcist-npm/programmatic";
import type { ActionManifest } from "../evidence/manifest.js";
import { inventoryWorkflows } from "../inventory/inventory.js";
import type { ActionUse } from "../inventory/types.js";
import {
  buildContractAttempt,
  buildErrorAttempt,
  buildPinAttempt,
  buildProofReport,
  checkContract,
  checkPin,
  CONTRACT_MUTANTS,
  PIN_MUTANTS,
  runSabotage,
  sabotageFor,
} from "../proof/index.js";
import type { ContractCheck, ContractInput, Mutant, NewAttempt, PinCheckInput } from "../proof/index.js";
import { findReplacement } from "../replacements.js";
import type { ActionReplacement } from "../replacements.js";
import { pinAll, swapUse } from "../rewrite/index.js";
import type { ExorciseArgs } from "./cli-args.js";

export interface ExorciseDeps {
  fs: SourceFs;
  reports: ReportFs;
  evidence: {
    resolveCommit(owner: string, repo: string, ref: string): Promise<Outcome<string>>;
    fetchManifest(name: string, ref: string): Promise<Outcome<ActionManifest>>;
  };
  print(line: string): void;
  /** Test seam: the Mutants of the sabotage check. Defaults to the five of the design. */
  mutants?: { pin?: readonly Mutant<PinCheckInput>[]; contract?: readonly Mutant<ContractInput>[] };
}

export type ExorciseOutcome = { exit: 0 | 1; attempt?: ProofAttempt; written: string[] };

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const keyOf = (u: ActionUse): string => `${u.owner}/${u.repo}@${u.ref}`;
const join = (root: string, file: string): string => `${root.replace(/\/+$/, "")}/${file}`;
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : "unknown error");

/** Runs one exorcise; the exit code is 0 when an attempt was produced (and written when --write), else 1. */
export async function runExorcise(args: ExorciseArgs, deps: ExorciseDeps): Promise<ExorciseOutcome> {
  const written: string[] = [];
  const stop = (line: string): ExorciseOutcome => {
    safePrint(deps, line);
    return { exit: 1, written };
  };
  try {
    return await run(args, deps, written, stop);
  } catch (e) {
    return stop(`failed: ${messageOf(e)}`);
  }
}

function safePrint(deps: ExorciseDeps, line: string): void {
  try {
    deps.print(line);
  } catch {
    // a failing printer must not turn into a rejection
  }
}

async function run(
  args: ExorciseArgs,
  deps: ExorciseDeps,
  written: string[],
  stop: (line: string) => ExorciseOutcome,
): Promise<ExorciseOutcome> {
  const root = args.repo;
  const inventory = await inventoryWorkflows(deps.fs, root);
  const wanted = args.action.toLowerCase();
  const selected = inventory.uses.filter((u) => `${u.owner}/${u.repo}`.toLowerCase() === wanted);
  if (selected.length === 0) return stop(`no uses of ${args.action}`);

  let replacement: ActionReplacement | undefined;
  if (args.fix === "pin") {
    if (!selected.some((u) => u.refKind === "mutable")) return stop("nothing to pin");
  } else {
    const r = findReplacement(args.action);
    if (r === undefined || r.kind !== "action") return stop(`no swap available for ${args.action}`);
    replacement = r;
  }

  // The texts of the files that hold a selected use.
  const originals = new Map<string, string>();
  for (const file of [...new Set(selected.map((u) => u.file))].sort(cmp)) {
    const text = await deps.fs.readText(join(root, file));
    if (text === undefined) return stop(`could not read ${file}`);
    originals.set(file, text);
  }
  const byFile = (uses: readonly ActionUse[], file: string): ActionUse[] => uses.filter((u) => u.file === file);

  let attempt: NewAttempt;
  const rewritten = new Map<string, string>();

  if (args.fix === "pin") {
    const pinned = selected.filter((u) => u.refKind === "mutable");
    const resolved = new Map<string, string>();
    let failure: string | undefined;
    for (const u of pinned) {
      const key = keyOf(u);
      if (resolved.has(key) || failure !== undefined) continue;
      const res = await deps.evidence.resolveCommit(u.owner, u.repo, u.ref);
      if (res.ok) resolved.set(key, res.value);
      else failure = `resolve ${key}: ${res.reason.category}`;
    }
    if (failure !== undefined) {
      attempt = buildErrorAttempt("pin", failure);
    } else {
      for (const [file, text] of originals) {
        const r = pinAll(text, byFile(pinned, file), resolved);
        if (!r.ok) return stop(`refused: ${r.reason}${r.detail !== undefined ? ` (${r.detail})` : ""}`);
        rewritten.set(file, r.text);
      }
      const input: PinCheckInput = { originals, rewritten, pinned, resolved };
      const check = checkPin(input);
      const sabotage = sabotageFor(check.ok ? "proved" : "counterexample", () =>
        runSabotage("pin", input, (i) => checkPin(i).ok, deps.mutants?.pin ?? PIN_MUTANTS),
      );
      attempt = buildPinAttempt({ actionName: args.action, originals, rewritten, check, pinned, sabotage });
    }
  } else {
    const rep = replacement!;
    const res = await deps.evidence.fetchManifest(rep.to, rep.toRef);
    if (!res.ok) {
      attempt = buildErrorAttempt("contract", `manifest ${rep.to}@${rep.toRef}: ${res.reason.category}`);
    } else {
      const manifest = res.value;
      const results: { use: ActionUse; check: ContractCheck }[] = [];
      const inputs: ContractInput[] = [];
      for (const [file, text] of originals) {
        let current = text;
        for (const use of [...byFile(selected, file)].sort((a, b) => b.offset - a.offset)) {
          const r = swapUse(current, use, rep);
          if (!r.ok) return stop(`refused: ${r.reason}${r.detail !== undefined ? ` (${r.detail})` : ""}`);
          current = r.text;
        }
        rewritten.set(file, current);
      }
      for (const use of selected) {
        const input: ContractInput = { withMap: use.with, replacement: rep, manifest, outputRefs: use.outputRefs };
        inputs.push(input);
        results.push({ use, check: checkContract(input) });
      }
      const ok = results.every((r) => r.check.ok);
      const sabotage = sabotageFor(ok ? "proved" : "counterexample", () => {
        const total: SabotageSummary = { applied: 0, caught: 0, survivors: [] };
        for (const input of inputs) {
          const s = runSabotage("contract", input, (i) => checkContract(i).ok, deps.mutants?.contract ?? CONTRACT_MUTANTS);
          total.applied += s.applied;
          total.caught += s.caught;
          for (const v of s.survivors) if (!total.survivors.includes(v)) total.survivors.push(v);
        }
        return total;
      });
      attempt = buildContractAttempt({ actionName: args.action, originals, rewritten, results, sabotage });
    }
  }

  // The report (Requirement 15.6): decided before anything is written.
  let report: ProofReport | undefined;
  if (args.out !== undefined) {
    const header = buildProofReport(args.label, args.commit, args.action, inventory.filesRead, selected);
    let existing: string | undefined;
    try {
      existing = await deps.reports.readText(args.out);
    } catch (e) {
      return stop(`could not read ${args.out}: ${messageOf(e)}`);
    }
    report = header;
    if (existing !== undefined && !args.fresh) {
      const parsed = parseProofReport(existing);
      if (!parsed.ok) {
        return stop(`${args.out} is not a valid proof report (${parsed.error.message}); pass --fresh to start over`);
      }
      const same =
        serializeProofReport({ ...parsed.report, attempts: [] }) === serializeProofReport({ ...header, attempts: [] });
      if (!same) return stop(`${args.out} describes a different action or call sites; pass --fresh to start over`);
      report = parsed.report;
    }
    report = appendAttempt(report, attempt);
  }
  const final: ProofAttempt = report !== undefined ? report.attempts[report.attempts.length - 1]! : { ...attempt, attempt: 1 };

  // What the user sees.
  const changed = [...rewritten].filter(([f, t]) => t !== originals.get(f)).sort(([a], [b]) => cmp(a, b));
  if (attempt.candidate !== undefined && attempt.candidate.source !== "") {
    for (const line of attempt.candidate.source.split("\n")) deps.print(line);
  }
  deps.print(
    `status: ${final.status}${final.weak ? " (weak)" : ""}, sabotage ${final.sabotage.caught} of ${final.sabotage.applied} caught`,
  );
  if (final.sabotage.survivors.length > 0) deps.print(`survivors: ${final.sabotage.survivors.join(", ")}`);
  const c = final.counterexample;
  if (c !== undefined) deps.print(`counterexample (${c.shape}/${c.path}): ${c.input}`);
  if (final.error !== undefined) deps.print(`error ${final.error.code}: ${final.error.message}`);

  if (report !== undefined && args.out !== undefined) {
    try {
      await deps.reports.writeAtomic(args.out, serializeProofReport(report));
      written.push(args.out);
    } catch (e) {
      return stop(`could not write ${args.out}: ${messageOf(e)}`);
    }
  }

  if (args.write) {
    if (final.status !== "proved" || final.weak) {
      deps.print(`not written: ${final.weak ? "weak" : final.status}`);
      return { exit: 1, attempt: final, written };
    }
    for (const [file, text] of changed) {
      const path = join(root, file);
      try {
        await deps.reports.writeAtomic(path, text);
        written.push(path);
      } catch (e) {
        deps.print(`could not write ${path}: ${messageOf(e)}`);
        return { exit: 1, attempt: final, written };
      }
    }
  }
  return { exit: 0, attempt: final, written };
}
