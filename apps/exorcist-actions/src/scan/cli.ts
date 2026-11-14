// Requirement 9: the process entry point of `npm run scan`. One of the few readers of process.argv and process.env.
import { resolve } from "node:path";
import {
  configFromEnv,
  createFetchClient,
  createNodeReportFs,
  createNodeSourceFs,
  serializeReport,
} from "@last-rites/exorcist-npm/programmatic";
import type { ReportFs, SourceFs } from "@last-rites/exorcist-npm/programmatic";
import type { ScanReport } from "@last-rites/exorcist-npm/programmatic";
import { createActionEvidenceStage } from "../evidence/stage.js";
import { parseScanArgs, SCAN_USAGE } from "./cli-args.js";
import { runScan } from "./scan.js";

export interface ScanMainDeps {
  fs: SourceFs;
  reports: ReportFs;
  env: Record<string, string | undefined>;
  cwd: string;
  print(line: string): void;
  error(line: string): void;
  runScan: typeof runScan;
}

export const summaryLine = (report: ScanReport): string =>
  `${report.summary.total} actions, ${report.summary.dead} dead, ${report.summary.skipped} skipped`;

/** Scans one checkout; returns the exit code (0 report, 1 unreadable path or write failure, 2 usage). */
export async function main(argv: readonly string[], deps: ScanMainDeps): Promise<number> {
  const parsed = parseScanArgs(argv, deps.cwd);
  if (!parsed.ok) {
    deps.error(parsed.message);
    deps.error(SCAN_USAGE);
    return 2;
  }
  const { args } = parsed;
  const root = resolve(deps.cwd, args.repo);
  if ((await deps.fs.readDir(root)) === undefined) {
    deps.error(`not a readable directory: ${args.repo}`);
    return 1;
  }

  const config = configFromEnv(deps.env, resolve(deps.cwd, args.cache));
  const stage = createActionEvidenceStage(config, {
    http: createFetchClient({ userAgent: "exorcist-actions-scanner" }),
    clock: () => new Date(),
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
  });
  const report = await deps.runScan(
    { root, label: args.label, ref: args.ref },
    { fs: deps.fs, evidence: stage, clock: () => new Date() },
  );
  const text = serializeReport(report);
  if (args.out === undefined) {
    deps.print(text);
    return 0;
  }
  try {
    await deps.reports.writeAtomic(resolve(deps.cwd, args.out), text);
  } catch {
    deps.error(`could not write ${args.out}`);
    return 1;
  }
  deps.print(summaryLine(report));
  return 0;
}

if (!process.env["VITEST"] && /(cli\.[cm]?[jt]s|vite-node)$/.test(process.argv[1] ?? "")) {
  main(process.argv.slice(2), {
    fs: createNodeSourceFs(),
    reports: createNodeReportFs(),
    env: process.env,
    cwd: process.cwd(),
    print: (line) => console.log(line),
    error: (line) => console.error(line),
    runScan,
  }).then(
    (code) => {
      process.exitCode = code;
    },
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : "scan failed");
      process.exitCode = 1;
    },
  );
}
