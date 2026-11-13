/** Static smoke tests (Requirements 1.2, 12.10, 14.1, 14.2, 14.3, 14.7). No network, no stage runs. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { PackageSignals } from "@graveyard-kit/skeleton";
import * as api from "./index.js";
import type { EvidenceResult } from "./types.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const APP = join(ROOT, "apps/exorcist-npm");

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === "node_modules" || n === "dist" || n === "__fixtures__") return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith(".ts") ? [p] : [];
  });
}

/** Static and dynamic import specifiers of a source file. */
function specifiers(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) out.push(m[1] as string);
  return out;
}

describe("static smoke checks", () => {
  it("the app imports /skeleton only through @graveyard-kit/skeleton", () => {
    const bad: string[] = [];
    for (const f of tsFiles(join(APP, "src"))) {
      for (const s of specifiers(f)) {
        if (s === "@graveyard-kit/skeleton") continue;
        if (s.startsWith("@graveyard-kit/skeleton/") || /(^|\/)skeleton(\/|$)/.test(s)) bad.push(`${f}: ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("no file under /skeleton imports anything under apps/exorcist-npm", () => {
    const skeletonFiles = tsFiles(join(ROOT, "skeleton"));
    expect(skeletonFiles.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const f of skeletonFiles) {
      for (const s of specifiers(f)) {
        if (/exorcist-npm|(^|\/)apps(\/|$)/.test(s)) bad.push(`${f}: ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("package.json declares no LLM client dependency", () => {
    const pkg = JSON.parse(readFileSync(join(APP, "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
    const names = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap((k) =>
      Object.keys(pkg[k] ?? {}),
    );
    const llm = /^(openai|anthropic|@anthropic-ai\/.*|@aws-sdk\/client-bedrock.*|@google\/generative-ai|@google-cloud\/vertexai|langchain|@langchain\/.*|ollama|cohere-ai|@mistralai\/.*|groq-sdk|replicate|ai|@ai-sdk\/.*|llamaindex|@huggingface\/.*)$/;
    expect(names.filter((n) => llm.test(n))).toEqual([]);
  });

  it("exports createEvidenceStage and no inventory, replacement or proof stage", () => {
    expect(typeof api.createEvidenceStage).toBe("function");
    for (const k of ["inventory", "replacement", "proof"]) expect(Object.keys(api)).not.toContain(k);
  });

  it("EvidenceResult['signals'] is assignable to PackageSignals (compile-time)", () => {
    const check = (s: EvidenceResult["signals"]): PackageSignals => s;
    const reverse = (s: PackageSignals): EvidenceResult["signals"] => s;
    expect(typeof check).toBe("function");
    expect(typeof reverse).toBe("function");
  });
});
