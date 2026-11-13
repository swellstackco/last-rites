// Static wiring checks for the graveyard-ui spec (Node, no DOM, no network).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = dirname(fileURLToPath(import.meta.url));
const webDir = dirname(srcDir);
const repoRoot = join(webDir, "..", "..");

function walk(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(root, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Module specifiers of every import/export-from, with a flag for type-only statements. */
function specifiers(text: string): Array<{ spec: string; typeOnly: boolean }> {
  const out: Array<{ spec: string; typeOnly: boolean }> = [];
  const code = stripComments(text);
  for (const m of code.matchAll(/^\s*(import|export)\s+(type\s+)?([^;]*?)\bfrom\s*["']([^"']+)["']/gm)) {
    out.push({ spec: m[4] ?? "", typeOnly: m[2] !== undefined });
  }
  for (const m of code.matchAll(/^\s*import\s*["']([^"']+)["']/gm)) out.push({ spec: m[1] ?? "", typeOnly: false });
  for (const m of code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) out.push({ spec: m[1] ?? "", typeOnly: false });
  return out;
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("graveyard-ui wiring (static)", () => {
  it("the import scanner works", () => {
    const sample = `import type { A } from "./a.js";\nimport { b } from "pkg";\nexport type { C } from "./c.js";\nexport { d } from "./d.js";\nimport "side";\n// import { x } from "commented";`;
    expect(specifiers(sample)).toEqual([
      { spec: "./a.js", typeOnly: true },
      { spec: "pkg", typeOnly: false },
      { spec: "./c.js", typeOnly: true },
      { spec: "./d.js", typeOnly: false },
      { spec: "side", typeOnly: false },
    ]);
  });

  it("no file under skeleton/ imports a path under apps/", () => {
    const files = walk(join(repoRoot, "skeleton")).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(10);
    const hits: string[] = [];
    for (const file of files) {
      for (const { spec } of specifiers(readFileSync(file, "utf8"))) {
        const isApp = /(^|\/)apps(\/|$)/.test(spec) || spec.startsWith("@graveyard-kit/exorcist");
        if (isApp) hits.push(`${relative(repoRoot, file)} -> ${spec}`);
      }
    }
    expect(hits).toEqual([]);
  });

  describe("package.json files changed by this spec", () => {
    const manifests = {
      web: readJson(join(webDir, "package.json")),
      skeleton: readJson(join(repoRoot, "skeleton", "package.json")),
      exorcistNpm: readJson(join(repoRoot, "apps", "exorcist-npm", "package.json")),
    };
    const depsOf = (manifest: Record<string, unknown>): Record<string, string> => ({
      ...((manifest["dependencies"] as Record<string, string> | undefined) ?? {}),
      ...((manifest["devDependencies"] as Record<string, string> | undefined) ?? {}),
    });
    const LLM = /^(openai|@anthropic-ai\/.*|anthropic|@google\/generative-ai|@google\/genai|cohere-ai|ai|@ai-sdk\/.*|langchain|@langchain\/.*|llamaindex|@aws-sdk\/client-bedrock.*|@mistralai\/.*|ollama|groq-sdk|replicate|@huggingface\/.*)$/;

    it("declare no LLM client dependency", () => {
      for (const [name, manifest] of Object.entries(manifests)) {
        const llm = Object.keys(depsOf(manifest)).filter((dep) => LLM.test(dep));
        expect({ name, llm }).toEqual({ name, llm: [] });
      }
      expect(LLM.test("openai")).toBe(true);
      expect(LLM.test("@anthropic-ai/sdk")).toBe(true);
      expect(LLM.test("vite")).toBe(false);
    });

    it("pin every dependency added to exorcist-web to an exact version", () => {
      const skeletonDeps = depsOf(manifests.skeleton);
      for (const [dep, version] of Object.entries(depsOf(manifests.web))) {
        if (dep.startsWith("@graveyard-kit/")) {
          expect({ dep, version }).toEqual({ dep, version: "*" }); // workspace links
        } else if (dep === "vitest" || dep === "fast-check") {
          // "as in the other packages"; proof-harness 1.1 pinned skeleton's fast-check exactly, so compare without a range prefix
          expect({ dep, version: version.replace(/^\^/, "") }).toEqual({ dep, version: skeletonDeps[dep]?.replace(/^\^/, "") });
        } else {
          expect({ dep, exact: /^\d+\.\d+\.\d+$/.test(version) }).toEqual({ dep, exact: true });
        }
      }
      const web = depsOf(manifests.web);
      expect(web["vite"]).toBe("5.4.21");
      expect(web["jsdom"]).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("exorcist-web has no runtime dependency beyond the two workspace packages", () => {
      expect(Object.keys((manifests.web["dependencies"] as Record<string, string> | undefined) ?? {}).sort()).toEqual([
        "@graveyard-kit/exorcist-npm",
        "@graveyard-kit/skeleton",
      ]);
    });

    it("the exorcist-npm exports map contains only ./report", () => {
      expect(manifests.exorcistNpm["exports"]).toEqual({ "./report": "./src/scan/report.ts" });
    });

    it("the skeleton exports keep . and ./death-score and add only the graveyard and proof paths", () => {
      expect(manifests.skeleton["exports"]).toEqual({
        ".": "./src/death-score/index.ts",
        "./death-score": "./src/death-score/index.ts",
        "./graveyard": "./src/graveyard/index.ts",
        "./graveyard/testing": "./src/graveyard/testing.ts",
        // added by proof-harness 1.1
        "./proof": "./src/proof/index.ts",
        "./proof/runner": "./src/proof/runner/index.ts",
        "./proof/testing": "./src/proof/testing.ts",
      });
    });
  });

  it("report.ts has runtime imports only from @graveyard-kit/skeleton and ./types.js", () => {
    const text = readFileSync(join(repoRoot, "apps", "exorcist-npm", "src", "scan", "report.ts"), "utf8");
    const runtime = specifiers(text)
      .filter((s) => !s.typeOnly)
      .map((s) => s.spec);
    expect(runtime.length).toBeGreaterThan(0);
    for (const spec of runtime) expect(["@graveyard-kit/skeleton", "./types.js"]).toContain(spec);
  });

  it("the web src imports no Node built-in outside test files", () => {
    const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
    const files = walk(srcDir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThan(20);
    const hits: string[] = [];
    for (const file of files) {
      for (const { spec } of specifiers(readFileSync(file, "utf8"))) {
        if (builtins.has(spec) || spec.startsWith("node:")) hits.push(`${relative(srcDir, file)} -> ${spec}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("the root package.json keeps test and typecheck", () => {
    const scripts = readJson(join(repoRoot, "package.json"))["scripts"] as Record<string, string>;
    expect(scripts["test"]).toBeTruthy();
    expect(scripts["typecheck"]).toBeTruthy();
  });

  // Requirement 23.1 wants a root `dev` script. Task 9.3 adds it and task 8.10 must not start Phase 9,
  // so this stays a todo until 9.3 lands; then replace it with `expect(scripts["dev"])...`.
  it.todo("the root package.json has a dev script (added by task 9.3)");
});
