import { describe, expect, it } from "vitest";
import { parseProofReport } from "@graveyard-kit/skeleton/proof";
import type { Outcome, ReportFs } from "@graveyard-kit/exorcist-npm/programmatic";
import type { ActionManifest } from "../evidence/manifest.js";
import { memorySourceFs } from "../test-support/memory-source-fs.js";
import type { ExorciseArgs } from "./cli-args.js";
import { runExorcise } from "./run.js";

const SHA = "a".repeat(40);
const OUT = "/o/proofs/ci-actions/r.json";
const CI =
  "jobs:\n  b:\n    steps:\n      - uses: actions/checkout@v3\n      - uses: actions-rs/toolchain@v1\n      - uses: actions/cache@" +
  "c".repeat(40) +
  "\n";
const WITH = "jobs:\n  b:\n    steps:\n      - uses: actions-rs/toolchain@v1\n        with:\n          toolchain: stable\n          cache-key: x\n";
const CI_PINNED = CI.replace("actions/checkout@v3", `actions/checkout@${SHA} # v3`);

const fail: Outcome<never> = { ok: false, reason: { source: "github", category: "not_found" } };
const manifest = (required: string[] = []): ActionManifest => ({
  inputs: new Map(required.map((n) => [n, { required: true, hasDefault: false }])),
  outputs: new Set(),
});

function setup(files: Record<string, string>, opts: { resolve?: Outcome<string>; manifest?: Outcome<ActionManifest>; store?: Record<string, string> } = {}) {
  const tree = Object.fromEntries(Object.entries(files).map(([n, t]) => [`.github/workflows/${n}`, t]));
  const store = new Map(Object.entries(opts.store ?? {}));
  const writes: string[] = [];
  const printed: string[] = [];
  const reports: ReportFs = {
    async readText(p) {
      return store.get(p);
    },
    async writeAtomic(p, t) {
      store.set(p, t);
      writes.push(p);
    },
  };
  const deps = {
    fs: memorySourceFs(tree, Object.keys(files).map((n) => ({ name: n, kind: "file" as const })), "/repo"),
    reports,
    evidence: {
      resolveCommit: async () => opts.resolve ?? { ok: true as const, value: SHA },
      fetchManifest: async () => opts.manifest ?? { ok: true as const, value: manifest() },
    },
    print: (l: string) => printed.push(l),
  };
  return { deps, store, writes, printed };
}

const args = (over: Partial<ExorciseArgs>): ExorciseArgs => ({
  repo: "/repo",
  action: "actions/checkout",
  fix: "pin",
  write: false,
  label: "acme/widgets",
  cache: ".cache/actions",
  fresh: false,
  ...over,
});
const F = "/repo/.github/workflows/ci.yml";

describe("runExorcise examples", () => {
  it("pin dry run prints - old / + new and writes nothing", async () => {
    const t = setup({ "ci.yml": CI });
    const r = await runExorcise(args({}), t.deps);
    expect(r.exit).toBe(0);
    expect(t.printed).toContain("-       - uses: actions/checkout@v3");
    expect(t.printed).toContain(`+       - uses: actions/checkout@${SHA} # v3`);
    expect(t.writes).toEqual([]);
    expect(t.printed.some((l) => l.startsWith("status: proved, sabotage"))).toBe(true);
  });

  it("--write on a proved attempt writes the changed file and no other", async () => {
    const t = setup({ "ci.yml": CI, "other.yml": "jobs:\n  b:\n    steps:\n      - uses: actions/cache@v4\n" });
    const r = await runExorcise(args({ write: true }), t.deps);
    expect(r.exit).toBe(0);
    expect(t.writes).toEqual([F]);
    expect(t.store.get(F)).toBe(CI_PINNED);
  });

  it("--write on a counterexample prints not written and exits 1", async () => {
    const t = setup({ "ci.yml": CI }, { manifest: { ok: true, value: manifest(["toolchain"]) } });
    const r = await runExorcise(args({ action: "actions-rs/toolchain", fix: "swap", write: true }), t.deps);
    expect(r.exit).toBe(1);
    expect(r.attempt?.status).toBe("counterexample");
    expect(t.printed).toContain("not written: counterexample");
    expect(t.writes).toEqual([]);
  });

  it("--write on a weak proof prints not written: weak", async () => {
    const t = setup({ "ci.yml": CI });
    const r = await runExorcise(args({ write: true }), { ...t.deps, mutants: { pin: [], contract: [] } });
    expect(r.exit).toBe(1);
    expect(t.printed).toContain("not written: weak");
    expect(t.writes).toEqual([]);
  });

  it("swap proves a use without inputs and writes the replacement", async () => {
    const t = setup({ "ci.yml": CI });
    const r = await runExorcise(args({ action: "actions-rs/toolchain", fix: "swap", write: true }), t.deps);
    expect(r.exit).toBe(0);
    expect(t.store.get(F)).toContain("- uses: dtolnay/rust-toolchain@master # was actions-rs/toolchain@v1");
  });

  it("exits 1 with the messages of Requirement 15.2", async () => {
    const none = setup({ "ci.yml": CI });
    expect((await runExorcise(args({ action: "x/y" }), none.deps)).exit).toBe(1);
    expect(none.printed).toEqual(["no uses of x/y"]);

    const pinned = setup({ "ci.yml": CI });
    expect((await runExorcise(args({ action: "actions/cache" }), pinned.deps)).exit).toBe(1);
    expect(pinned.printed).toEqual(["nothing to pin"]);

    const noSwap = setup({ "ci.yml": CI });
    expect((await runExorcise(args({ fix: "swap" }), noSwap.deps)).exit).toBe(1);
    expect(noSwap.printed).toEqual(["no swap available for actions/checkout"]);

    const run = setup({ "ci.yml": "jobs:\n  b:\n    steps:\n      - uses: actions-rs/cargo@v1\n" });
    await runExorcise(args({ action: "actions-rs/cargo", fix: "swap" }), run.deps);
    expect(run.printed).toEqual(["no swap available for actions-rs/cargo"]);
  });

  it("a Rewrite_Refusal exits 1 with nothing written", async () => {
    const t = setup({ "ci.yml": WITH });
    const r = await runExorcise(args({ action: "actions-rs/toolchain", fix: "swap", write: true, out: OUT }), t.deps);
    expect(r.exit).toBe(1);
    expect(t.printed).toEqual(["refused: unmapped_input (cache-key)"]);
    expect(t.writes).toEqual([]);
  });

  it("--out appends attempt 2 to an existing report", async () => {
    const t = setup({ "ci.yml": CI });
    await runExorcise(args({ out: OUT }), t.deps);
    await runExorcise(args({ out: OUT }), t.deps);
    const parsed = parseProofReport(t.store.get(OUT)!);
    expect(parsed.ok && parsed.report.attempts.map((a) => a.attempt)).toEqual([1, 2]);
  });

  it("a report with other call sites exits 1; --fresh replaces it", async () => {
    const t = setup({ "ci.yml": CI });
    await runExorcise(args({ out: OUT }), t.deps);
    const before = t.store.get(OUT)!;
    const more = setup({ "ci.yml": CI + "      - uses: actions/checkout@v4\n" }, { store: { [OUT]: before } });
    const r = await runExorcise(args({ out: OUT }), more.deps);
    expect(r.exit).toBe(1);
    expect(more.writes).toEqual([]);
    expect(more.printed.join("\n")).toContain("--fresh");

    const fresh = await runExorcise(args({ out: OUT, fresh: true }), more.deps);
    expect(fresh.exit).toBe(0);
    const parsed = parseProofReport(more.store.get(OUT)!);
    expect(parsed.ok && parsed.report.attempts).toHaveLength(1);
  });

  it("a resolution failure is an error attempt with recipe_failure", async () => {
    const t = setup({ "ci.yml": CI }, { resolve: fail });
    const r = await runExorcise(args({ out: OUT }), t.deps);
    expect(r.exit).toBe(0);
    expect(r.attempt?.status).toBe("error");
    expect(r.attempt?.error).toEqual({ code: "recipe_failure", message: "resolve actions/checkout@v3: not_found" });
    const w = await runExorcise(args({ out: OUT, write: true, fresh: true }), t.deps);
    expect(w.exit).toBe(1);
    expect(t.store.get(F)).toBeUndefined();
  });

  it("never rejects when a dependency throws", async () => {
    const t = setup({ "ci.yml": CI });
    const r = await runExorcise(args({}), { ...t.deps, evidence: { ...t.deps.evidence, resolveCommit: async () => { throw new Error("boom"); } } });
    expect(r.exit).toBe(1);
  });
});
