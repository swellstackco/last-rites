import { describe, expect, it } from "vitest";
import config, { API_TARGET, CSP, demoNameFromPath, demoSnapshots, isDemoName } from "../vite.config.js";

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
    expect(API_TARGET).toBe("http://127.0.0.1:27431");
    const server = (config as { server?: { host?: string; port?: number; strictPort?: boolean; proxy?: Record<string, { target: string }> } }).server;
    expect(server?.proxy?.["/api"]?.target).toBe("http://127.0.0.1:27431");
    expect(server?.host).toBe("127.0.0.1");
    expect(server?.port).toBe(5173);
    expect(server?.strictPort).toBe(true);
  });
});
