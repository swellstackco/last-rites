// Task 6.8: the orchestration of one proof run, in process, over an in-memory ReportFs and the fixture trees.
import { parseProofReport } from "@graveyard-kit/skeleton/proof";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CliArgs } from "./cli-args.js";
import { loadOracle } from "./oracles.js";
import { RECIPES } from "./recipes/index.js";
import type { ReportFs } from "./report-store.js";
import { exorcise, type ExorciseDeps } from "./run.js";
import { createMemoryFs } from "./test-support/memory-fs.js";
import { createUsageSurface } from "./usage-surface.js";

const TREES = fileURLToPath(new URL("./__fixtures__/trees/", import.meta.url));

function loadTree(name: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(TREES, name, rel))) {
      const r = rel === "" ? entry : `${rel}/${entry}`;
      if (statSync(join(TREES, name, r)).isDirectory()) walk(r);
      else out[r] = readFileSync(join(TREES, name, r), "utf8");
    }
  };
  walk("");
  return out;
}

interface Harness {
  deps: ExorciseDeps;
  files: Map<string, string>;
  lines: string[];
}

function harness(tree: string, candidates: Record<string, unknown> = {}, fsOverride?: Partial<ReportFs>): Harness {
  const files = new Map<string, string>();
  const lines: string[] = [];
  const fs: ReportFs = {
    async readText(p) {
      return files.get(p);
    },
    async writeAtomic(p, t) {
      files.set(p, t);
    },
    ...fsOverride,
  };
  const deps: ExorciseDeps = {
    usageSurface: createUsageSurface({ fs: createMemoryFs(loadTree(tree)) }),
    fs,
    recipes: new Map(Object.entries(RECIPES)),
    loadOracle,
    async loadCandidate(file) {
      if (!(file in candidates)) throw new Error(`cannot read candidate file: ${file}`);
      return { module: candidates[file], name: file, source: `// ${file}\n` };
    },
    repoRoot: "/repo",
    print: (l) => lines.push(l),
  };
  return { deps, files, lines };
}

const OUT = "demo/proofs/example/report.json";
const args = (over: Partial<CliArgs>): CliArgs => ({
  repo: ".",
  package: "intersect",
  runs: 100,
  seed: 7,
  fresh: false,
  out: OUT,
  label: "example/repo",
  ...over,
});

const oracle = (pkg: string): unknown => loadOracle(pkg)!.module;

// A de-duplicating "replacement": Set based, so it drops repeats the oracle keeps.
function dedup(lists: string[][]): string[] {
  if (lists.length === 0) return [];
  return [...lists.map((l) => new Set(l)).reduce((a, b) => new Set([...a].filter((x) => b.has(x))))];
}
const dedupCandidate = Object.assign((l: string[][]) => dedup(l), { big: (l: string[][]) => dedup(l) });

describe("exorcise", () => {
  it("no call sites: no-call-sites with remove-dependency, no candidate needed", async () => {
    const h = harness("declared-only");
    const r = await exorcise(h.deps, args({ package: "node-abort-controller" }));
    expect(r.exit).toBe(0);
    if (r.exit !== 0) return;
    expect(r.attempt.status).toBe("no-call-sites");
    expect(r.attempt.recommendation).toBe("remove-dependency");
    expect(h.files.has(OUT)).toBe(true);
  });

  it("call sites without a candidate: exit 2 and nothing written", async () => {
    const h = harness("intersect-like");
    const r = await exorcise(h.deps, args({}));
    expect(r.exit).toBe(2);
    expect(h.files.size).toBe(0);
  });

  it("a call-through candidate is proved, with a sabotage line", async () => {
    const h = harness("intersect-like", { "same.js": oracle("intersect") });
    const r = await exorcise(h.deps, args({ candidate: "same.js" }));
    expect(r.exit).toBe(0);
    if (r.exit !== 0) return;
    expect(r.attempt.status).toBe("proved");
    expect(h.lines.some((l) => /^ {2}sabotage: \d+ of \d+ mutants caught$/.test(l))).toBe(true);
    expect(parseProofReport(h.files.get(OUT)!).ok).toBe(true);
  });

  it("a de-duplicating candidate gives a counterexample that is printed", async () => {
    const h = harness("intersect-like", { "dedup.js": dedupCandidate });
    const r = await exorcise(h.deps, args({ candidate: "dedup.js", runs: 300 }));
    expect(r.exit).toBe(0);
    if (r.exit !== 0) return;
    expect(r.attempt.status).toBe("counterexample");
    const c = r.attempt.counterexample!;
    expect(h.lines).toContain(`  shape ${c.shape}, shrunk input: ${c.input}`);
    expect(h.lines).toContain(`  old output: ${c.oldOutput}`);
    expect(h.lines).toContain(`  new output: ${c.newOutput}`);
    expect(c.oldOutput).not.toBe(c.newOutput);
  });

  it("a second run appends attempt 2; --fresh restarts", async () => {
    const h = harness("intersect-like", { "same.js": oracle("intersect") });
    await exorcise(h.deps, args({ candidate: "same.js" }));
    const second = await exorcise(h.deps, args({ candidate: "same.js" }));
    expect(second.exit).toBe(0);
    expect(parseProofReport(h.files.get(OUT)!).ok && (parseProofReport(h.files.get(OUT)!) as { report: { attempts: unknown[] } }).report.attempts).toHaveLength(2);
    const fresh = await exorcise(h.deps, args({ candidate: "same.js", fresh: true }));
    expect(fresh.exit).toBe(0);
    if (fresh.exit === 0) expect(fresh.attempt.attempt).toBe(1);
    expect((parseProofReport(h.files.get(OUT)!) as { report: { attempts: unknown[] } }).report.attempts).toHaveLength(1);
  });

  it("an existing report for a different header exits 1 and writes nothing", async () => {
    const h = harness("intersect-like", { "same.js": oracle("intersect") });
    await exorcise(h.deps, args({ candidate: "same.js" }));
    const before = h.files.get(OUT);
    const r = await exorcise(h.deps, args({ candidate: "same.js", label: "other/repo" }));
    expect(r.exit).toBe(1);
    expect(h.files.get(OUT)).toBe(before);
  });

  it("an unparseable existing report exits 1 and is left alone", async () => {
    const h = harness("intersect-like", { "same.js": oracle("intersect") });
    h.files.set(OUT, "not json");
    const r = await exorcise(h.deps, args({ candidate: "same.js" }));
    expect(r.exit).toBe(1);
    expect(h.files.get(OUT)).toBe("not json");
  });

  it("a candidate load failure exits 1", async () => {
    const h = harness("intersect-like");
    const r = await exorcise(h.deps, args({ candidate: "missing.js" }));
    expect(r.exit).toBe(1);
    expect(h.files.size).toBe(0);
  });

  it("a write failure exits 1", async () => {
    const h = harness("intersect-like", { "same.js": oracle("intersect") }, {
      async writeAtomic() {
        throw new Error("disk full");
      },
    });
    const r = await exorcise(h.deps, args({ candidate: "same.js" }));
    expect(r.exit).toBe(1);
    if (r.exit === 1) expect(r.message).toContain("disk full");
  });

  it("unsupported call shapes on the odd deep-diff tree are an attempt with exit 0", async () => {
    const h = harness("deep-diff-like", { "same.js": oracle("deep-diff") });
    const r = await exorcise(h.deps, args({ package: "deep-diff", candidate: "same.js" }));
    expect(r.exit).toBe(0);
    if (r.exit !== 0) return;
    expect(r.attempt.error?.code).toBe("unsupported_call_shapes");
    expect(r.attempt.status).not.toBe("proved");
  });

  it("the same inputs give the same bytes", async () => {
    const a = harness("intersect-like", { "same.js": oracle("intersect") });
    const b = harness("intersect-like", { "same.js": oracle("intersect") });
    await exorcise(a.deps, args({ candidate: "same.js" }));
    await exorcise(b.deps, args({ candidate: "same.js" }));
    expect(a.files.get(OUT)).toBe(b.files.get(OUT));
  });
});
