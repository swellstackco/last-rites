// Requirements 10.3-10.9: the orchestration of one proof run. Everything it touches is injected; it never throws.
import {
  appendAttempt,
  parseProofReport,
  proofReportPath,
  serializeProofReport,
  type ProofAttempt,
  type ProofReport,
  type UsageSurface,
  type UsageSurfaceResult,
} from "@last-rites/skeleton/proof";
import { runProof, type ProofInput, type ProofResult } from "@last-rites/skeleton/proof/runner";
import { basename, join } from "node:path";
import type { CliArgs } from "./cli-args.js";
import type { AppRecipe } from "./recipes/types.js";
import type { ReportFs } from "./report-store.js";

export interface ExorciseDeps {
  usageSurface: UsageSurface;
  fs: ReportFs;
  recipes: ReadonlyMap<string, AppRecipe>;
  loadOracle(pkg: string): { module: unknown; version: string } | undefined;
  loadCandidate(file: string): Promise<{ module: unknown; name: string; source: string }>;
  /** For the default --out. */
  repoRoot: string;
  print(line: string): void;
}

export type ExorciseOutcome =
  | { exit: 0; attempt: ProofAttempt; path: string }
  | { exit: 1 | 2; message: string };

const MAX_WARNINGS = 10;

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function toAttempt(result: ProofResult, candidate: { name: string; source: string } | undefined): Omit<ProofAttempt, "attempt"> {
  const attempt: Omit<ProofAttempt, "attempt"> = {
    status: result.status,
    weak: result.weak,
    numRuns: result.numRuns,
    runs: result.runs,
    seed: result.seed,
    shapes: result.shapes,
    sabotage: result.sabotage,
  };
  if (candidate) attempt.candidate = { name: candidate.name, source: candidate.source };
  if (result.counterexample) {
    attempt.counterexample = {
      shape: result.counterexample.shape,
      input: result.counterexample.input,
      shrinks: result.counterexample.shrinks,
      path: result.counterexample.path,
      oldOutput: result.oldOutput ?? "",
      newOutput: result.newOutput ?? "",
      oldProjected: result.oldProjected ?? "",
      newProjected: result.newProjected ?? "",
    };
  }
  if (result.recommendation) attempt.recommendation = result.recommendation;
  if (result.error) attempt.error = result.error;
  return attempt;
}

function headerOf(args: CliArgs, usage: UsageSurfaceResult, oracleVersion: string | undefined): ProofReport {
  const report: ProofReport = {
    repo: args.label ?? basename(args.repo),
    package: args.package,
    filesScanned: usage.filesScanned,
    callSites: usage.callSites,
    importSites: usage.importSites,
    attempts: [],
  };
  if (args.commit !== undefined) report.commit = args.commit;
  if (oracleVersion !== undefined) report.oracleVersion = oracleVersion;
  return report;
}

const sameHeader = (a: ProofReport, b: ProofReport): boolean =>
  serializeProofReport({ ...a, attempts: [] }) === serializeProofReport({ ...b, attempts: [] });

function summaryLines(pkg: string, attempt: ProofAttempt): string[] {
  const lines = [
    `${pkg}: attempt ${attempt.attempt}, ${attempt.status}${attempt.weak ? " (weak)" : ""}, ` +
      `${attempt.runs} runs, seed ${attempt.seed}`,
  ];
  const c = attempt.counterexample;
  if (c) {
    lines.push(`  shape ${c.shape}, shrunk input: ${c.input}`, `  old output: ${c.oldOutput}`, `  new output: ${c.newOutput}`);
  }
  if (attempt.error) lines.push(`  error ${attempt.error.code}: ${attempt.error.message}`);
  if (attempt.recommendation) lines.push(`  recommendation: ${attempt.recommendation}`);
  if (attempt.status === "proved") {
    lines.push(`  sabotage: ${attempt.sabotage.caught} of ${attempt.sabotage.applied} mutants caught`);
    if (attempt.sabotage.survivors.length > 0) lines.push(`  survivors: ${attempt.sabotage.survivors.join(", ")}`);
  }
  return lines;
}

export async function exorcise(deps: ExorciseDeps, args: CliArgs): Promise<ExorciseOutcome> {
  try {
    return await run(deps, args);
  } catch (e) {
    return { exit: 1, message: `unexpected failure: ${messageOf(e)}` };
  }
}

async function run(deps: ExorciseDeps, args: CliArgs): Promise<ExorciseOutcome> {
  let usage: UsageSurfaceResult;
  try {
    usage = await deps.usageSurface({ root: args.repo, package: args.package });
  } catch (e) {
    return { exit: 1, message: `could not scan ${args.repo}: ${messageOf(e)}` };
  }
  if (usage.callSites.length > 0 && args.candidate === undefined) {
    return {
      exit: 2,
      message: `${usage.callSites.length} call site(s) of ${args.package} found: pass --candidate <file> with the replacement`,
    };
  }

  let path: string;
  if (args.out !== undefined) path = args.out;
  else {
    const label = args.label ?? basename(args.repo);
    const relative = proofReportPath((label.split("/").pop() ?? "").toLowerCase(), args.package);
    if (relative === undefined) {
      return { exit: 2, message: `cannot derive a report path from the label "${label}": pass --out or --label` };
    }
    path = join(deps.repoRoot, relative);
  }

  const recipe = deps.recipes.get(args.package);
  let oracle: { module: unknown; version: string } | undefined;
  try {
    oracle = deps.loadOracle(args.package);
  } catch (e) {
    return { exit: 1, message: `could not load the oracle ${args.package}: ${messageOf(e)}` };
  }
  let candidate: { module: unknown; name: string; source: string } | undefined;
  if (args.candidate !== undefined) {
    try {
      candidate = await deps.loadCandidate(args.candidate);
    } catch (e) {
      return { exit: 1, message: messageOf(e) };
    }
  }

  const input: ProofInput = { package: args.package, usage, numRuns: args.runs, seed: args.seed };
  if (recipe) input.recipe = recipe;
  if (oracle) {
    input.oracle = oracle.module;
    input.oracleVersion = oracle.version;
  }
  if (candidate) input.candidate = candidate.module;
  const result = runProof(input);

  const header = headerOf(args, usage, oracle?.version);
  let report = header;
  let existingText: string | undefined;
  try {
    existingText = await deps.fs.readText(path);
  } catch (e) {
    return { exit: 1, message: `could not read ${path}: ${messageOf(e)}` };
  }
  if (existingText !== undefined && !args.fresh) {
    const parsed = parseProofReport(existingText);
    if (!parsed.ok) {
      return { exit: 1, message: `${path} is not a valid proof report (${parsed.error.message}); pass --fresh to start over` };
    }
    if (!sameHeader(parsed.report, header)) {
      return {
        exit: 1,
        message: `${path} describes a different repo, package or usage surface; pass --fresh to start over`,
      };
    }
    report = parsed.report;
  }

  report = appendAttempt(report, toAttempt(result, candidate));
  const attempt = report.attempts[report.attempts.length - 1]!;
  try {
    await deps.fs.writeAtomic(path, serializeProofReport(report));
  } catch (e) {
    return { exit: 1, message: `could not write ${path}: ${messageOf(e)}` };
  }

  for (const line of summaryLines(args.package, attempt)) deps.print(line);
  for (const w of usage.warnings.slice(0, MAX_WARNINGS)) deps.print(`warning: ${w}`);
  if (usage.warnings.length > MAX_WARNINGS) deps.print(`... and ${usage.warnings.length - MAX_WARNINGS} more warnings`);
  deps.print(`written: ${path}`);
  return { exit: 0, attempt, path };
}
