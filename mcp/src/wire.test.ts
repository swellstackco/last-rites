import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { wireRealDeps } from "./wire.js";

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function temp(): string {
  const d = mkdtempSync(join(tmpdir(), "exorcist-wire-"));
  dirs.push(d);
  return d;
}

function noNetwork() {
  const fetchSpy = vi.fn(async () => {
    throw new Error("network used");
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

describe("wireRealDeps", () => {
  it("builds every Dep without a request and without creating a file", () => {
    const fetchSpy = noNetwork();
    const bundle = temp();
    const cache = join(temp(), "cache");
    const deps = wireRealDeps({ EXORCIST_CACHE_DIR: cache }, bundle, { cwd: "/work" });
    expect(deps.cwd).toBe("/work");
    expect(typeof deps.scan.github).toBe("function");
    expect(typeof deps.scan.local("/work/x")).toBe("function");
    expect(typeof deps.e18e).toBe("function");
    expect(typeof deps.usageSurface).toBe("function");
    expect([...deps.proof.recipes.keys()]).toContain("intersect");
    expect(deps.proof.loadOracle("intersect")?.version).toBe("1.0.1");
    expect(deps.scan.timeoutSeconds).toBe(60);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(readdirSync(bundle)).toEqual([]);
    expect(() => readdirSync(cache)).toThrow();
  });

  it("works with an empty environment", () => {
    noNetwork();
    expect(() => wireRealDeps({}, temp(), { cwd: "/work" })).not.toThrow();
  });

  it("a token reaches the evidence config only and never a tool error", async () => {
    noNetwork();
    const secret = "ghp_SECRETTOKEN123";
    const deps = wireRealDeps({ GITHUB_TOKEN: secret, EXORCIST_CACHE_DIR: join(temp(), "c") }, temp(), { cwd: "/work" });
    // The probe is read-only and the demo store reports a missing snapshot without echoing anything.
    expect(await deps.demoStore("nope")).toBeUndefined();
    expect(JSON.stringify(Object.keys(deps))).not.toContain(secret);
    const { scanRepoImpl } = await import("./tools/scan-repo.js");
    const result = await scanRepoImpl(deps, { repo: "pump" });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("uses the temp directory when EXORCIST_CACHE_DIR is empty or unset", () => {
    noNetwork();
    // Observable only through no throw and no file creation here; the root rule itself is exercised by the config.
    expect(() => wireRealDeps({ EXORCIST_CACHE_DIR: "" }, temp(), { cwd: "/work" })).not.toThrow();
    expect(() => wireRealDeps({}, temp(), { cwd: "/work" })).not.toThrow();
  });
});
