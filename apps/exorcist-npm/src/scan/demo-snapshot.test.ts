import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SCAN_API_CONFIG } from "./api/config.js";
import { DEMO_NAME_PATTERN } from "./api/demo-store.js";
import { DEMO_REPOS } from "./demo-list.js";
import { runDemoSnapshots, type DemoFs, type DemoRepo } from "./demo-snapshot.js";
import type { ScanPipeline } from "./pipeline.js";
import { serializeReport } from "./report.js";
import type { RepoInput, ScanOutcome, ScanReport } from "./types.js";

function reportFor(input: RepoInput): ScanReport {
  return {
    repo: `${input.owner}/${input.repo}`,
    ref: input.ref ?? "HEAD",
    scannedAt: "2026-01-01T00:00:00.000Z",
    dependencies: [],
    skipped: [],
    warnings: [],
    summary: { total: 0, skipped: 0, alive: 0, ailing: 0, dying: 0, dead: 0 },
  };
}

/** Fails (ok: false) for repos named in `failing`, succeeds otherwise. */
function fakePipeline(failing: string[] = []): { pipeline: ScanPipeline; calls: RepoInput[] } {
  const calls: RepoInput[] = [];
  const pipeline: ScanPipeline = async (input) => {
    calls.push(input);
    if (failing.includes(input.repo)) {
      return { ok: false, error: { code: "no_package_json", message: "none" } } as ScanOutcome;
    }
    return { ok: true, report: reportFor(input) };
  };
  return { pipeline, calls };
}

interface MemFs extends DemoFs {
  files: Map<string, string>;
  ops: string[];
}

function memFs(opts: { failWrite?: boolean; failRename?: boolean } = {}): MemFs {
  const files = new Map<string, string>();
  const ops: string[] = [];
  return {
    files,
    ops,
    async mkdir() {},
    async writeFile(path, text) {
      ops.push(`write ${path}`);
      files.set(path, text);
      if (opts.failWrite) throw new Error("disk full");
    },
    async rename(from, to) {
      ops.push(`rename ${from} -> ${to}`);
      if (opts.failRename) throw new Error("rename failed");
      const text = files.get(from);
      files.delete(from);
      if (text !== undefined) files.set(to, text);
    },
    async rm(path) {
      ops.push(`rm ${path}`);
      files.delete(path);
    },
  };
}

const list: DemoRepo[] = [
  { name: "a", owner: "o", repo: "a" },
  { name: "b", owner: "o", repo: "b", ref: "v1" },
];

describe("runDemoSnapshots", () => {
  it("writes canonical text through a temp file, then renames", async () => {
    const fs = memFs();
    const { pipeline, calls } = fakePipeline();
    const logs: string[] = [];
    const summary = await runDemoSnapshots(list, { pipeline, fs, demoDir: "/d", log: (l) => logs.push(l) });
    expect(summary).toEqual({ written: ["a", "b"], failed: [] });
    expect(calls).toEqual([
      { owner: "o", repo: "a" },
      { owner: "o", repo: "b", ref: "v1" },
    ]);
    expect(fs.ops.slice(0, 2)).toEqual(["write /d/.a.json.1.tmp", "rename /d/.a.json.1.tmp -> /d/a.json"]);
    expect(fs.files.get("/d/a.json")).toBe(serializeReport(reportFor({ owner: "o", repo: "a" })));
    expect([...fs.files.keys()].sort()).toEqual(["/d/a.json", "/d/b.json"]);
  });

  it("leaves the old file on a failed scan, logs the code and continues", async () => {
    const fs = memFs();
    fs.files.set("/d/a.json", "OLD");
    const { pipeline } = fakePipeline(["a"]);
    const logs: string[] = [];
    const summary = await runDemoSnapshots(list, { pipeline, fs, demoDir: "/d", log: (l) => logs.push(l) });
    expect(fs.files.get("/d/a.json")).toBe("OLD");
    expect(summary.written).toEqual(["b"]);
    expect(summary.failed).toEqual([{ name: "a", reason: "no_package_json" }]);
    expect(logs).toContain("o/a: no_package_json");
  });

  it.each([
    ["write", { failWrite: true }],
    ["rename", { failRename: true }],
  ] as const)("removes the temp file when %s fails and keeps the old file", async (_label, opts) => {
    const fs = memFs(opts);
    fs.files.set("/d/a.json", "OLD");
    const { pipeline } = fakePipeline();
    const logs: string[] = [];
    const summary = await runDemoSnapshots([list[0]!], { pipeline, fs, demoDir: "/d", log: (l) => logs.push(l) });
    expect(fs.ops).toContain("rm /d/.a.json.1.tmp");
    expect(fs.files.get("/d/a.json")).toBe("OLD");
    expect(fs.files.has("/d/.a.json.1.tmp")).toBe(false);
    expect(summary.failed).toEqual([{ name: "a", reason: "write_failed" }]);
    expect(logs).toContain("a: write failed");
  });

  it("skips an invalid name without scanning or writing", async () => {
    const fs = memFs();
    const { pipeline, calls } = fakePipeline();
    const logs: string[] = [];
    const summary = await runDemoSnapshots(
      [{ name: "Bad/Name", owner: "o", repo: "x" }, list[0]!],
      { pipeline, fs, demoDir: "/d", log: (l) => logs.push(l) },
    );
    expect(calls).toHaveLength(1);
    expect(logs).toContain("Bad/Name: invalid demo name");
    expect(summary.failed).toEqual([{ name: "Bad/Name", reason: "invalid_name" }]);
    expect(summary.written).toEqual(["a"]);
  });

  it("failed count decides the exit status", async () => {
    const ok = await runDemoSnapshots(list, { ...{ pipeline: fakePipeline().pipeline }, fs: memFs(), demoDir: "/d", log: () => {} });
    const bad = await runDemoSnapshots(list, { pipeline: fakePipeline(["b"]).pipeline, fs: memFs(), demoDir: "/d", log: () => {} });
    expect(ok.failed.length > 0 ? 1 : 0).toBe(0);
    expect(bad.failed.length > 0 ? 1 : 0).toBe(1);
  });

  it("works against a real temp directory and cleans up after itself", async () => {
    const dir = await mkdtemp(join(tmpdir(), "demo-snap-"));
    try {
      const demoDir = join(dir, "demo");
      const fs: DemoFs = {
        mkdir: async (d) => void (await mkdir(d, { recursive: true })),
        writeFile: (p, t) => writeFile(p, t, "utf8"),
        rename,
        rm: (p) => rm(p, { force: true }),
      };
      const summary = await runDemoSnapshots(list, { pipeline: fakePipeline().pipeline, fs, demoDir, log: () => {} });
      expect(summary.failed).toEqual([]);
      expect((await readdir(demoDir)).sort()).toEqual(["a.json", "b.json"]);
      expect(await readFile(join(demoDir, "a.json"), "utf8")).toBe(serializeReport(reportFor({ owner: "o", repo: "a" })));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("DEMO_REPOS names are valid and unique, and include the fixture repository", () => {
    const names = DEMO_REPOS.map((r) => r.name);
    for (const n of names) expect(DEMO_NAME_PATTERN.test(n)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    expect(DEMO_REPOS.some((r) => r.owner === "mafintosh" && r.repo === "pump")).toBe(true);
  });

  it("the default demo directory is <repo root>/demo", async () => {
    const { fileURLToPath } = await import("node:url");
    const fromSnapshot = fileURLToPath(new URL("../../../../demo/", import.meta.url));
    expect(DEFAULT_SCAN_API_CONFIG.demoDir).toBe(fromSnapshot);
  });
});
