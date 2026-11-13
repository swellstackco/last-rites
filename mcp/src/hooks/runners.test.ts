import { describe, it, expect } from "vitest";
import { runMonotonic, MONOTONIC_TEST_TITLE } from "./run-monotonic.js";
import { runStopCheck } from "./run-stop-check.js";
import { runHook, STDIN_KEEP, type EntryEnv } from "./entry.js";
import { parseFiredLine } from "./fired-line.js";
import type { ProcessRunner } from "./run-types.js";

const fixedNow = new Date("2026-11-13T10:00:00.000Z");

function fakeEnv(stdin: string, failWrites = false) {
  const files = new Map<string, string>();
  const printed: string[] = [];
  const state = { exit: undefined as number | undefined };
  const env: EntryEnv = {
    root: "/repo",
    readStdin: async () => stdin,
    now: () => fixedNow,
    writeFile: async (p, t, mode) => {
      if (failWrites) throw new Error("disk full");
      files.set(p, mode === "append" ? (files.get(p) ?? "") + t : t);
    },
    print: (l) => printed.push(l),
    setExitCode: (c) => (state.exit = c),
  };
  return { env, files, printed, state };
}

describe("runMonotonic", () => {
  it("passes and keeps the last 15 lines", async () => {
    const calls: string[][] = [];
    const run: ProcessRunner = async (cmd, args) => {
      calls.push([cmd, ...args]);
      return { code: 0, output: Array.from({ length: 40 }, (_, i) => `l${i}`).join("\n") + "\n" };
    };
    const r = await runMonotonic({ run });
    expect(r.outcome).toBe("ok");
    expect(r.lines).toHaveLength(16);
    expect(r.lines[0]).toBe("l25");
    expect(r.lines.at(-1)).toBe("monotonic: PASS");
    expect(calls[0]).toEqual(["npx", "vitest", "--run", "skeleton/src/death-score/properties.test.ts", "-t", MONOTONIC_TEST_TITLE]);
  });
  it("fails on a non-zero exit and on a rejecting runner", async () => {
    expect((await runMonotonic({ run: async () => ({ code: 1, output: "boom" }) })).lines).toEqual(["boom", "monotonic: FAIL"]);
    const r = await runMonotonic({ run: async () => Promise.reject(new Error("spawn")) });
    expect(r.outcome).toBe("fail");
    expect(r.lines.at(-1)).toBe("monotonic: FAIL");
  });
});

describe("runStopCheck", () => {
  it("prints PASS when both steps pass", async () => {
    const r = await runStopCheck({ run: async () => ({ code: 0, output: "" }) });
    expect(r).toEqual({ lines: ["check: PASS"], outcome: "ok" });
  });
  it("shows the failing step only", async () => {
    const r = await runStopCheck({ run: async (cmd) => (cmd === "npm" ? { code: 2, output: "error TS1" } : { code: 0, output: "" }) });
    expect(r.outcome).toBe("fail");
    expect(r.lines).toEqual(["check: FAIL", "typecheck failed (exit 2)", "> error TS1"]);
  });
  it("counts a rejection as a failed step", async () => {
    const r = await runStopCheck({ run: async () => Promise.reject(new Error("nope")) });
    expect(r.lines).toContain("> could not run npm run typecheck");
    expect(r.lines).toContain("> could not run npx vitest --run --changed");
  });
});

describe("runHook", () => {
  it("prints, logs the fired line, caps stdin and sets exit 0", async () => {
    const { env, files, printed, state } = fakeEnv("x".repeat(5000));
    await runHook(env, "check-on-stop", async () => ({ lines: ["a", "b"], outcome: "warn" }));
    expect(printed).toEqual(["a", "b"]);
    expect(state.exit).toBe(0);
    expect(files.get("/repo/.cache/hooks/last-input-check-on-stop.json")).toHaveLength(STDIN_KEEP);
    const log = files.get("/repo/.cache/hooks/fired.log")!;
    expect(log).toBe("2026-11-13T10:00:00.000Z check-on-stop warn\n");
    expect(parseFiredLine(log.trim())?.outcome).toBe("warn");
  });
  it("logs fail when the runner throws, and survives write failures", async () => {
    const a = fakeEnv("");
    await runHook(a.env, "check-on-stop", async () => Promise.reject(new Error("x")));
    expect(a.files.get("/repo/.cache/hooks/fired.log")).toContain(" check-on-stop fail");
    expect(a.state.exit).toBe(0);
    const b = fakeEnv("{}", true);
    await runHook(b.env, "check-on-stop", async () => ({ lines: ["ok"], outcome: "ok" }));
    expect(b.printed).toEqual(["ok"]);
    expect(b.state.exit).toBe(0);
  });
});
