import { basename } from "node:path";
import { exorcise, type CliArgs, type ReportFs } from "@graveyard-kit/exorcist-npm/programmatic";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ExorcistDeps } from "../deps.js";
import { checkCandidate, checkOut, checkPath, checkProofPackage, checkRuns } from "../guards.js";
import { errorResult, textResult } from "../result.js";

export const GENERATE_PIN_TESTS_NAME = "generate_pin_tests";
export const GENERATE_PIN_TESTS_TITLE = "Prove a replacement with pin tests";
export const GENERATE_PIN_TESTS_DESCRIPTION =
  "Run the proof harness for one package in a local checkout: find its call sites, run the replacement candidate against the " +
  "original package on generated inputs, then check that the tests can fail (sabotage). Returns the proof report (status proved, " +
  "counterexample, no-call-sites or error; a counterexample is a successful result) and a summary. EXECUTES the candidate file " +
  "and the repository's recipe in the server process; writes only to `out` when given, otherwise nothing is written anywhere. " +
  "Makes no network requests.";

export const GENERATE_PIN_TESTS_SHAPE = {
  path: z.string().describe("Directory of the checkout (read only)"),
  package: z.string().describe("Unscoped npm package name with a recipe, e.g. intersect"),
  candidate: z.string().optional().describe("Replacement module file (.js, .mjs, .cjs); required when the package has call sites"),
  runs: z.number().optional().describe("Number of generated inputs, 100 to 100000 (default 200)"),
  out: z.string().optional().describe("Where to write the proof report; must end in proofs/<repo-name>/<file>"),
};

export const GENERATE_PIN_TESTS_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

/** The fixed default seed of the proof harness (Requirement 8.2). */
export const DEFAULT_SEED = 20261113;

export interface GeneratePinTestsArgs {
  path: unknown;
  package: unknown;
  candidate?: unknown;
  runs?: unknown;
  out?: unknown;
}

/** A throw-away ReportFs: nothing exists yet, the written text is kept in memory (Requirement 8.3). */
function memoryReportFs(): ReportFs & { written: string | undefined } {
  const fs = {
    written: undefined as string | undefined,
    async readText(): Promise<string | undefined> {
      return undefined;
    },
    async writeAtomic(_path: string, text: string): Promise<void> {
      fs.written = text;
    },
  };
  return fs;
}

export async function generatePinTestsImpl(deps: ExorcistDeps, args: GeneratePinTestsArgs): Promise<CallToolResult> {
  const pkg = checkProofPackage(args.package);
  if (!pkg.ok) return errorResult(pkg.code, pkg.message);
  const p = await checkPath(deps.probe, deps.cwd, args.path);
  if (!p.ok) return errorResult(p.code, p.message);
  let candidate: string | undefined;
  if (args.candidate !== undefined) {
    const c = await checkCandidate(deps.probe, deps.cwd, args.candidate);
    if (!c.ok) return errorResult(c.code, c.message);
    candidate = c.abs;
  }
  const runs = checkRuns(args.runs);
  if (!runs.ok) return errorResult(runs.code, runs.message);
  if (args.out !== undefined) {
    const o = checkOut(args.out);
    if (!o.ok) return errorResult(o.code, o.message);
    // Writing to `out` is added with task 5.7.
    return errorResult("invalid_out", "writing a report to out is not available yet");
  }

  const fs = memoryReportFs();
  const lines: string[] = [];
  const cli: CliArgs = {
    repo: p.abs,
    package: pkg.name,
    runs: runs.runs,
    seed: DEFAULT_SEED,
    out: `memory/proofs/dry-run/${pkg.name}.json`,
    label: basename(p.abs),
    fresh: false,
  };
  if (candidate !== undefined) cli.candidate = candidate;
  const outcome = await exorcise(
    {
      usageSurface: deps.usageSurface,
      fs,
      recipes: deps.proof.recipes,
      loadOracle: deps.proof.loadOracle,
      loadCandidate: deps.proof.loadCandidate,
      repoRoot: deps.proof.repoRoot,
      print: (line) => lines.push(line),
    },
    cli,
  );
  if (outcome.exit === 2) return errorResult("usage_error", outcome.message);
  if (outcome.exit === 1) return errorResult("proof_failed", outcome.message);
  if (fs.written === undefined) return errorResult("proof_failed", "the proof run produced no report");
  const summary = lines.filter((l) => !l.startsWith("written: ")).join("\n");
  return textResult(fs.written, summary);
}
