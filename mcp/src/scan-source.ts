import { basename } from "node:path";
import {
  DEMO_REPOS,
  createDeadline,
  parseReport,
  type RepoInput,
  type ScanOutcome,
  type ScanReport,
} from "@graveyard-kit/exorcist-npm/programmatic";
import type { ExorcistDeps } from "./deps.js";
import { toolError, type ToolErrorValue } from "./errors.js";
import { guardedScan } from "./guards.js";

export type ScanInput = { repo: string; ref?: string };

const TIMED_OUT: unique symbol = Symbol("timed_out");
const LOCAL_REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;

async function readDemo(deps: ExorcistDeps, name: string): Promise<{ ok: true; report: ScanReport } | ToolErrorValue> {
  const bytes = await deps.demoStore(name);
  if (bytes === undefined) return toolError("demo_not_found", `no demo snapshot named ${name}`);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return toolError("demo_invalid", `demo snapshot ${name} is not valid UTF-8`);
  }
  const parsed = parseReport(text);
  if (!parsed.ok) return toolError("demo_invalid", `demo snapshot ${name} was rejected: ${parsed.error.category}`);
  return { ok: true, report: parsed.report };
}

/** The Scan_Api's deadline and watchdog race (`handler.ts`), applied to one pipeline run. */
async function runPipeline(
  deps: ExorcistDeps,
  pipeline: (input: RepoInput, opts?: { signal?: { readonly aborted: boolean } }) => Promise<ScanOutcome>,
  input: RepoInput,
): Promise<{ ok: true; report: ScanReport } | ToolErrorValue> {
  const timeoutMs = deps.scan.timeoutSeconds * 1000;
  const stop = createDeadline(deps.scan.clock, timeoutMs);
  const wd = deps.scan.watchdog(timeoutMs);
  let outcome: ScanOutcome | typeof TIMED_OUT;
  try {
    outcome = await Promise.race([pipeline(input, { signal: stop }), wd.fired.then((): typeof TIMED_OUT => TIMED_OUT)]);
  } finally {
    stop.abort();
    wd.dispose();
  }
  if (outcome === TIMED_OUT) return toolError("scan_failed", "scan_timeout: scan exceeded the time limit");
  if (outcome.ok) return { ok: true, report: outcome.report };
  return toolError("scan_failed", `${outcome.error.code}: ${outcome.error.message}`);
}

/**
 * One Scan_Report for a `repo` argument, exactly as `scan_repo` and `death_report` need it (Requirement 4).
 * Demo names (and the `owner/repo` of a demo without a `ref`) are served from the snapshot store and never scanned.
 */
export async function obtainScanReport(
  deps: ExorcistDeps,
  input: ScanInput,
): Promise<{ ok: true; report: ScanReport } | ToolErrorValue> {
  const guarded = await guardedScan(deps.probe, deps.cwd, input, async (g) => {
    if (g.arg.kind === "demo") return readDemo(deps, g.arg.name);
    if (g.arg.kind === "github") {
      const { owner, repo } = g.arg;
      const demo = DEMO_REPOS.find((d) => d.owner === owner && d.repo === repo);
      if (demo !== undefined && g.ref === undefined) return readDemo(deps, demo.name);
      const repoInput: RepoInput = g.ref === undefined ? { owner, repo } : { owner, repo, ref: g.ref };
      return runPipeline(deps, deps.scan.github, repoInput);
    }
    const dir = g.abs as string;
    const base = basename(dir);
    const repo = LOCAL_REPO_NAME.test(base) && base !== "." && base !== ".." ? base : "checkout";
    return runPipeline(deps, deps.scan.local(dir), { owner: "local", repo });
  });
  return guarded.ok ? guarded.value : guarded;
}
