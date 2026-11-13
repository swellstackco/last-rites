// The shared wrapper of the four hook entry files. With the entry files, the only readers of argv, env and stdin.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { formatFiredLine, type HookOutcome } from "./fired-line.js";
import type { ProcessRunner, RunnerResult } from "./run-types.js";

export const STDIN_KEEP = 2000;

export interface EntryEnv {
  /** Repository root (cwd of the hook). */
  root: string;
  readStdin(): Promise<string>;
  now(): Date;
  /** Best-effort file writer; may reject. */
  writeFile(path: string, text: string, mode: "write" | "append"): Promise<void>;
  print(line: string): void;
  setExitCode(code: number): void;
}

/** Reads stdin, saves its first 2000 characters, runs the runner, prints, logs the fired line. Exit code is always 0. */
export async function runHook(
  env: EntryEnv,
  hookId: string,
  runner: (input: { stdin: string }) => Promise<RunnerResult>,
): Promise<RunnerResult> {
  const best = async (path: string, text: string, mode: "write" | "append") => {
    try {
      await env.writeFile(path, text, mode);
    } catch {
      /* best effort */
    }
  };
  let stdin = "";
  try {
    stdin = await env.readStdin();
  } catch {
    stdin = "";
  }
  await best(join(env.root, ".cache", "hooks", `last-input-${hookId}.json`), stdin.slice(0, STDIN_KEEP), "write");

  let result: RunnerResult;
  try {
    result = await runner({ stdin });
  } catch {
    result = { lines: [`${hookId}: runner failed`], outcome: "fail" };
  }
  for (const l of result.lines) env.print(l);
  const outcome: HookOutcome = result.outcome;
  const fired = formatFiredLine(env.now(), hookId, outcome);
  if (fired !== undefined) await best(join(env.root, ".cache", "hooks", "fired.log"), `${fired}\n`, "append");
  env.setExitCode(0);
  return result;
}

export const nodeProcessRunner =
  (cwd: string): ProcessRunner =>
  (cmd, args) =>
    new Promise((resolve, reject) => {
      const child = spawn(cmd, [...args], { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      child.stdout.on("data", (d: Buffer) => (output += d.toString("utf8")));
      child.stderr.on("data", (d: Buffer) => (output += d.toString("utf8")));
      child.on("error", reject);
      child.on("close", (code) => resolve({ code: code ?? 1, output }));
    });

// Read fd 0 synchronously: iterating `process.stdin` under vite-node makes the process exit as soon as stdin
// ends, silently dropping every later await (seen when running the hooks by hand, task 3.16).
async function readAllStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/**
 * The repository root, from this file's location (mcp/src/hooks -> three levels up). Not `process.cwd()`:
 * `npm run -w` runs the script inside `mcp/`.
 */
export const REPO_ROOT = resolve(import.meta.dirname, "../../..");

export function nodeEntryEnv(): EntryEnv {
  return {
    root: REPO_ROOT,
    readStdin: readAllStdin,
    now: () => new Date(),
    writeFile: async (path, text, mode) => {
      await mkdir(dirname(path), { recursive: true });
      if (mode === "append") await appendFile(path, text);
      else await writeFile(path, text);
    },
    print: (l) => console.log(l),
    setExitCode: (c) => {
      process.exitCode = c;
    },
  };
}
