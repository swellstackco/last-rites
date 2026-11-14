import type { DemoStore, ReportFs, ScanPipeline, Watchdog } from "@last-rites/exorcist-npm/programmatic";
import { createFakeClock } from "@last-rites/exorcist-npm/programmatic/testing";
import type { ExorcistDeps } from "../deps.js";
import type { FsProbe } from "../guards.js";

// Fakes for the tool tests: no disk, no network.

/** An in-memory FsProbe over `{ absolutePath: text }`. Every ancestor directory of a file exists. */
export function memoryProbe(files: Readonly<Record<string, string>>): FsProbe & { reads: string[]; stats: string[] } {
  const dirs = new Set<string>(["/"]);
  for (const f of Object.keys(files)) {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/") || "/");
  }
  const reads: string[] = [];
  const stats: string[] = [];
  return {
    reads,
    stats,
    async stat(path) {
      stats.push(path);
      if (Object.prototype.hasOwnProperty.call(files, path)) return { kind: "file" };
      if (dirs.has(path)) return { kind: "dir" };
      return undefined;
    },
    async readText(path) {
      reads.push(path);
      return Object.prototype.hasOwnProperty.call(files, path) ? files[path] : undefined;
    },
  };
}

/** A recording ReportFs: keeps every write; `files` is the current content. */
export function recordingReportFs(initial: Record<string, string> = {}): ReportFs & {
  files: Map<string, string>;
  writes: Array<{ path: string; text: string }>;
  reads: string[];
} {
  const files = new Map(Object.entries(initial));
  const writes: Array<{ path: string; text: string }> = [];
  const reads: string[] = [];
  return {
    files,
    writes,
    reads,
    async readText(path) {
      reads.push(path);
      return files.get(path);
    },
    async writeAtomic(path, text) {
      writes.push({ path, text });
      files.set(path, text);
    },
  };
}

/** A DemoStore over `{ name: text }` that records the names asked for. */
export function fakeDemoStore(snapshots: Readonly<Record<string, string>> = {}): DemoStore & { asked: string[] } {
  const asked: string[] = [];
  const store = (async (name: string) => {
    asked.push(name);
    const text = Object.prototype.hasOwnProperty.call(snapshots, name) ? snapshots[name] : undefined;
    return text === undefined ? undefined : new TextEncoder().encode(text);
  }) as DemoStore & { asked: string[] };
  store.asked = asked;
  return store;
}

export interface Counted<A extends unknown[], R> {
  (...args: A): R;
  calls: A[];
}

/** Wraps a function with a call counter and an argument log. */
export function counting<A extends unknown[], R>(fn: (...args: A) => R): Counted<A, R> {
  const wrapped = ((...args: A) => {
    wrapped.calls.push(args);
    return fn(...args);
  }) as Counted<A, R>;
  wrapped.calls = [];
  return wrapped;
}

const never: Watchdog = () => ({ fired: new Promise<void>(() => {}), dispose() {} });

/** Every Dep a tool can call, as counting wrappers; the defaults fail loudly-but-safely and touch nothing. */
export interface CountedDeps extends ExorcistDeps {
  counts: {
    github: ReturnType<typeof counting<Parameters<ScanPipeline>, ReturnType<ScanPipeline>>>;
    local: ReturnType<typeof counting<[string], ScanPipeline>>;
    e18e: ReturnType<typeof counting<[string], ReturnType<ExorcistDeps["e18e"]>>>;
    usageSurface: ReturnType<typeof counting<Parameters<ExorcistDeps["usageSurface"]>, ReturnType<ExorcistDeps["usageSurface"]>>>;
    loadCandidate: ReturnType<typeof counting<[string], ReturnType<ExorcistDeps["proof"]["loadCandidate"]>>>;
  };
  /** Total number of calls to any counted Dep (the demo store counts through `demoStore.asked`). */
  totalCalls(): number;
}

/**
 * Deps with a fake clock, an empty in-memory file system, no demo snapshots, and counting wrappers around the
 * pipelines, e18e, the usage surface and the candidate loader. `overrides` replaces whole top-level fields.
 */
export function makeDeps(overrides: Partial<ExorcistDeps> = {}): CountedDeps {
  const clock = createFakeClock().clock;
  const github = counting<Parameters<ScanPipeline>, ReturnType<ScanPipeline>>(
    async () => ({ ok: false, error: { code: "repo_fetch_failed", message: "fake pipeline not configured", failureCategory: "network_error" } }),
  );
  const unconfigured: ScanPipeline = async () => ({
    ok: false,
    error: { code: "repo_fetch_failed", message: "fake local pipeline not configured", failureCategory: "network_error" },
  });
  const local = counting<[string], ScanPipeline>(() => unconfigured);
  const e18e = counting<[string], ReturnType<ExorcistDeps["e18e"]>>(async () => ({
    ok: false,
    reason: { source: "e18e", category: "network_error" },
  }));
  const usageSurface = counting<Parameters<ExorcistDeps["usageSurface"]>, ReturnType<ExorcistDeps["usageSurface"]>>(
    async (input) => ({ package: input.package, filesScanned: 0, callSites: [], importSites: [], warnings: [] }),
  );
  const loadCandidate = counting<[string], ReturnType<ExorcistDeps["proof"]["loadCandidate"]>>(async (file) => ({
    module: {},
    name: file,
    source: "",
  }));
  const demoStore = fakeDemoStore();
  const deps: ExorcistDeps = {
    cwd: "/work",
    probe: memoryProbe({}),
    demoStore,
    scan: { github, local, clock, timeoutSeconds: 60, watchdog: never },
    e18e,
    usageSurface,
    proof: {
      recipes: new Map(),
      loadOracle: () => undefined,
      loadCandidate,
      nodeReportFs: recordingReportFs(),
      repoRoot: "/work",
    },
    ...overrides,
  };
  return Object.assign(deps, {
    counts: { github, local, e18e, usageSurface, loadCandidate },
    totalCalls: () => github.calls.length + local.calls.length + e18e.calls.length + usageSurface.calls.length + loadCandidate.calls.length,
  }) as CountedDeps;
}
