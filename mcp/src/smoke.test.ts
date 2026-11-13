/** Static smoke tests for the kiro-integration (Requirements 1.3, 1.8, 2.4, 13.7, 18.1). Nothing is started. */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MCP_SRC = join(ROOT, "mcp/src");
const SKIP_DIRS = new Set(["node_modules", "dist", "__fixtures__", ".git", ".cache"]);

function walk(dir: string, accept: (file: string) => boolean): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (SKIP_DIRS.has(n)) return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p, accept) : accept(p) ? [p] : [];
  });
}

const rel = (f: string): string => relative(ROOT, f);
const isTest = (f: string): boolean => /\.test\.ts$/.test(f);
const mcpSources = walk(MCP_SRC, (f) => f.endsWith(".ts") && !isTest(f));
const read = (f: string): string => readFileSync(f, "utf8");

// The only readers of process state: the server entry, the shared hook wrapper (used by the four hook entry files).
const PROCESS_READERS = new Set(["mcp/src/server.ts", "mcp/src/hooks/entry.ts"]);

describe("kiro-integration static checks", () => {
  it("process.env, process.argv and process.stdin are read only by the entry points", () => {
    const offenders = mcpSources.filter((f) => /process\s*\.\s*(env|argv|stdin)\b/.test(read(f))).map(rel);
    for (const o of offenders) expect(PROCESS_READERS.has(o), `${o} reads process state`).toBe(true);
    expect(offenders).toContain("mcp/src/server.ts");
  });

  it("wire.ts receives the environment instead of reading it", () => {
    expect(read(join(MCP_SRC, "wire.ts"))).not.toMatch(/process\s*\.\s*env/);
  });

  it("skeleton imports nothing from mcp, power or apps", () => {
    const files = walk(join(ROOT, "skeleton"), (f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = read(f);
      for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
        const spec = m[1] as string;
        expect(spec, `${rel(f)} imports ${spec}`).not.toMatch(/exorcist-(mcp|power|npm|actions)|(^|\/)(mcp|power|apps)(\/|$)/);
      }
    }
  });

  it("mcp/package.json pins exact versions and declares no LLM client", () => {
    const pkg = JSON.parse(read(join(ROOT, "mcp/package.json"))) as Record<string, Record<string, string>>;
    for (const group of ["dependencies", "devDependencies"]) {
      for (const [name, version] of Object.entries(pkg[group] ?? {})) {
        if (name.startsWith("@graveyard-kit/")) continue;
        expect(version, `${name} version`).toMatch(/^\d+\.\d+\.\d+$/);
      }
    }
    const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const n of all) expect(n).not.toMatch(/openai|anthropic|langchain|bedrock|gemini|llm|ollama|cohere|mistral/i);
  });

  it("no test file mentions the sibling checkout", () => {
    const tests = walk(MCP_SRC, isTest).filter((f) => !f.endsWith("smoke.test.ts"));
    expect(tests.length).toBeGreaterThan(0);
    for (const f of tests) expect(read(f), rel(f)).not.toContain("lastrites-work");
  });

  it("createExorcistServer imports nothing from node:fs", () => {
    expect(read(join(MCP_SRC, "create-server.ts"))).not.toMatch(/node:fs|from\s+["']fs["']/);
  });

  it("the power server/ directory is ignored by git", () => {
    expect(execFileSync("git", ["check-ignore", "power/server/x"], { cwd: ROOT, encoding: "utf8" }).trim()).toBe("power/server/x");
  });

  it("has exactly the four hook files and the two agent files plus prompts/", () => {
    expect(readdirSync(join(ROOT, ".kiro/hooks")).filter((n) => !n.startsWith(".")).sort()).toEqual([
      "candidate-proof-on-save.json",
      "check-on-stop.json",
      "death-score-monotonic-on-save.json",
      "scan-deps-on-save.json",
    ]);
    expect(readdirSync(join(ROOT, ".kiro/agents")).filter((n) => !n.startsWith(".")).sort()).toEqual(["coroner.json", "exorcist.json", "prompts"]);
  });

  it("root workspaces and vitest include are as required", () => {
    const pkg = JSON.parse(read(join(ROOT, "package.json"))) as { workspaces: string[] };
    expect(pkg.workspaces).toEqual(["skeleton", "apps/*", "mcp", "power"]);
    expect(read(join(ROOT, "vitest.config.ts"))).toContain("mcp/src/**/*.test.ts");
  });
});
