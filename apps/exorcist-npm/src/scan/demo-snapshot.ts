import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scheduler } from "node:timers/promises";
import { configFromEnv } from "../evidence/index.js";
import { DEFAULT_SCAN_API_CONFIG } from "./api/config.js";
import { DEMO_NAME_PATTERN } from "./api/demo-store.js";
import { DEMO_REPOS } from "./demo-list.js";
import { createFetchClient } from "./fetch-client.js";
import type { ScanPipeline } from "./pipeline.js";
import { serializeReport } from "./report.js";
import { createScanRuntime } from "./runtime.js";
import { fileURLToPath } from "node:url";

export interface DemoRepo {
  name: string;
  owner: string;
  repo: string;
  ref?: string;
}

export interface DemoFs {
  mkdir(dir: string): Promise<void>;
  writeFile(path: string, text: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string): Promise<void>;
}

export interface DemoSnapshotDeps {
  pipeline: ScanPipeline;
  fs: DemoFs;
  demoDir: string;
  log(line: string): void;
}

export interface DemoSnapshotSummary {
  written: string[];
  failed: Array<{ name: string; reason: string }>;
}

/** Sequential on purpose, to stay polite to the data sources. */
export async function runDemoSnapshots(
  list: readonly DemoRepo[],
  deps: DemoSnapshotDeps,
): Promise<DemoSnapshotSummary> {
  const { pipeline, fs, demoDir, log } = deps;
  const summary: DemoSnapshotSummary = { written: [], failed: [] };
  let counter = 0;
  const fail = (name: string, reason: string): void => {
    summary.failed.push({ name, reason });
  };

  for (const entry of list) {
    if (!DEMO_NAME_PATTERN.test(entry.name)) {
      log(`${entry.name}: invalid demo name`);
      fail(entry.name, "invalid_name");
      continue;
    }

    let outcome;
    try {
      outcome = await pipeline(
        entry.ref === undefined
          ? { owner: entry.owner, repo: entry.repo }
          : { owner: entry.owner, repo: entry.repo, ref: entry.ref },
      );
    } catch {
      log(`${entry.owner}/${entry.repo}: internal_error`);
      fail(entry.name, "internal_error");
      continue;
    }
    if (!outcome.ok) {
      log(`${entry.owner}/${entry.repo}: ${outcome.error.code}`);
      fail(entry.name, outcome.error.code);
      continue;
    }

    counter += 1;
    const tmp = join(demoDir, `.${entry.name}.json.${counter}.tmp`);
    const finalPath = join(demoDir, `${entry.name}.json`);
    try {
      await fs.mkdir(demoDir);
      await fs.writeFile(tmp, serializeReport(outcome.report));
      await fs.rename(tmp, finalPath);
      summary.written.push(entry.name);
      log(`${entry.name}: written`);
    } catch {
      try {
        await fs.rm(tmp);
      } catch {
        // The temp file may not exist.
      }
      log(`${entry.name}: write failed`);
      fail(entry.name, "write_failed");
    }
  }
  return summary;
}

/** Manual entry point: the only reader of process.env here. Started only by `npm run demo-snapshot`. */
export async function main(): Promise<void> {
  const cacheRoot = fileURLToPath(new URL("../../../../", import.meta.url));
  const runtime = createScanRuntime({
    http: createFetchClient(),
    clock: () => new Date(),
    sleep: (ms) => scheduler.wait(ms),
    evidenceConfig: configFromEnv(process.env, cacheRoot), // GITHUB_TOKEN is optional
    maxDependencies: DEFAULT_SCAN_API_CONFIG.maxDependencies,
  });
  const fs: DemoFs = {
    mkdir: async (dir) => void (await mkdir(dir, { recursive: true })),
    writeFile: (path, text) => writeFile(path, text, "utf8"),
    rename,
    rm: (path) => rm(path, { force: true }),
  };
  const summary = await runDemoSnapshots(DEMO_REPOS, {
    pipeline: runtime.pipeline,
    fs,
    demoDir: DEFAULT_SCAN_API_CONFIG.demoDir,
    log: (line) => console.log(line),
  });
  console.log(`written: ${summary.written.length}, failed: ${summary.failed.length}`);
  process.exit(summary.failed.length > 0 ? 1 : 0);
}

// Never run under Vitest, and only when this file is the process entry point.
if (!process.env["VITEST"] && /(demo-snapshot\.[cm]?[jt]s|vite-node)$/.test(process.argv[1] ?? "")) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
