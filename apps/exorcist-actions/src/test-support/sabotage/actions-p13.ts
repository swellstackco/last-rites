import type { ExorciseArgs } from "../../exorcise/cli-args.js";
import type { ExorciseDeps, ExorciseOutcome } from "../../exorcise/run.js";
import { parseExorciseArgs } from "../../exorcise/cli-args.js";
import { parseScanArgs } from "../../scan/cli-args.js";
import { realExorciseImpl } from "../properties/actions-p13.js";
import type { ExorciseImpl } from "../properties/actions-p13.js";
import type { Sabotage } from "../sabotage-runner.js";

type Run = (args: ExorciseArgs, deps: ExorciseDeps) => Promise<ExorciseOutcome>;
const real: Run = realExorciseImpl.runExorcise;
const withRun = (runExorcise: Run): ExorciseImpl => ({ ...realExorciseImpl, runExorcise });
const withParsers = (wrap: (p: typeof parseScanArgs) => typeof parseScanArgs): ExorciseImpl => ({
  ...realExorciseImpl,
  parseScanArgs: wrap(parseScanArgs),
  parseExorciseArgs: wrap(parseExorciseArgs as unknown as typeof parseScanArgs) as unknown as typeof parseExorciseArgs,
});

/** The first workflow file of the tree and its text. */
async function firstWorkflow(args: ExorciseArgs, deps: ExorciseDeps): Promise<{ path: string; text: string } | undefined> {
  const dir = `${args.repo}/.github/workflows`;
  const name = (await deps.fs.readDir(dir))?.[0]?.name;
  if (name === undefined) return undefined;
  const text = await deps.fs.readText(`${dir}/${name}`);
  return text === undefined ? undefined : { path: `${dir}/${name}`, text };
}

/** Runs the real exorcise, then does something extra that the real one never does. */
const after =
  (extra: (args: ExorciseArgs, deps: ExorciseDeps, out: ExorciseOutcome) => Promise<void>): Run =>
  async (args, deps) => {
    const out = await real(args, deps);
    await extra(args, deps, out);
    return out;
  };

/** (a) write on a counterexample. */
const writeOnCounterexample = after(async (args, deps, out) => {
  const f = await firstWorkflow(args, deps);
  if (args.write && out.attempt?.status === "counterexample" && f) await deps.reports.writeAtomic(f.path, f.text + "# x\n");
});

/** (b) write on a weak proof. */
const writeOnWeak = after(async (args, deps, out) => {
  const f = await firstWorkflow(args, deps);
  if (args.write && out.attempt?.weak && f) await deps.reports.writeAtomic(f.path, f.text + "# x\n");
});

/** (c) the proof report goes into the workflow folder. */
const reportInWorkflows = after(async (args, deps, out) => {
  if (args.out !== undefined && out.attempt) await deps.reports.writeAtomic(`${args.repo}/.github/workflows/report.json`, "{}\n");
});

/** (f) files that did not change are written too. */
const writeUnchanged = after(async (args, deps, out) => {
  const f = await firstWorkflow(args, deps);
  if (args.write && out.exit === 0 && out.attempt && f) await deps.reports.writeAtomic(f.path, f.text);
});

/** (h) a text other than the proved one is written (after the right one). */
const writeOtherText = after(async (args, deps, out) => {
  for (const path of out.written) {
    if (!path.endsWith(".yml")) continue;
    const text = await deps.fs.readText(path);
    await deps.reports.writeAtomic(path, (text ?? "") + "# tampered\n");
  }
});

/** (d) `--fix both` is taken as `pin`. */
const acceptBoth = (p: typeof parseScanArgs): typeof parseScanArgs => (argv, cwd) =>
  p(Array.isArray(argv) ? argv.map((t, i) => (t === "both" && argv[i - 1] === "--fix" ? "pin" : t)) : argv, cwd);

/** (e) the second occurrence of a flag (with its value) is dropped instead of rejected. */
const acceptRepeats = (p: typeof parseScanArgs): typeof parseScanArgs => (argv, cwd) => {
  if (!Array.isArray(argv)) return p(argv, cwd);
  const seen = new Set<string>();
  const out: string[] = [];
  const switches = new Set(["--write", "--fresh"]);
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]!;
    if (typeof t === "string" && t.startsWith("--") && seen.has(t)) {
      if (!switches.has(t)) i++;
      continue;
    }
    if (typeof t === "string" && t.startsWith("--")) seen.add(t);
    out.push(t);
  }
  return p(out, cwd);
};

/** (g) a non-string token makes the parser throw. */
const throwOnOdd = (p: typeof parseScanArgs): typeof parseScanArgs => (argv, cwd) => {
  if (Array.isArray(argv) && argv.some((t) => typeof t !== "string")) throw new TypeError("odd argument");
  return p(argv, cwd);
};

export const sabotages: Sabotage<ExorciseImpl>[] = [
  { name: "(a) write on a counterexample", impl: withRun(writeOnCounterexample) },
  { name: "(b) write on a weak proof", impl: withRun(writeOnWeak) },
  { name: "(c) write the proof report into the workflow folder", impl: withRun(reportInWorkflows) },
  { name: "(d) accept --fix both", impl: withParsers(acceptBoth) },
  { name: "(e) accept a repeated flag", impl: withParsers(acceptRepeats) },
  { name: "(f) write files that did not change", impl: withRun(writeUnchanged) },
  { name: "(g) throw on an odd argv", impl: withParsers(throwOnOdd) },
  { name: "(h) write a workflow text other than the proved one", impl: withRun(writeOtherText) },
];
