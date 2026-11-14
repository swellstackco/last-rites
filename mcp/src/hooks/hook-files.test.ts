import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { validateHookFile } from "../kiro-config/index.js";

// Repository root: mcp/src/hooks -> three levels up.
const ROOT = resolve(import.meta.dirname, "../../..");
const load = (id: string) => {
  const text = readFileSync(resolve(ROOT, ".kiro/hooks", `${id}.json`), "utf8");
  return { text, hook: (JSON.parse(text) as { hooks: Array<Record<string, any>> }).hooks[0]! }; // eslint-disable-line @typescript-eslint/no-explicit-any
};

describe("monotonic hook file", () => {
  const { text, hook } = load("death-score-monotonic-on-save");
  const re = new RegExp(hook.matcher);
  it("passes the hook validator", () => {
    expect(validateHookFile(text)).toEqual({ ok: true });
  });
  it("matches the three source files, relative or absolute", () => {
    for (const f of ["weights", "severity", "grade"]) {
      expect(re.test(`skeleton/src/death-score/${f}.ts`)).toBe(true);
      expect(re.test(`/Users/ben/Projects/apps/graveyard-kit/skeleton/src/death-score/${f}.ts`)).toBe(true);
    }
  });
  it("does not match tests or other files", () => {
    for (const p of [
      "skeleton/src/death-score/weights.test.ts",
      "skeleton/src/death-score/score.ts",
      "skeleton/src/graveyard/grade.ts",
      "skeleton/src/death-score/grade.tsx",
    ]) expect(re.test(p), p).toBe(false);
  });
  it("is a PostFileSave command hook with a short description", () => {
    expect(hook.trigger).toBe("PostFileSave");
    expect(hook.action.type).toBe("command");
    expect(hook.description.length).toBeGreaterThan(0);
    expect(hook.description.length).toBeLessThanOrEqual(120);
  });
});

describe("stop hook file", () => {
  const { text, hook } = load("check-on-stop");
  it("passes the hook validator", () => {
    expect(validateHookFile(text)).toEqual({ ok: true });
  });
  it("is a Stop hook without a matcher", () => {
    expect(hook.trigger).toBe("Stop");
    expect("matcher" in hook).toBe(false);
    expect(hook.description.length).toBeGreaterThan(0);
    expect(hook.description.length).toBeLessThanOrEqual(120);
  });
});

describe("all four hook files", () => {
  const ids = ["scan-deps-on-save", "death-score-monotonic-on-save", "check-on-stop", "candidate-proof-on-save"];

  it("exactly four .json files exist in .kiro/hooks", () => {
    const files = readdirSync(resolve(ROOT, ".kiro/hooks")).filter((f) => f.endsWith(".json")).sort();
    expect(files).toEqual(ids.map((i) => `${i}.json`).sort());
  });

  it.each(ids)("%s validates, has a description, and runs an existing hook script", (id) => {
    const { text, hook } = load(id);
    expect(validateHookFile(text)).toEqual({ ok: true });
    expect(hook.description.length).toBeGreaterThan(0);
    const m = /^npm run (hook:[a-z-]+) -w @last-rites\/exorcist-mcp --silent$/.exec(hook.action.command);
    expect(m, hook.action.command).not.toBeNull();
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "mcp/package.json"), "utf8")) as { scripts: Record<string, string> };
    const script = pkg.scripts[m![1]!];
    expect(script).toBeDefined();
    const entry = /vite-node (\S+)/.exec(script!)![1]!;
    expect(existsSync(resolve(ROOT, "mcp", entry))).toBe(true);
  });

  it("scan-deps matcher", () => {
    const re = new RegExp(load("scan-deps-on-save").hook.matcher);
    for (const p of ["package.json", "apps/exorcist-npm/package.json", "package-lock.json", "/Users/ben/Projects/apps/graveyard-kit/package.json", "/Users/ben/x/package-lock.json"])
      expect(re.test(p), p).toBe(true);
    for (const p of ["node_modules/x/package.json", "package.json.bak", "my-package.json", "a/node_modules/b/package-lock.json"])
      expect(re.test(p), p).toBe(false);
  });

  it("candidate-proof matcher", () => {
    const re = new RegExp(load("candidate-proof-on-save").hook.matcher);
    expect(re.test("demo/proofs/candidates/parse-server/intersect.agent.js")).toBe(true);
    expect(re.test("/abs/demo/proofs/candidates/parse-server/intersect.agent.js")).toBe(true);
    for (const p of ["demo/proofs/candidates/parse-server/README.md", "demo/proofs/candidates/x.js", "demo/proofs/parse-server/intersect.json"])
      expect(re.test(p), p).toBe(false);
  });
});
