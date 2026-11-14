import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as programmatic from "@last-rites/exorcist-npm/programmatic";
import * as testing from "@last-rites/exorcist-npm/programmatic/testing";

// Static smoke checks over this app's own sources (Requirements 1.4, 1.6, 1.8, 1.9).

const SRC = fileURLToPath(new URL(".", import.meta.url));
const APP = join(SRC, "..");
const SKELETON = join(APP, "..", "..", "skeleton");
const SELF = "smoke.test.ts";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const appFiles = walk(SRC).filter((f) => f.endsWith(".ts"));
const rel = (f: string) => relative(SRC, f).split("\\").join("/");
const read = (f: string) => readFileSync(f, "utf8");

/** [module, names, isTypeOnlyStatement] for every static import of a package in the text. */
function packageImports(text: string, pkg: string): Array<{ names: string[]; typeOnly: boolean }> {
  const out: Array<{ names: string[]; typeOnly: boolean }> = [];
  const re = new RegExp(`import\\s+(type\\s+)?\\{([^}]*)\\}\\s+from\\s+"${pkg}"`, "g");
  for (const m of text.matchAll(re)) {
    const names = (m[2] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => ({ typeOnly: s.startsWith("type "), name: s.replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim() }));
    const stmtType = m[1] !== undefined;
    out.push({ names: names.filter((n) => !n.typeOnly && !stmtType).map((n) => n.name), typeOnly: stmtType });
  }
  return out;
}

describe("smoke: boundaries of the app", () => {
  it("every runtime symbol imported from the Programmatic_Entry is exported by it", () => {
    let checked = 0;
    for (const f of appFiles) {
      const text = read(f);
      for (const imp of packageImports(text, "@last-rites/exorcist-npm/programmatic")) {
        for (const n of imp.names) {
          checked++;
          expect(Object.keys(programmatic), `${rel(f)} imports ${n}`).toContain(n);
        }
      }
      for (const imp of packageImports(text, "@last-rites/exorcist-npm/programmatic/testing")) {
        for (const n of imp.names) {
          checked++;
          expect(Object.keys(testing), `${rel(f)} imports ${n}`).toContain(n);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("imports from exorcist-npm only through its three allowed entries", () => {
    const allowed = new Set([
      "@last-rites/exorcist-npm/programmatic",
      "@last-rites/exorcist-npm/programmatic/testing",
      "@last-rites/exorcist-npm/report",
    ]);
    for (const f of appFiles) {
      for (const m of read(f).matchAll(/from\s+"(@last-rites\/exorcist-npm[^"]*)"/g)) {
        expect(allowed.has(m[1]!), `${rel(f)} imports ${m[1]}`).toBe(true);
      }
    }
  });

  it("skeleton contains no import of apps, mcp or power", () => {
    const files = walk(join(SKELETON, "src")).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      for (const m of read(f).matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)) {
        const spec = m[1]!;
        expect(spec, `${f} imports ${spec}`).not.toMatch(/exorcist-|\/apps\/|\/mcp\b|\/power\b|@last-rites\/(mcp|power)/);
        expect(spec, `${f} imports ${spec}`).not.toMatch(/^(\.\.\/)+(apps|mcp|power)\//);
      }
    }
  });

  it("no dependency of the app is an LLM client", () => {
    const pkg = JSON.parse(read(join(APP, "package.json"))) as Record<string, Record<string, string> | undefined>;
    const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    const llm = /^(openai|@anthropic-ai\/.*|anthropic|@google\/generative-ai|@google\/genai|@aws-sdk\/client-bedrock.*|langchain|@langchain\/.*|ai|@ai-sdk\/.*|cohere-ai|ollama|@mistralai\/.*|groq-sdk|replicate|llamaindex)$/;
    for (const n of names) expect(n, n).not.toMatch(llm);
  });

  it("process env, argv and exit are touched only in the CLI entries and the Recorder", () => {
    const allowed = new Set(["scan/cli.ts", "exorcise/cli.ts", "test-support/record-fixtures.ts", SELF]);
    const pattern = new RegExp("process\\s*\\.\\s*(" + ["env", "argv", "exit", "exitCode", "stdin"].join("|") + ")\\b");
    for (const f of appFiles) {
      if (allowed.has(rel(f))) continue;
      expect(read(f), rel(f)).not.toMatch(pattern);
    }
  });

  it("no file imports child_process", () => {
    const pattern = new RegExp("(?:node:)?child" + "_process");
    for (const f of appFiles) {
      if (rel(f) === SELF) continue;
      expect(read(f), rel(f)).not.toMatch(pattern);
    }
  });

  it("no test file mentions the local clone", () => {
    const needle = "lastrites" + "-work";
    for (const f of appFiles.filter((x) => x.endsWith(".test.ts"))) {
      expect(read(f), rel(f)).not.toContain(needle);
    }
  });

  it("the app writes nothing into skeleton", () => {
    for (const f of appFiles) {
      if (rel(f) === SELF) continue;
      const text = read(f);
      // Any path literal that reaches into the skeleton folder from this app is a candidate write target.
      expect(text, rel(f)).not.toMatch(/["'`][^"'`\n]*skeleton\/[^"'`\n]*["'`]\s*[,)][^;\n]*writ/i);
      for (const m of text.matchAll(/(?:writeFile|writeFileSync|appendFile|appendFileSync|writeAtomic|mkdir|mkdirSync|rm|rmSync|copyFile|copyFileSync|rename|renameSync)\s*\(([^)]*)\)/g)) {
        expect(m[1]!, `${rel(f)}: ${m[0]}`).not.toMatch(/skeleton/);
      }
    }
  });
});
