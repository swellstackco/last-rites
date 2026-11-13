import { describe, expect, it } from "vitest";
import { PROOF_NAME_PATTERN as SKELETON_PATTERN } from "@graveyard-kit/skeleton/proof";
import config, {
  API_TARGET,
  CSP,
  PROOF_NAME_PATTERN,
  demoNameFromPath,
  demoProofs,
  demoSnapshots,
  isDemoName,
  proofNamesFromPath,
} from "../vite.config.js";

describe("vite config", () => {
  it("rejects unsafe demo names without touching the filesystem", () => {
    for (const bad of ["..", "a/b", "Jest", "", "a".repeat(65), "-x", "a.b", "a\\b"]) {
      expect(isDemoName(bad)).toBe(false);
    }
    for (const ok of ["jest", "parse-server", "a".repeat(64)]) expect(isDemoName(ok)).toBe(true);
  });

  it("maps request paths to demo names only when safe", () => {
    expect(demoNameFromPath("/demo/jest.json")).toBe("jest");
    expect(demoNameFromPath("/demo/jest.json?x=1")).toBe("jest");
    expect(demoNameFromPath("/demo/../package.json")).toBeUndefined();
    expect(demoNameFromPath("/demo/a/b.json")).toBeUndefined();
    expect(demoNameFromPath("/demo/Jest.json")).toBeUndefined();
    expect(demoNameFromPath("/demo/.json")).toBeUndefined();
    expect(demoNameFromPath("/other/jest.json")).toBeUndefined();
  });

  it("exposes the demo plugin with both hooks", () => {
    const plugin = demoSnapshots();
    expect(plugin.name).toBe("demo-snapshots");
    expect(typeof plugin.configureServer).toBe("function");
    expect(typeof plugin.generateBundle).toBe("function");
  });

  it("CSP forbids remote sources", () => {
    expect(CSP).toContain("default-src 'self'");
    expect(CSP).toContain("base-uri 'none'");
    expect(CSP).toContain("form-action 'self'");
    expect(CSP).not.toMatch(/https?:|\*|unsafe-/);
  });

  it("proxies /api to the local scan API and binds loopback", () => {
    expect(API_TARGET).toBe("http://127.0.0.1:24817");
    const server = (config as { server?: { host?: string; port?: number; strictPort?: boolean; proxy?: Record<string, { target: string }> } }).server;
    expect(server?.proxy?.["/api"]?.target).toBe("http://127.0.0.1:24817");
    expect(server?.host).toBe("127.0.0.1");
    expect(server?.port).toBe(5173);
    expect(server?.strictPort).toBe(true);
  });

  it("proof name pattern equals the skeleton's", () => {
    expect(PROOF_NAME_PATTERN.source).toBe(SKELETON_PATTERN.source);
  });

  it("proofNamesFromPath accepts only guarded pairs", () => {
    expect(proofNamesFromPath("/demo/proofs/parse-server/intersect.json")).toEqual({ repo: "parse-server", package: "intersect" });
    expect(proofNamesFromPath("/demo/proofs/parse-server/intersect.json?x=1")).toEqual({ repo: "parse-server", package: "intersect" });
    for (const bad of [
      "/demo/proofs/../intersect.json",
      "/demo/proofs/a/b/c.json",
      "/demo/proofs/Parse/intersect.json",
      "/demo/proofs//intersect.json",
      "/demo/proofs/parse-server/.json",
      `/demo/proofs/${"a".repeat(65)}/x.json`,
      "/demo/proofs/parse-server/..json",
      "/demo/proofs/candidates/parse-server/intersect.attempt1.js",
      "/demo/proofs/x.json",
    ]) {
      expect(proofNamesFromPath(bad)).toBeUndefined();
    }
  });

  it("never serves the candidates directory as a report", () => {
    // Candidates live two levels down (candidates/<repo>/<file>), so no guarded pair matches them.
    expect(proofNamesFromPath("/demo/proofs/candidates/parse-server/intersect.json")).toBeUndefined();
  });

  it("exposes the proof plugin with both hooks and registers it after the demo plugin", () => {
    const plugin = demoProofs();
    expect(plugin.name).toBe("demo-proofs");
    expect(typeof plugin.configureServer).toBe("function");
    expect(typeof plugin.generateBundle).toBe("function");
    const names = ((config as { plugins?: Array<{ name: string }> }).plugins ?? []).map((p) => p.name);
    expect(names.indexOf("demo-proofs")).toBeGreaterThan(names.indexOf("demo-snapshots"));
  });
});
