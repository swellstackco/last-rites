import { lstat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CacheLayer,
  DEFAULT_SCAN_API_CONFIG,
  RECIPES,
  ResilientClient,
  configFromEnv,
  createEvidenceStage,
  createFetchClient,
  createFsDemoStore,
  createNodeReportFs,
  createNodeSourceFs,
  createScanPipeline,
  createScanRuntime,
  createUsageSurface,
  fetchE18e,
  realWatchdog,
  type Clock,
  type ScanPipeline,
  type Sleep,
} from "@last-rites/exorcist-npm/programmatic";
import { loadCandidateBusted } from "./candidate-loader.js";
import type { ExorcistDeps, FsProbe } from "./deps.js";
import { createLocalRepoFiles } from "./local-files.js";
import { loadOracle } from "./oracles-static.js";

/** The real, read-only file probe: symbolic links and special files are `other`; unreadable is `undefined`. */
export function createNodeProbe(): FsProbe {
  return {
    async stat(path) {
      try {
        const s = await lstat(path);
        return { kind: s.isFile() ? "file" : s.isDirectory() ? "dir" : "other" };
      } catch {
        return undefined;
      }
    },
    async readText(path) {
      try {
        return await readFile(path, "utf8");
      } catch {
        return undefined;
      }
    },
  };
}

export interface WireOptions {
  /** Working directory that relative tool paths resolve against. */
  cwd: string;
  /** Test seams; the defaults are the wall clock and a timer. */
  clock?: Clock;
  sleep?: Sleep;
}

/**
 * Builds the real Deps (design, "Deps"). Called only from `server.ts main`. Makes no request and creates no
 * file: the cache directory is created lazily by the cache layer on the first write.
 */
export function wireRealDeps(
  env: Record<string, string | undefined>,
  bundleDir: string,
  opts: WireOptions,
): ExorcistDeps {
  const clock: Clock = opts.clock ?? (() => new Date());
  const sleep: Sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const cacheRoot = env["EXORCIST_CACHE_DIR"] ? (env["EXORCIST_CACHE_DIR"] as string) : join(tmpdir(), "exorcist-mcp");
  const evidenceConfig = configFromEnv(env, cacheRoot);
  const http = createFetchClient();
  const probe = createNodeProbe();
  const maxDependencies = DEFAULT_SCAN_API_CONFIG.maxDependencies;

  const github = createScanRuntime({ http, clock, sleep, evidenceConfig, maxDependencies }).pipeline;
  // A second evidence stage on the same cache root: local scans read files from disk, everything else is shared.
  const localEvidence = createEvidenceStage(evidenceConfig, { http, clock, sleep });
  // `scan-source.ts` passes the `local/<name>` target itself; the pipeline reads the directory through `files`.
  const local = (dir: string): ScanPipeline =>
    createScanPipeline({
      evidence: localEvidence,
      files: createLocalRepoFiles(probe, dir),
      clock,
      limits: { maxDependencies, concurrency: evidenceConfig.maxConcurrency },
    });

  const e18eCache = new CacheLayer(
    evidenceConfig.cacheRoot,
    new ResilientClient(http, clock, sleep, {
      maxConcurrency: evidenceConfig.maxConcurrency,
      maxRetries: evidenceConfig.maxRetries,
      githubMaxWaitSeconds: evidenceConfig.githubMaxWaitSeconds,
    }),
    clock,
    evidenceConfig.ttlSeconds,
  );

  return {
    cwd: opts.cwd,
    probe,
    demoStore: createFsDemoStore(join(bundleDir, "demo")),
    scan: {
      github,
      local,
      clock,
      timeoutSeconds: DEFAULT_SCAN_API_CONFIG.timeoutSeconds,
      watchdog: realWatchdog,
    },
    e18e: (name) => fetchE18e({ cache: e18eCache, config: evidenceConfig }, name),
    usageSurface: createUsageSurface({ fs: createNodeSourceFs() }),
    proof: {
      recipes: new Map(Object.entries(RECIPES)),
      loadOracle,
      loadCandidate: loadCandidateBusted,
      nodeReportFs: createNodeReportFs(),
      repoRoot: opts.cwd,
    },
  };
}
