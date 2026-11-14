import { describe, it, expect } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createMemoryFs } from "@last-rites/exorcist-npm/programmatic/testing";
import { createUsageSurface } from "@last-rites/exorcist-npm/programmatic";
import { parseProofReport } from "@last-rites/skeleton/proof";
import { makeDeps, memoryProbe } from "../test-support/fakes.js";
import { loadTree } from "../test-support/trees.js";
import { usageSurfaceImpl } from "./usage-surface.js";

function depsFor(tree: string) {
  const files = loadTree(tree);
  const probe = memoryProbe(Object.fromEntries(Object.entries(files).map(([k, v]) => [`/work/${tree}/${k}`, v])));
  return makeDeps({ probe, usageSurface: createUsageSurface({ fs: createMemoryFs(files, `/work/${tree}`) }) });
}

const text = (r: CallToolResult, i = 0) => (r.content[i] as { text: string }).text;

describe("usage_surface", () => {
  it("lists call sites and import sites as a proof report with no attempts", async () => {
    const r = await usageSurfaceImpl(depsFor("intersect-like"), { path: "./intersect-like", package: "intersect" });
    expect(r.isError).toBeFalsy();
    expect(r.content).toHaveLength(1);
    const p = parseProofReport(text(r));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.report.attempts).toEqual([]);
    expect(p.report.repo).toBe("intersect-like");
    expect(p.report.package).toBe("intersect");
    expect(p.report.callSites.length).toBeGreaterThanOrEqual(2);
    expect(p.report.importSites.length).toBeGreaterThanOrEqual(1);
    expect(p.report.filesScanned).toBeGreaterThan(0);
    expect(text(r)).not.toContain("/work");
  });

  it("succeeds with empty lists for a declared-only tree", async () => {
    const r = await usageSurfaceImpl(depsFor("declared-only"), { path: "./declared-only", package: "node-abort-controller" });
    expect(r.isError).toBeFalsy();
    const p = parseProofReport(text(r));
    expect(p.ok && p.report.callSites).toEqual([]);
  });

  it("succeeds when no file was scanned", async () => {
    const d = makeDeps({ probe: memoryProbe({ "/work/empty/x.txt": "" }) });
    const r = await usageSurfaceImpl(d, { path: "./empty", package: "intersect" });
    expect(r.isError).toBeFalsy();
    const p = parseProofReport(text(r));
    expect(p.ok && p.report.filesScanned).toBe(0);
  });

  it("adds a warnings item capped at 50 with a trailing count", async () => {
    const warnings = Array.from({ length: 53 }, (_, i) => `w${i}`);
    const d = makeDeps({
      probe: memoryProbe({ "/work/x/a.js": "" }),
      usageSurface: async (i) => ({ package: i.package, filesScanned: 1, callSites: [], importSites: [], warnings }),
    });
    const r = await usageSurfaceImpl(d, { path: "./x", package: "intersect" });
    expect(r.content).toHaveLength(2);
    const w = JSON.parse(text(r, 1)).warnings as string[];
    expect(w).toHaveLength(51);
    expect(w[0]).toBe("w0");
    expect(w[49]).toBe("w49");
    expect(w[50]).toBe("... and 3 more");
  });

  it("uses exactly 50 warnings without a trailer", async () => {
    const warnings = Array.from({ length: 50 }, (_, i) => `w${i}`);
    const d = makeDeps({
      probe: memoryProbe({ "/work/x/a.js": "" }),
      usageSurface: async (i) => ({ package: i.package, filesScanned: 1, callSites: [], importSites: [], warnings }),
    });
    const r = await usageSurfaceImpl(d, { path: "./x", package: "intersect" });
    expect(JSON.parse(text(r, 1)).warnings).toEqual(warnings);
  });

  it("rejects bad input before calling the usage surface", async () => {
    const d = depsFor("intersect-like");
    for (const [args, code] of [
      [{ path: "./missing", package: "intersect" }, "path_not_found"],
      [{ path: "./intersect-like/package.json", package: "intersect" }, "not_a_directory"],
      [{ path: "./intersect-like", package: "Bad" }, "invalid_package"],
      [{ path: 5, package: "intersect" }, "invalid_path"],
    ] as const) {
      const r = await usageSurfaceImpl(d, args as never);
      expect(JSON.parse(text(r)).error.code).toBe(code);
    }
    expect(d.counts.usageSurface.calls).toEqual([]);
  });
});
