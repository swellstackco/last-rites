import { formatStopSummary, type StepResult } from "./stop-summary.js";
import type { ProcessRunner, RunnerResult } from "./run-types.js";

export interface StopCheckDeps {
  run: ProcessRunner;
}

async function step(run: ProcessRunner, cmd: string, args: readonly string[]): Promise<StepResult> {
  try {
    const r = await run(cmd, args);
    return { code: typeof r.code === "number" ? r.code : 1, output: typeof r.output === "string" ? r.output : "" };
  } catch {
    return { code: 1, output: `could not run ${[cmd, ...args].join(" ")}` };
  }
}

/** `npm run typecheck`, then `npx vitest --run --changed`; never throws. */
export async function runStopCheck(deps: StopCheckDeps): Promise<RunnerResult> {
  const typecheck = await step(deps.run, "npm", ["run", "typecheck"]);
  const tests = await step(deps.run, "npx", ["vitest", "--run", "--changed"]);
  const text = formatStopSummary(typecheck, tests);
  return { lines: text.split("\n"), outcome: typecheck.code === 0 && tests.code === 0 ? "ok" : "fail" };
}
