import type { ProcessRunner, RunnerResult } from "./run-types.js";

/** Title of the monotonicity test in `skeleton/src/death-score/properties.test.ts` (read there, not guessed). */
export const MONOTONIC_TEST_TITLE = "a death-dominating B never scores below A";
export const MONOTONIC_TEST_FILE = "skeleton/src/death-score/properties.test.ts";
export const TAIL_LINES = 15;

export interface MonotonicDeps {
  run: ProcessRunner;
}

/** Re-runs only the monotonicity property; never throws. */
export async function runMonotonic(deps: MonotonicDeps): Promise<RunnerResult> {
  const args = ["vitest", "--run", MONOTONIC_TEST_FILE, "-t", MONOTONIC_TEST_TITLE];
  try {
    const r = await deps.run("npx", args);
    const text = typeof r.output === "string" ? r.output : "";
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    const ok = r.code === 0;
    return { lines: [...lines.slice(-TAIL_LINES), ok ? "monotonic: PASS" : "monotonic: FAIL"], outcome: ok ? "ok" : "fail" };
  } catch {
    return { lines: ["could not run npx vitest", "monotonic: FAIL"], outcome: "fail" };
  }
}
