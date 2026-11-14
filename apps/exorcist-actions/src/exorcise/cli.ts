// Requirement 15: the process entry point of `npm run exorcise`. One of the few readers of process.argv and process.env.
import { resolve } from "node:path";
import {
  CacheLayer,
  ResilientClient,
  configFromEnv,
  createFetchClient,
  createNodeReportFs,
  createNodeSourceFs,
} from "@graveyard-kit/exorcist-npm/programmatic";
import type { ReportFs, SourceContext, SourceFs } from "@graveyard-kit/exorcist-npm/programmatic";
import { fetchManifest, resolveCommit } from "../evidence/sources.js";
import { EXORCISE_USAGE, parseExorciseArgs } from "./cli-args.js";
import { runExorcise } from "./run.js";
import type { ExorciseDeps } from "./run.js";

export interface ExorciseMainDeps {
  fs: SourceFs;
  reports: ReportFs;
  env: Record<string, string | undefined>;
  cwd: string;
  print(line: string): void;
  error(line: string): void;
  /** Builds the evidence functions; replaceable so tests need no network. */
  evidence?: (ctx: { env: Record<string, string | undefined>; cacheDir: string }) => ExorciseDeps["evidence"];
}

function networkEvidence(ctx: { env: Record<string, string | undefined>; cacheDir: string }): ExorciseDeps["evidence"] {
  const config = configFromEnv(ctx.env, ctx.cacheDir);
  const clock = () => new Date();
  const source: SourceContext = {
    config,
    cache: new CacheLayer(
      config.cacheRoot,
      new ResilientClient(
        createFetchClient({ userAgent: "exorcist-actions-scanner" }),
        clock,
        (ms) => new Promise((done) => setTimeout(done, ms)),
        {
          maxConcurrency: config.maxConcurrency,
          maxRetries: config.maxRetries,
          githubMaxWaitSeconds: config.githubMaxWaitSeconds,
        },
      ),
      clock,
      config.ttlSeconds,
    ),
  };
  return {
    resolveCommit: (o, r, ref) => resolveCommit(source, o, r, ref),
    fetchManifest: async (name, ref) => {
      const res = await fetchManifest(source, name, ref, undefined);
      return res.ok ? { ok: true, value: res.value.manifest } : res;
    },
  };
}

/** Runs one exorcise; returns the exit code (0 attempt produced, 1 refusal, 2 usage). */
export async function main(argv: readonly string[], deps: ExorciseMainDeps): Promise<number> {
  const parsed = parseExorciseArgs(argv, deps.cwd);
  if (!parsed.ok) {
    deps.error(parsed.message);
    deps.error(EXORCISE_USAGE);
    return 2;
  }
  const { args } = parsed;
  const cacheDir = resolve(deps.cwd, args.cache);
  const resolved = {
    ...args,
    repo: resolve(deps.cwd, args.repo),
    ...(args.out !== undefined ? { out: resolve(deps.cwd, args.out) } : {}),
  };
  const outcome = await runExorcise(resolved, {
    fs: deps.fs,
    reports: deps.reports,
    evidence: (deps.evidence ?? networkEvidence)({ env: deps.env, cacheDir }),
    print: (line) => deps.print(line),
  });
  return outcome.exit;
}

if (!process.env["VITEST"] && /(cli\.[cm]?[jt]s|vite-node)$/.test(process.argv[1] ?? "")) {
  main(process.argv.slice(2), {
    fs: createNodeSourceFs(),
    reports: createNodeReportFs(),
    env: process.env,
    cwd: process.cwd(),
    print: (line) => console.log(line),
    error: (line) => console.error(line),
  }).then(
    (code) => {
      process.exitCode = code;
    },
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : "exorcise failed");
      process.exitCode = 1;
    },
  );
}
