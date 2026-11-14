import { describe, it, expect } from "vitest";
import type { ScanOutcome, ScanReport } from "@last-rites/exorcist-npm/programmatic";
import { runHook, type EntryEnv } from "./entry.js";
import { BASELINE_REL, parseBaseline, runScanDeps, type ScanDepsDeps } from "./run-scan-deps.js";
import { extractSavedPath, runCandidateProof } from "./run-candidate-proof.js";
import { counting, makeDeps, memoryProbe } from "../test-support/fakes.js";
import { dedupCandidate, oracleModule, proofDeps } from "../test-support/proof-deps.js";

// ---------- scan-deps ----------

const dep = (name: string, grade: string, score: number) => ({ name, death: { grade, score } });
const fakeReport = (deps: Array<ReturnType<typeof dep>>) => ({ dependencies: deps }) as unknown as ScanReport;

const BASELINE_PATH = `/repo/${BASELINE_REL}`;

function scanDeps(outcome: ScanOutcome, baseline?: string) {
  const files = new Map<string, string>();
  if (baseline !== undefined) files.set(BASELINE_PATH, baseline);
  const local = counting((_dir: string) => async (): Promise<ScanOutcome> => outcome);
  const base = makeDeps();
  const tools = makeDeps({ cwd: "/repo", probe: memoryProbe({ "/repo/package.json": "{}" }), scan: { ...base.scan, local } });
  const deps: ScanDepsDeps = {
    tools,
    root: "/repo",
    readText: async (p) => files.get(p),
    writeText: async (p, t) => void files.set(p, t),
  };
  return { deps, files, local };
}

describe("runScanDeps", () => {
  const ok = (r: ScanReport): ScanOutcome => ({ ok: true, report: r });

  it("says so when nothing is newly dead, and rewrites the baseline", async () => {
    const { deps, files } = scanDeps(ok(fakeReport([dep("a", "dead", 90), dep("b", "alive", 5)])), '["a"]');
    expect(await runScanDeps(deps)).toEqual({ lines: ["no new dead packages"], outcome: "ok" });
    expect(JSON.parse(files.get(BASELINE_PATH)!)).toEqual(["a"]);
  });

  it("warns once per new dead package and writes the sorted baseline", async () => {
    const { deps, files, local } = scanDeps(ok(fakeReport([dep("zed", "dead", 88), dep("old", "dead", 70), dep("mid", "dying", 50), dep("new", "dead", 91)])), '["old"]');
    const r = await runScanDeps(deps);
    expect(r.outcome).toBe("warn");
    expect(r.lines).toEqual(["WARNING: new dead package: new (score 91)", "WARNING: new dead package: zed (score 88)"]);
    expect(JSON.parse(files.get(BASELINE_PATH)!)).toEqual(["new", "old", "zed"]);
    expect(local.calls).toEqual([["/repo"]]);
  });

  it.each([["absent", undefined], ["corrupt", "{nope"], ["not strings", "[1,2]"], ["not an array", '{"a":1}']])("%s baseline is the empty set", async (_n, text) => {
    const { deps } = scanDeps(ok(fakeReport([dep("a", "dead", 80)])), text);
    const r = await runScanDeps(deps);
    expect(r.lines).toEqual(["WARNING: new dead package: a (score 80)"]);
  });

  it("a failed scan prints scan failed and keeps the baseline", async () => {
    const { deps, files } = scanDeps({ ok: false, error: { code: "repo_fetch_failed", message: "no network", failureCategory: "network_error" } }, '["keep"]');
    const r = await runScanDeps(deps);
    expect(r).toEqual({ lines: ["scan failed: scan_failed"], outcome: "fail" });
    expect(files.get(BASELINE_PATH)).toBe('["keep"]');
  });

  it("never throws, even when the baseline cannot be read or written", async () => {
    const { deps } = scanDeps(ok(fakeReport([dep("a", "dead", 80)])));
    deps.readText = async () => Promise.reject(new Error("eio"));
    deps.writeText = async () => Promise.reject(new Error("eio"));
    expect((await runScanDeps(deps)).outcome).toBe("warn");
  });

  it("parseBaseline", () => {
    expect(parseBaseline('["a","b"]')).toEqual(["a", "b"]);
    expect(parseBaseline(undefined)).toEqual([]);
  });
});

// ---------- candidate-proof ----------

const CAND = "demo/proofs/candidates/intersect-like/intersect.agent.js";
const stdin = (o: unknown) => JSON.stringify(o);

function candidateRun(modules: Record<string, unknown>) {
  const { deps } = proofDeps("intersect-like", modules);
  return { tools: deps, root: "/work/r", siblingDir: "." };
}

describe("extractSavedPath", () => {
  it.each([
    [{ file_path: CAND }],
    [{ filePath: CAND }],
    [{ path: CAND }],
    [{ tool_input: { path: CAND } }],
  ])("accepts %j", (o) => expect(extractSavedPath(stdin(o))).toBe(CAND));
  it("takes the first string, and undefined for junk", () => {
    expect(extractSavedPath(stdin({ file_path: 3, path: "p" }))).toBe("p");
    expect(extractSavedPath("not json")).toBeUndefined();
    expect(extractSavedPath("[]")).toBeUndefined();
    expect(extractSavedPath("{}")).toBeUndefined();
  });
});

describe("runCandidateProof", () => {
  const key = `r/${CAND}`;

  it("prints a proved status line for an equivalent candidate", async () => {
    const r = await runCandidateProof(candidateRun({ [key]: oracleModule("intersect") }), stdin({ file_path: CAND }));
    expect(r.outcome).toBe("ok");
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatch(/^intersect: attempt 1, proved( \(weak\))?, \d+ runs, seed 20261113$/);
  });

  it("prints the shrunk input for a counterexample", async () => {
    const r = await runCandidateProof(candidateRun({ [key]: dedupCandidate }), stdin({ filePath: CAND }));
    expect(r.outcome).toBe("warn");
    expect(r.lines[0]).toMatch(/^intersect: attempt 1, counterexample, \d+ runs, seed 20261113$/);
    expect(r.lines[1]).toMatch(/^shrunk input: .+/);
  });

  it("accepts the path inside tool_input", async () => {
    const r = await runCandidateProof(candidateRun({ [key]: oracleModule("intersect") }), stdin({ tool_input: { path: CAND } }));
    expect(r.lines[0]).toContain("proved");
  });

  it("skips a non-candidate path and unreadable input", async () => {
    const run = candidateRun({});
    expect(await runCandidateProof(run, stdin({ file_path: "demo/proofs/candidates/x.js" }))).toEqual({
      lines: ["skipped: not a candidate file: demo/proofs/candidates/x.js"],
      outcome: "skipped",
    });
    expect((await runCandidateProof(run, "garbage")).outcome).toBe("skipped");
  });

  it("skips when the checkout is missing, without loading anything", async () => {
    const run = candidateRun({});
    const r = await runCandidateProof({ ...run, siblingDir: "missing" }, stdin({ file_path: CAND }));
    expect(r).toEqual({ lines: ["skipped: no checkout at /work/missing/intersect-like"], outcome: "skipped" });
    expect((run.tools as ReturnType<typeof makeDeps>).totalCalls()).toBe(0);
  });

  it("a missing candidate module is a failure line, not a throw", async () => {
    const r = await runCandidateProof(candidateRun({}), stdin({ file_path: CAND }));
    expect(r.outcome).toBe("fail");
    expect(r.lines[0]).toMatch(/^intersect: invalid_candidate/);
  });
});

// ---------- exit code ----------

describe("hook wrapper with the new runners", () => {
  it("exit code is 0 whatever the outcome", async () => {
    for (const outcome of ["ok", "warn", "fail", "skipped"] as const) {
      const state = { exit: undefined as number | undefined };
      const env: EntryEnv = {
        root: "/repo",
        readStdin: async () => "",
        now: () => new Date("2026-11-13T10:00:00.000Z"),
        writeFile: async () => {},
        print: () => {},
        setExitCode: (c) => (state.exit = c),
      };
      await runHook(env, "scan-deps-on-save", async () => ({ lines: [], outcome }));
      expect(state.exit).toBe(0);
    }
  });
});
