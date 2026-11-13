import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodeSourceFs } from "./source-fs.js";
import { createMemoryFs } from "./test-support/memory-fs.js";
import { createUsageSurface, syntaxDiagnosticCount } from "./usage-surface.js";
import ts from "typescript";

const tree = (name: string): string => fileURLToPath(new URL(`./__fixtures__/trees/${name}`, import.meta.url));
const real = createUsageSurface({ fs: createNodeSourceFs() });
const mem = (files: Record<string, string>, pkg = "P", opts = {}) =>
  createUsageSurface({ fs: createMemoryFs(files, ".", opts) })({ root: ".", package: pkg });

describe("fixture trees", () => {
  it("intersect-like: Flow-annotated file, decoy ignored", async () => {
    const r = await real({ root: tree("intersect-like"), package: "intersect" });
    expect(r.filesScanned).toBe(2);
    expect(r.warnings).toEqual([]);
    expect(r.importSites).toHaveLength(1);
    expect(r.importSites[0]).toMatchObject({ file: "src/Controllers/Db.js", form: "import-default" });
    expect(r.callSites.map((c) => [c.file, c.member, c.enclosing])).toEqual([
      ["src/Controllers/Db.js", "big", "src"],
      ["src/Controllers/Db.js", "", "src"],
    ]);
    expect(r.callSites.map((c) => c.line)).toEqual([8, 10]);
  });

  it("deep-diff-like: consumption detected, odd call not", async () => {
    const r = await real({ root: tree("deep-diff-like"), package: "deep-diff" });
    expect(r.filesScanned).toBe(3);
    expect(r.importSites).toHaveLength(3);
    expect(r.callSites).toHaveLength(5);
    expect(r.callSites.every((c) => c.enclosing === "test")).toBe(true);
    const odd = r.callSites.filter((c) => c.file === "spec/Odd.spec.js");
    expect(odd).toHaveLength(1);
    expect(odd[0]!.consumedAs).toBeUndefined();
    expect(r.callSites.filter((c) => c.consumedAs === "undefined-check")).toHaveLength(4);
  });

  it("declared-only: nothing found", async () => {
    const r = await real({ root: tree("declared-only"), package: "node-abort-controller" });
    expect(r.callSites).toEqual([]);
    expect(r.importSites).toEqual([]);
    expect(r.filesScanned).toBe(1);
  });

  it("a rerun gives an identical result", async () => {
    const a = await real({ root: tree("deep-diff-like"), package: "deep-diff" });
    const b = await real({ root: tree("deep-diff-like"), package: "deep-diff" });
    expect(b).toEqual(a);
  });
});

describe("tolerance and warnings", () => {
  it("finds sites in a file with Flow-only syntax and warns with the diagnostic count", async () => {
    const code = 'import x from "P";\nconst t = {| a: 1 |};\nx(1);\n';
    const r = await mem({ "a.js": code });
    expect(r.callSites).toHaveLength(1);
    expect(r.importSites).toHaveLength(1);
    const sf = ts.createSourceFile("a.js", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
    const n = syntaxDiagnosticCount(sf);
    expect(n).toBeGreaterThan(0);
    expect(r.warnings).toEqual([`a.js: ${n} syntax diagnostics`]);
  });

  it("warns once for a syntax error", async () => {
    const r = await mem({ "a.ts": "const x = ;" });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/^a\.ts: \d+ syntax diagnostics$/);
    expect(r.filesScanned).toBe(1);
  });

  it("an unreadable root gives zero files and one warning", async () => {
    const r = await real({ root: join(tmpdir(), "no-such-dir-exorcise"), package: "P" });
    expect(r.filesScanned).toBe(0);
    expect(r.warnings).toHaveLength(1);
  });

  it("skips oversized and unreadable files with a warning", async () => {
    const files = { "big.js": 'import x from "P"; x(1);', "bad.js": "x", "ok.js": 'import x from "P"; x(1);' };
    const r = await mem(files, "P", { oversized: { "big.js": 3 * 1024 * 1024 }, unreadable: ["bad.js"] });
    expect(r.filesScanned).toBe(1);
    expect(r.callSites.map((c) => c.file)).toEqual(["ok.js"]);
    expect(r.warnings).toEqual(["bad.js: skipped, could not be read", "big.js: skipped, larger than 2 MiB"]);
  });

  it("skips declaration files and other extensions", async () => {
    const src = 'import x from "P"; x(1);';
    const r = await mem({ "a.d.ts": src, "b.json": src, "c.mts": src });
    expect(r.filesScanned).toBe(1);
    expect(r.callSites.map((c) => c.file)).toEqual(["c.mts"]);
  });

  it("a symlink is not followed (in memory)", async () => {
    const r = await mem({ "a.js": 'import x from "P"; x(1);', "link.js": 'import x from "P"; x(1);' }, "P", { links: ["link.js"] });
    expect(r.callSites.map((c) => c.file)).toEqual(["a.js"]);
  });
});

describe("real temporary directory", () => {
  it("ignores node_modules and dist and does not follow a symlink", async () => {
    const dir = await mkdtemp(join(tmpdir(), "exorcise-us-"));
    try {
      const code = 'import x from "P";\nx(1);\n';
      for (const d of ["src", "node_modules/p", "dist", "build", "coverage", ".git"]) await mkdir(join(dir, d), { recursive: true });
      for (const f of ["src/a.js", "node_modules/p/i.js", "dist/o.js", "build/b.js", "coverage/c.js", ".git/g.js"]) {
        await writeFile(join(dir, f), code);
      }
      try {
        await mkdir(join(dir, "elsewhere"));
        await writeFile(join(dir, "elsewhere", "z.js"), code);
        await symlink(join(dir, "elsewhere"), join(dir, "src", "linkdir"));
      } catch {
        // No symlink permission on this platform: the rest of the test still holds.
      }
      const r = await real({ root: dir, package: "P" });
      const files = r.callSites.map((c) => c.file);
      expect(files).toContain("src/a.js");
      expect(files).toContain("elsewhere/z.js");
      expect(files.some((f) => f.includes("node_modules") || f.startsWith("dist") || f.startsWith("build") || f.includes("linkdir"))).toBe(false);
      expect(r.filesScanned).toBe(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
