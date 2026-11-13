/** Static smoke tests for the proof harness (Requirements 10.10, 11.1 to 11.4, 11.6, 17.1). No network, nothing is started. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as scanApi from "../scan/index.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const APP = join(ROOT, "apps/exorcist-npm");
const SKELETON = join(ROOT, "skeleton");

const SKIP_DIRS = new Set(["node_modules", "dist", "__fixtures__", ".git", ".cache"]);

function walk(dir: string, accept: (file: string) => boolean): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (SKIP_DIRS.has(n)) return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p, accept) : accept(p) ? [p] : [];
  });
}

const tsFiles = (dir: string): string[] => walk(dir, (f) => f.endsWith(".ts"));

function specifiers(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) out.push(m[1] as string);
  return out;
}

const readJson = (path: string): Record<string, Record<string, string> | undefined> =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, Record<string, string> | undefined>;

describe("proof harness static smoke checks", () => {
  it("skeleton/src/proof/index.ts does not reach fast-check, Node or any runner/ file through its import graph", () => {
    const entry = join(SKELETON, "src/proof/index.ts");
    const seen = new Set<string>();
    const queue = [entry];
    const bad: string[] = [];
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      if (file.includes(`${join("src", "proof", "runner")}`) || file.endsWith("testing.ts")) bad.push(`reaches ${relative(ROOT, file)}`);
      for (const s of specifiers(file)) {
        if (s === "fast-check" || s.startsWith("fast-check/") || s.startsWith("node:")) bad.push(`${relative(ROOT, file)}: ${s}`);
        else if (s.startsWith(".")) queue.push(resolve(dirname(file), s.replace(/\.js$/, ".ts")));
      }
    }
    expect(seen.size).toBeGreaterThan(3); // the walk really followed imports
    expect(bad).toEqual([]);
  });

  it("no file under /skeleton imports anything under apps/", () => {
    const files = tsFiles(SKELETON);
    expect(files.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const f of files) {
      for (const s of specifiers(f)) if (/exorcist|(^|\/)apps(\/|$)/.test(s)) bad.push(`${relative(ROOT, f)}: ${s}`);
    }
    expect(bad).toEqual([]);
  });

  it("no test file names the sibling working copy", () => {
    // Built from two halves so that this file does not contain the string itself.
    const needle = ["lastrites", "work"].join("-");
    const bad: string[] = [];
    for (const dir of [join(ROOT, "skeleton"), join(ROOT, "apps")]) {
      for (const f of walk(dir, (p) => /\.(test|spec)\.ts$/.test(p) || p.includes(`${"/"}test-support${"/"}`))) {
        if (readFileSync(f, "utf8").includes(needle)) bad.push(relative(ROOT, f));
      }
    }
    expect(bad).toEqual([]);
  });

  it("intersect, deep-diff and typescript are exact in apps/exorcist-npm/package.json", () => {
    const pkg = readJson(join(APP, "package.json"));
    const all = { ...pkg["dependencies"], ...pkg["devDependencies"] };
    expect(all["intersect"]).toBe("1.0.1");
    expect(all["deep-diff"]).toBe("1.0.2");
    expect(all["typescript"]).toBe("5.9.3");
  });

  it("fast-check is a skeleton dependency, not only a dev dependency", () => {
    const pkg = readJson(join(SKELETON, "package.json"));
    expect(pkg["dependencies"]?.["fast-check"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg["devDependencies"]?.["fast-check"]).toBeUndefined();
  });

  it("no package.json declares an LLM client", () => {
    const llm = /^(openai|anthropic|@anthropic-ai\/.*|@aws-sdk\/client-bedrock.*|@google\/generative-ai|@google-cloud\/vertexai|langchain|@langchain\/.*|ollama|cohere-ai|@mistralai\/.*|groq-sdk|replicate|ai|@ai-sdk\/.*|llamaindex|@huggingface\/.*)$/;
    const manifests = [
      join(ROOT, "package.json"),
      join(SKELETON, "package.json"),
      ...walk(join(ROOT, "apps"), (f) => f.endsWith("/package.json")),
    ];
    const bad: string[] = [];
    for (const m of manifests) {
      const pkg = readJson(m);
      for (const k of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        for (const name of Object.keys(pkg[k] ?? {})) if (llm.test(name)) bad.push(`${relative(ROOT, m)}: ${name}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("process.argv and process.env are read only in cli.ts within the proof code", () => {
    const files = [...tsFiles(join(APP, "src/exorcise")), ...tsFiles(join(SKELETON, "src/proof"))];
    const bad: string[] = [];
    for (const f of files) {
      if (f.endsWith("/exorcise/cli.ts") || f.endsWith("smoke.test.ts")) continue;
      if (/process\s*\.\s*(argv|env)\b/.test(readFileSync(f, "utf8"))) bad.push(relative(ROOT, f));
    }
    expect(bad).toEqual([]);
  });

  it("exorcise is an npm script", () => {
    const pkg = readJson(join(APP, "package.json"));
    expect(pkg["scripts"]?.["exorcise"]).toBe("vite-node src/exorcise/cli.ts --");
  });

  it("the scan exports are unchanged", () => {
    expect(Object.keys(scanApi).sort()).toEqual(["createScanPipeline", "inventory", "parseReport", "serializeReport"]);
  });
});
