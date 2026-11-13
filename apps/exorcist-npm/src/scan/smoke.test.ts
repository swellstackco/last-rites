/** Static smoke tests for the scanner (Requirements 10.2, 11.7, 12.1 to 12.6). No network, nothing is started. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as evidenceApi from "../evidence/index.js";
import * as scanApi from "./index.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const APP = join(ROOT, "apps/exorcist-npm");
const SCAN = join(APP, "src/scan");

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === "node_modules" || n === "dist" || n === "__fixtures__") return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith(".ts") ? [p] : [];
  });
}

function specifiers(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) out.push(m[1] as string);
  return out;
}

const isTest = (f: string): boolean => f.endsWith(".test.ts");
const isSupport = (f: string): boolean => f.includes("/test-support/");
const rel = (f: string): string => relative(APP, f);

describe("scanner static smoke checks", () => {
  it("imports /skeleton only through @graveyard-kit/skeleton", () => {
    const bad: string[] = [];
    for (const f of tsFiles(SCAN)) {
      for (const s of specifiers(f)) {
        if (s === "@graveyard-kit/skeleton") continue;
        if (s.startsWith("@graveyard-kit/skeleton/") || /(^|\/)skeleton(\/|$)/.test(s)) bad.push(`${rel(f)}: ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("no file under /skeleton imports anything under apps/exorcist-npm", () => {
    const files = tsFiles(join(ROOT, "skeleton"));
    expect(files.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const f of files) {
      for (const s of specifiers(f)) if (/exorcist-npm|(^|\/)apps(\/|$)/.test(s)) bad.push(`${f}: ${s}`);
    }
    expect(bad).toEqual([]);
  });

  it("production scan modules import evidence internals only from http/cache, http/resilient-client and http/fetch-json", () => {
    const allowed = new Set(["http/cache.js", "http/resilient-client.js", "http/fetch-json.js", "index.js"]);
    const bad: string[] = [];
    for (const f of tsFiles(SCAN)) {
      if (isTest(f) || isSupport(f)) continue;
      for (const s of specifiers(f)) {
        const m = /(?:^|\/)evidence\/(.+)$/.exec(s);
        if (m && !allowed.has(m[1] as string)) bad.push(`${rel(f)}: ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("evidence/index.ts exports are unchanged", () => {
    expect(Object.keys(evidenceApi).sort()).toEqual(
      ["DEFAULT_CONFIG", "EvidenceConfigError", "EvidenceInputError", "HttpClientError", "configFromEnv", "createEvidenceStage"].sort(),
    );
  });

  it("no package.json declares an LLM client dependency", () => {
    const llm =
      /^(openai|anthropic|@anthropic-ai\/.*|@aws-sdk\/client-bedrock.*|@google\/generative-ai|@google-cloud\/vertexai|langchain|@langchain\/.*|ollama|cohere-ai|@mistralai\/.*|groq-sdk|replicate|ai|@ai-sdk\/.*|llamaindex|@huggingface\/.*)$/;
    for (const p of [join(ROOT, "package.json"), join(APP, "package.json")]) {
      const pkg = JSON.parse(readFileSync(p, "utf8")) as Record<string, Record<string, string> | undefined>;
      const names = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap((k) =>
        Object.keys(pkg[k] ?? {}),
      );
      expect(names.filter((n) => llm.test(n))).toEqual([]);
    }
  });

  it("runtime dependencies of the app are exact-pinned (workspace links excepted)", () => {
    const pkg = JSON.parse(readFileSync(join(APP, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
    for (const [name, v] of Object.entries(pkg.dependencies ?? {})) {
      if (name.startsWith("@graveyard-kit/")) continue;
      expect(v, name).toMatch(/^[0-9]+(\.[0-9]+)*$/);
    }
  });

  it("scan/index.ts exports inventory and no replacement or proof stage", () => {
    const keys = Object.keys(scanApi);
    expect(keys).toEqual(expect.arrayContaining(["inventory", "createScanPipeline", "serializeReport", "parseReport"]));
    for (const k of ["replacement", "proof"]) expect(keys).not.toContain(k);
  });

  it("process.env is read only in the two main() functions; PORT only through parsePortEnv", () => {
    const envUsers: string[] = [];
    const portUsers: string[] = [];
    for (const f of tsFiles(SCAN)) {
      if (isTest(f)) continue;
      const text = readFileSync(f, "utf8");
      // The VITEST guard and the recorder's guard are the only allowed non-main reads.
      const stripped = text.replace(/process\.env\["VITEST"\]/g, "");
      if (/process\.env/.test(stripped)) envUsers.push(rel(f));
      if (/\bPORT\b/.test(text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""))) portUsers.push(rel(f));
    }
    expect(envUsers.sort()).toEqual(["src/scan/demo-snapshot.ts", "src/scan/server.ts"]);
    // server.ts passes env["PORT"] to parsePortEnv; config.ts defines it; nothing else mentions PORT.
    for (const p of portUsers) expect(["src/scan/api/config.ts", "src/scan/server.ts"]).toContain(p);
    expect(readFileSync(join(SCAN, "server.ts"), "utf8")).toContain('parsePortEnv(env["PORT"])');
  });

  it("the three npm scripts exist", () => {
    const pkg = JSON.parse(readFileSync(join(APP, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["demo-snapshot"]).toBe("vite-node src/scan/demo-snapshot.ts --");
    expect(pkg.scripts["record-scan-fixtures"]).toBe("vite-node src/scan/test-support/record-scan-fixtures.ts --");
    expect(pkg.scripts["serve"]).toBe("vite-node src/scan/serve-entry.ts");
  });

  it("no test starts demo-snapshot or server as an entry point", () => {
    const bad: string[] = [];
    for (const f of tsFiles(APP)) {
      if (!isTest(f) || f.endsWith("smoke.test.ts")) continue;
      const text = readFileSync(f, "utf8");
      if (/import\s*\{[^}]*\bmain\b[^}]*\}\s*from\s*["']\.\/demo-snapshot\.js["']/.test(text)) bad.push(rel(f));
      if (/(spawn|exec|fork)\w*\([^)]*(demo-snapshot|server)\.[jt]s/.test(text)) bad.push(rel(f));
    }
    expect(bad).toEqual([]);
  });
});
