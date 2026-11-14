// The hero pipeline (Requirement 16): the real runScan and the two real runExorcise runs of the demo,
// over whatever HttpClient the caller gives. The Recorder gives it a recording client over the network;
// the replay tests give it a FakeHttp over the committed fixtures. Nothing here reads process state.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CacheLayer,
  ResilientClient,
  configFromEnv,
  createNodeSourceFs,
  serializeReport,
} from "@last-rites/exorcist-npm/programmatic";
import type { Clock, HttpClient, ReportFs, Sleep, SourceContext, SourceFs } from "@last-rites/exorcist-npm/programmatic";
import { FakeHttp, createFakeClock, createFakeSleep, loadFixtureCase } from "@last-rites/exorcist-npm/programmatic/testing";
import { fetchManifest, resolveCommit } from "../evidence/sources.js";
import { createActionEvidenceStage } from "../evidence/stage.js";
import { runExorcise } from "../exorcise/run.js";
import type { ExorciseDeps } from "../exorcise/run.js";
import { actionProofName } from "../proof/names.js";
import { runScan } from "../scan/scan.js";

/** `src/__fixtures__/nixpacks`: the recorded workflow tree (`repo/`) and the recorded exchanges (`http/`). */
export const NIXPACKS_FIXTURES = fileURLToPath(new URL("../__fixtures__/nixpacks", import.meta.url));
export const NIXPACKS_REPO = join(NIXPACKS_FIXTURES, "repo");
/** The repository root of this workspace (where `demo/` lives). */
export const WORKSPACE_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
export const DEMO_SNAPSHOT_PATH = join(WORKSPACE_ROOT, "demo/nixpacks-actions.json");
export const DEMO_PROOFS_DIR = join(WORKSPACE_ROOT, "demo/proofs/nixpacks-actions");

export const HERO = {
  label: "railwayapp/nixpacks",
  /** The `--ref` of the scan. */
  ref: "144b4f9",
  commit: "144b4f9ab1c3943af4dfe76d3c79d91263f5b465",
  swapAction: "actions-rs/toolchain",
  pinAction: "actions/checkout",
} as const;

/** `proofs/nixpacks-actions/<Action_Proof_Name>.json`, the virtual `--out` of a hero run. */
export const heroProofOut = (action: string): string => `proofs/nixpacks-actions/${actionProofName(action)}.json`;

export interface HeroDeps {
  http: HttpClient;
  clock: Clock;
  sleep: Sleep;
  env: Record<string, string | undefined>;
  cacheDir: string;
  /** Defaults to the committed fixture tree. */
  repoDir?: string;
  fs?: SourceFs;
}

export interface HeroOutput {
  /** The canonical Scan_Report text. */
  scan: string;
  /** Proof_Report texts by file name (`<Action_Proof_Name>.json`). */
  proofs: Record<string, string>;
  /** Lines printed by the two exorcise runs, in order. */
  printed: string[];
  /** Exit codes of the swap and the pin run. */
  exits: { swap: number; pin: number };
}

/** One SourceContext over a CacheLayer over a ResilientClient, as the CLIs build it. */
export function createSourceContext(deps: Pick<HeroDeps, "http" | "clock" | "sleep" | "env" | "cacheDir">): SourceContext {
  const config = configFromEnv(deps.env, deps.cacheDir);
  return {
    config,
    cache: new CacheLayer(
      config.cacheRoot,
      new ResilientClient(deps.http, deps.clock, deps.sleep, {
        maxConcurrency: config.maxConcurrency,
        maxRetries: config.maxRetries,
        githubMaxWaitSeconds: config.githubMaxWaitSeconds,
      }),
      deps.clock,
      config.ttlSeconds,
    ),
  };
}

/** A ReportFs that keeps writes in memory (the proof reports of a hero run never touch the disk). */
export function memoryReportFs(): ReportFs & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    readText: async (path) => files.get(path),
    writeAtomic: async (path, text) => {
      files.set(path, text);
    },
  };
}

export async function runHero(deps: HeroDeps): Promise<HeroOutput> {
  const repoDir = deps.repoDir ?? NIXPACKS_REPO;
  const fs = deps.fs ?? createNodeSourceFs();

  // The scan: the real stage over the given HttpClient.
  const scanConfig = configFromEnv(deps.env, deps.cacheDir);
  const stage = createActionEvidenceStage(scanConfig, { http: deps.http, clock: deps.clock, sleep: deps.sleep });
  const report = await runScan({ root: repoDir, label: HERO.label, ref: HERO.ref }, { fs, evidence: stage, clock: deps.clock });
  const scan = serializeReport(report);

  // The two exorcise runs, in memory, never with --write.
  const source = createSourceContext(deps);
  const evidence: ExorciseDeps["evidence"] = {
    resolveCommit: (o, r, ref) => resolveCommit(source, o, r, ref),
    fetchManifest: async (name, ref) => {
      const res = await fetchManifest(source, name, ref, undefined);
      return res.ok ? { ok: true, value: res.value.manifest } : res;
    },
  };
  const reports = memoryReportFs();
  const printed: string[] = [];
  const base = { repo: repoDir, write: false, label: HERO.label, commit: HERO.commit, cache: deps.cacheDir, fresh: false };

  const swap = await runExorcise(
    { ...base, action: HERO.swapAction, fix: "swap", out: heroProofOut(HERO.swapAction) },
    { fs, reports, evidence, print: (l) => printed.push(l) },
  );
  const pin = await runExorcise(
    { ...base, action: HERO.pinAction, fix: "pin", out: heroProofOut(HERO.pinAction) },
    { fs, reports, evidence, print: (l) => printed.push(l) },
  );

  const proofs: Record<string, string> = {};
  for (const [path, text] of reports.files) proofs[path.slice(path.lastIndexOf("/") + 1)] = text;
  return { scan, proofs, printed, exits: { swap: swap.exit, pin: pin.exit } };
}

/** A temporary cache folder; `dispose` removes it. */
export function tempCache(): { dir: string; dispose(): void } {
  const dir = mkdtempSync(join(tmpdir(), "exorcist-actions-hero-"));
  return { dir, dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

/** The offline replay of the hero pipeline over the committed fixtures with a fake clock at `scannedAt`. */
export async function replayHero(scannedAt: string): Promise<HeroOutput & { http: FakeHttp }> {
  const http = new FakeHttp({ fixtures: loadFixtureCase("http", NIXPACKS_FIXTURES) });
  const clock = createFakeClock(scannedAt);
  const cache = tempCache();
  try {
    const out = await runHero({ http, clock: clock.clock, sleep: createFakeSleep(clock).sleep, env: {}, cacheDir: cache.dir });
    return { ...out, http };
  } finally {
    cache.dispose();
  }
}
