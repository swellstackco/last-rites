import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { SIGNAL_NAMES } from "@graveyard-kit/skeleton";
import { createScanPipeline, parseReport, type ScanOutcome, type ScanPipeline, type Watchdog } from "@graveyard-kit/exorcist-npm/programmatic";
import { obtainScanReport } from "./scan-source.js";
import { createLocalRepoFiles } from "./local-files.js";
import { fakeDemoStore, makeDeps, memoryProbe, counting } from "./test-support/fakes.js";

const fixture = (rel: string) => readFileSync(new URL(`./__fixtures__/${rel}`, import.meta.url), "utf8");
const SAMPLE = fixture("demo/sample.json");
const REPORT = (() => {
  const p = parseReport(SAMPLE);
  if (!p.ok) throw new Error("sample fixture invalid");
  return p.report;
})();
const PIPELINE_OK = async (_input?: unknown): Promise<ScanOutcome> => ({ ok: true, report: REPORT });

describe("obtainScanReport: demos", () => {
  it("serves a demo name from the store, with no pipeline call", async () => {
    const store = fakeDemoStore({ pump: SAMPLE });
    const deps = makeDeps({ demoStore: store });
    const r = await obtainScanReport(deps, { repo: "pump" });
    expect(r).toEqual({ ok: true, report: REPORT });
    expect(store.asked).toEqual(["pump"]);
    expect(deps.totalCalls()).toBe(0);
  });

  it("serves the owner/repo of a demo without a ref from the store", async () => {
    const store = fakeDemoStore({ "parse-server": SAMPLE });
    const deps = makeDeps({ demoStore: store });
    const r = await obtainScanReport(deps, { repo: "parse-community/parse-server" });
    expect(r.ok).toBe(true);
    expect(store.asked).toEqual(["parse-server"]);
    expect(deps.totalCalls()).toBe(0);
  });

  it("goes live when a ref is given", async () => {
    const store = fakeDemoStore({ pump: SAMPLE });
    const github = counting(PIPELINE_OK);
    const deps = makeDeps({ demoStore: store, scan: { ...makeDeps().scan, github } });
    const r = await obtainScanReport(deps, { repo: "mafintosh/pump", ref: "v1.0.0" });
    expect(r.ok).toBe(true);
    expect(store.asked).toEqual([]);
    expect(github.calls[0]?.[0]).toEqual({ owner: "mafintosh", repo: "pump", ref: "v1.0.0" });
  });

  it("reports a missing snapshot and does not fall back to a live scan", async () => {
    const deps = makeDeps();
    const r = await obtainScanReport(deps, { repo: "jest" });
    expect(r).toMatchObject({ ok: false, code: "demo_not_found" });
    expect(deps.totalCalls()).toBe(0);
  });

  it("reports an invalid snapshot (not canonical, not JSON, bad UTF-8) and does not fall back", async () => {
    for (const text of ["not json", JSON.stringify(JSON.parse(SAMPLE), null, 4), ""]) {
      const deps = makeDeps({ demoStore: fakeDemoStore({ jest: text }) });
      expect(await obtainScanReport(deps, { repo: "jest" })).toMatchObject({ ok: false, code: "demo_invalid" });
      expect(deps.totalCalls()).toBe(0);
    }
    const bad = makeDeps({ demoStore: Object.assign(async () => new Uint8Array([0xff, 0xfe]), { asked: [] }) as never });
    expect(await obtainScanReport(bad, { repo: "jest" })).toMatchObject({ ok: false, code: "demo_invalid" });
  });
});

describe("obtainScanReport: GitHub", () => {
  it("runs the github pipeline with the validated input", async () => {
    const github = counting(PIPELINE_OK);
    const base = makeDeps();
    const deps = makeDeps({ scan: { ...base.scan, github } });
    expect(await obtainScanReport(deps, { repo: "o/r" })).toEqual({ ok: true, report: REPORT });
    expect(github.calls[0]?.[0]).toEqual({ owner: "o", repo: "r" });
    await obtainScanReport(deps, { repo: "o/r", ref: "main" });
    expect(github.calls[1]?.[0]).toEqual({ owner: "o", repo: "r", ref: "main" });
  });

  it.each([
    ["no_package_json", "no package.json"],
    ["repo_fetch_failed", "fetch failed"],
    ["too_many_dependencies", "too many"],
    ["scan_timeout", "slow"],
    ["internal_error", "boom"],
  ] as const)("maps the pipeline error %s to scan_failed", async (code, message) => {
    const base = makeDeps();
    const github: ScanPipeline = async () => ({ ok: false, error: { code, message } as never });
    const r = await obtainScanReport(makeDeps({ scan: { ...base.scan, github } }), { repo: "o/r" });
    expect(r).toEqual({ ok: false, code: "scan_failed", message: `${code}: ${message}` });
  });

  it("times out when the watchdog fires before the pipeline answers", async () => {
    const base = makeDeps();
    const github: ScanPipeline = () => new Promise(() => {});
    const watchdog: Watchdog = () => ({ fired: Promise.resolve(), dispose() {} });
    const r = await obtainScanReport(makeDeps({ scan: { ...base.scan, github, watchdog } }), { repo: "o/r" });
    expect(r).toMatchObject({ ok: false, code: "scan_failed" });
    expect((r as { message: string }).message.startsWith("scan_timeout")).toBe(true);
  });
});

describe("obtainScanReport: local", () => {
  const evidence = async () => ({
    signals: Object.fromEntries(SIGNAL_NAMES.map((n) => [n, { kind: "unknown" }])) as never,
    unknownReasons: {},
    warnings: [],
  });

  function localDeps(files: Record<string, string>) {
    const probe = memoryProbe(files);
    const base = makeDeps();
    const dirs: string[] = [];
    const local = counting((dir: string) => {
      dirs.push(dir);
      return createScanPipeline({
        evidence,
        files: createLocalRepoFiles(probe, dir),
        clock: base.scan.clock,
        limits: { maxDependencies: 300, concurrency: 2 },
      });
    });
    return { deps: makeDeps({ probe, scan: { ...base.scan, local } }), dirs, local };
  }

  it("scans a local checkout and reports local/<name>, never an absolute path", async () => {
    const { deps, dirs } = localDeps({ "/work/fx/package.json": fixture("checkout/package.json"), "/work/fx/package-lock.json": fixture("checkout/package-lock.json") });
    const r = await obtainScanReport(deps, { repo: "./fx" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(dirs).toEqual(["/work/fx"]);
    expect(r.report.repo).toBe("local/fx");
    expect(r.report.dependencies.map((d) => d.name).sort()).toEqual(["alpha-lib", "beta-lib", "gamma-lib"]);
    expect(JSON.stringify(r.report)).not.toContain("/work");
  });

  it("reports a missing package.json as scan_failed no_package_json", async () => {
    const { deps } = localDeps({ "/work/fx/other.txt": "x" });
    const r = await obtainScanReport(deps, { repo: "./fx" });
    expect(r).toMatchObject({ ok: false, code: "scan_failed" });
    expect((r as { message: string }).message.startsWith("no_package_json")).toBe(true);
  });

  it("rejects a missing directory and a file before any pipeline is built", async () => {
    const { deps, local } = localDeps({ "/work/f.txt": "x" });
    expect(await obtainScanReport(deps, { repo: "./nope" })).toMatchObject({ ok: false, code: "path_not_found" });
    expect(await obtainScanReport(deps, { repo: "./f.txt" })).toMatchObject({ ok: false, code: "not_a_directory" });
    expect(local.calls).toEqual([]);
  });
});

describe("obtainScanReport: ref rules and rejected input", () => {
  it("rejects a ref with a local path or a demo name, and a bad ref for GitHub", async () => {
    const deps = makeDeps({ probe: memoryProbe({ "/work/a/x": "" }), demoStore: fakeDemoStore({ pump: SAMPLE }) });
    expect(await obtainScanReport(deps, { repo: "./a", ref: "main" })).toMatchObject({ ok: false, code: "invalid_ref" });
    expect(await obtainScanReport(deps, { repo: "pump", ref: "main" })).toMatchObject({ ok: false, code: "invalid_ref" });
    expect(await obtainScanReport(deps, { repo: "o/r", ref: "a..b" })).toMatchObject({ ok: false, code: "invalid_ref" });
    expect(await obtainScanReport(deps, { repo: "nope" })).toMatchObject({ ok: false, code: "invalid_repo" });
    expect(deps.totalCalls()).toBe(0);
    expect((deps.demoStore as ReturnType<typeof fakeDemoStore>).asked).toEqual([]);
  });
});
