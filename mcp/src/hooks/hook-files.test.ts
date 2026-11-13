import { readFileSync } from "node:fs";
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
