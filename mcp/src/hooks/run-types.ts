// Shared shapes of the injected seams of the Hook_Script runners.
import type { HookOutcome } from "./fired-line.js";

export interface ProcessResult {
  code: number;
  /** Combined stdout and stderr. */
  output: string;
}

/** Runs one command from the repository root; may reject (the runners treat that as a failed step). */
export type ProcessRunner = (cmd: string, args: readonly string[]) => Promise<ProcessResult>;

export interface RunnerResult {
  lines: string[];
  outcome: HookOutcome;
}
