import { describe, expect, it } from "vitest";
import { createFakeClock } from "../evidence/test-support/fake-clock.js";
import { createCountingClock } from "./test-support/counting-clock.js";
import { createGatedEvidence, driveScan, evidenceFor } from "./test-support/gated-evidence.js";
import { memoryFiles } from "./test-support/memory-files.js";
import { REAL_PARTS, createScanPipeline, type PipelineParts } from "./pipeline.js";
import { createDeadline } from "./stop-signal.js";
import type { EvidenceStage } from "../evidence/index.js";
import type { ScanOutcome } from "./types.js";

const manifest = (deps: Record<string, string>, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ name: "x", dependencies: deps, ...extra });

const lock = (pkgs: Record<string, unknown>, lockfileVersion = 3): string =>
  JSON.stringify({ lockfileVersion, packages: { "": {}, ...pkgs } });

function build(opts: {
  manifest?: string | undefined;
  lock?: string | undefined;
  failLockfile?: "network_error" | "timeout" | "rate_limited";
  max?: number;
  concurrency?: number;
  parts?: PipelineParts;
  evidence?: EvidenceStage;
}) {
  const files = memoryFiles(opts.manifest, opts.lock, opts.failLockfile ? { failLockfile: opts.failLockfile } : {});
  const counting = createCountingClock();
  const gate = createGatedEvidence({ profileOf: () => 0 });
  const pipeline = createScanPipeline(
    {
      evidence: opts.evidence ?? gate.stage,
      files: files.source,
      clock: counting.clock,
      limits: { maxDependencies: opts.max ?? 300, concurrency: opts.concurrency ?? 4 },
    },
    opts.parts,
  );
  return { pipeline, files, counting, gate };
}

const immediate: EvidenceStage = (input) => Promise.resolve(evidenceFor(0, input.name));

function expectError(out: ScanOutcome, code: string): void {
  expect(out.ok).toBe(false);
  if (!out.ok) expect(out.error.code).toBe(code);
}

describe("createScanPipeline", () => {
  it("missing package.json gives no_package_json and requests no lockfile", async () => {
    const t = build({ manifest: undefined, evidence: immediate });
    expectError(await t.pipeline({ owner: "o", repo: "r" }), "no_package_json");
    expect(t.files.requests.map((r) => r.file)).toEqual(["package.json"]);
  });

  it("package.json fetch failure gives repo_fetch_failed with the category", async () => {
    const files = memoryFiles("{}", undefined, { failManifest: "rate_limited" });
    const p = createScanPipeline({
      evidence: immediate,
      files: files.source,
      clock: createFakeClock().clock,
      limits: { maxDependencies: 10, concurrency: 1 },
    });
    const out = await p({ owner: "o", repo: "r" });
    expect(out.ok).toBe(false);
    if (!out.ok && out.error.code === "repo_fetch_failed") expect(out.error.failureCategory).toBe("rate_limited");
    else throw new Error("expected repo_fetch_failed");
  });

  it("malformed package.json", async () => {
    const t = build({ manifest: "{ nope", evidence: immediate });
    expectError(await t.pipeline({ owner: "o", repo: "r" }), "malformed_package_json");
    expect(t.gate.calls).toHaveLength(0);
  });

  it("invalid package.json shape means zero evidence calls", async () => {
    const t = build({ manifest: JSON.stringify({ dependencies: [] }) });
    expectError(await t.pipeline({ owner: "o", repo: "r" }), "invalid_package_json_shape");
    expect(t.gate.calls).toHaveLength(0);
  });

  it("missing lockfile still scans with declared ranges", async () => {
    const t = build({ manifest: manifest({ a: "^1.0.0" }), evidence: immediate });
    const out = await t.pipeline({ owner: "o", repo: "r" });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.report.dependencies[0]?.versionSource).toBe("range");
      expect(out.report.warnings).toContain("no lockfile found; results use declared ranges");
    }
  });

  it("lockfile version 1 is ignored with a warning", async () => {
    const t = build({ manifest: manifest({ a: "^1.0.0" }), lock: lock({}, 1), evidence: immediate });
    const out = await t.pipeline({ owner: "o", repo: "r" });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.report.warnings.some((w) => w.includes("unsupported"))).toBe(true);
  });

  it.each([
    ["npm alias", "npm:other@^1.0.0", "npm_alias"],
    ["git", "git+https://example.com/x.git", "git"],
    ["workspace", "workspace:*", "workspace"],
  ])("%s specifier is skipped", async (_n, spec, reason) => {
    const t = build({ manifest: manifest({ a: spec }), evidence: immediate });
    const out = await t.pipeline({ owner: "o", repo: "r" });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.report.dependencies).toHaveLength(0);
      expect(out.report.skipped[0]?.reason).toBe(reason);
    }
  });

  it("a name in two kinds is scanned once", async () => {
    const t = build({
      manifest: JSON.stringify({ dependencies: { a: "^1.0.0" }, devDependencies: { a: "^2.0.0" } }),
      evidence: immediate,
    });
    const out = await t.pipeline({ owner: "o", repo: "r" });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.report.dependencies).toHaveLength(1);
      expect(out.report.dependencies[0]?.kinds).toEqual(["dependencies", "devDependencies"]);
    }
  });

  it("evidence receives the lockfile version, else the declared range", async () => {
    const calls: Array<[string, string | undefined]> = [];
    const ev: EvidenceStage = (i) => {
      calls.push([i.name, i.versionRange]);
      return Promise.resolve(evidenceFor(0, i.name));
    };
    const t = build({
      manifest: manifest({ a: "^1.0.0", b: "^2.0.0" }),
      lock: lock({ "node_modules/a": { version: "1.2.3" } }),
      evidence: ev,
    });
    await t.pipeline({ owner: "o", repo: "r" });
    expect(calls).toEqual([
      ["a", "1.2.3"],
      ["b", "^2.0.0"],
    ]);
  });

  it("invalid repo and invalid ref make zero file requests", async () => {
    const t = build({ manifest: manifest({}), evidence: immediate });
    expectError(await t.pipeline({ owner: "bad_owner", repo: "r" }), "invalid_repo");
    expectError(await t.pipeline({ owner: "o", repo: "r", ref: "a..b" }), "invalid_ref");
    expect(t.files.requests).toHaveLength(0);
  });

  it("a lockfile fetch failure adds one warning with the category", async () => {
    const t = build({ manifest: manifest({ a: "1.0.0" }), failLockfile: "timeout", evidence: immediate });
    const out = await t.pipeline({ owner: "o", repo: "r" });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.report.warnings.filter((w) => w.includes("could not fetch package-lock.json: timeout"))).toHaveLength(1);
    }
  });

  it("enforces the dependency cap at the boundary (dependencies + skipped)", async () => {
    const m = manifest({ a: "1.0.0", b: "1.0.0", c: "npm:z@1.0.0" });
    const atCap = build({ manifest: m, max: 3, evidence: immediate });
    expect((await atCap.pipeline({ owner: "o", repo: "r" })).ok).toBe(true);
    const over = build({ manifest: m, max: 2 });
    expectError(await over.pipeline({ owner: "o", repo: "r" }), "too_many_dependencies");
    expect(over.gate.calls).toHaveLength(0);
  });

  it("reads the Clock exactly once and uses it for every evidence call", async () => {
    const t = build({ manifest: manifest({ a: "1.0.0", b: "1.0.0" }) });
    const out = await driveScan(t.pipeline({ owner: "o", repo: "r" }), t.gate, [0]);
    expect(out.ok).toBe(true);
    expect(t.counting.reads).toBe(1);
    if (out.ok) expect(out.report.scannedAt).toBe(t.counting.instant.toISOString());
    for (const c of t.gate.calls) expect(c.now).toEqual(t.counting.instant);
  });

  it("respects the concurrency limit", async () => {
    const names = Object.fromEntries(["a", "b", "c", "d", "e"].map((n) => [n, "1.0.0"]));
    const t = build({ manifest: manifest(names), concurrency: 2 });
    const out = await driveScan(t.pipeline({ owner: "o", repo: "r" }), t.gate, [0, 1]);
    expect(out.ok).toBe(true);
    expect(t.gate.maxInFlight).toBeLessThanOrEqual(2);
    expect(t.gate.calls).toHaveLength(5);
  });

  it("an aborted deadline gives scan_timeout and no report", async () => {
    const fc = createFakeClock();
    const deadline = createDeadline(fc.clock, 1000);
    const t = build({ manifest: manifest({ a: "1.0.0", b: "1.0.0" }), evidence: (i) => {
      fc.advance(2000);
      return Promise.resolve(evidenceFor(0, i.name));
    } });
    const out = await t.pipeline({ owner: "o", repo: "r" }, { signal: deadline });
    expectError(out, "scan_timeout");
  });

  it("all evidence failing still returns a report with one warning each", async () => {
    const ev: EvidenceStage = () => Promise.reject(new Error("boom"));
    const t = build({ manifest: manifest({ a: "1.0.0", b: "^2.0.0" }), evidence: ev });
    const out = await t.pipeline({ owner: "o", repo: "r" });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.report.dependencies).toHaveLength(2);
      const w = out.report.warnings.filter((x) => x.startsWith("evidence failed for"));
      expect(w).toEqual([
        'evidence failed for a (requested "1.0.0")',
        'evidence failed for b (requested "^2.0.0")',
      ]);
      for (const d of out.report.dependencies) {
        expect(Object.keys(d.unknownReasons)).toHaveLength(7);
      }
    }
  });

  it("scoreDeath throwing once falls back; twice gives internal_error", async () => {
    // scoreDeath is the skeleton's; force a throw through malformed signals.
    const bad: EvidenceStage = (i) => {
      const r = evidenceFor(0, i.name);
      return Promise.resolve({ ...r, signals: null as never });
    };
    const t = build({ manifest: manifest({ a: "1.0.0" }), evidence: bad });
    const out = await t.pipeline({ owner: "o", repo: "r" });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.report.warnings.some((w) => w.startsWith("evidence failed for a"))).toBe(true);

    const parts: PipelineParts = {
      ...REAL_PARTS,
      scanOne: () => Promise.reject(new Error("always")),
    };
    const t2 = build({ manifest: manifest({ a: "1.0.0" }), parts });
    expectError(await t2.pipeline({ owner: "o", repo: "r" }), "internal_error");
  });
});
