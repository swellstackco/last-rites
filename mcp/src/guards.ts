import { resolve } from "node:path";
import { isProofName } from "@graveyard-kit/skeleton/proof";
import { DEMO_REPOS, REPO_PATTERN, isProofOutPath, parseRepoTarget } from "@graveyard-kit/exorcist-npm/programmatic";
import { type ToolErrorValue, toolError } from "./errors.js";

// Argument guards of the tools (Requirement 3). All are decided before any Dep is called.

export type RepoArgument =
  | { kind: "local"; path: string }
  | { kind: "github"; owner: string; repo: string }
  | { kind: "demo"; name: string }
  | { kind: "invalid"; code: "invalid_repo"; message: string };

const MAX_PATH_UNITS = 4096;
const LOCAL_PREFIXES = ["/", "./", "../"] as const;

function demoNames(): string[] {
  return DEMO_REPOS.map((d) => d.name);
}

/** Pure and total. Order: local prefix, `owner/name`, demo name, else invalid (Requirement 3.1). */
export function classifyRepoArgument(input: string): RepoArgument {
  try {
    if (typeof input === "string") {
      const prefix = LOCAL_PREFIXES.find((p) => input.startsWith(p));
      if (prefix !== undefined) {
        if (input.length > prefix.length && input.length <= MAX_PATH_UNITS && !input.includes("\0")) {
          return { kind: "local", path: input };
        }
      } else if (REPO_PATTERN.test(input)) {
        const slash = input.indexOf("/");
        const owner = input.slice(0, slash);
        const repo = input.slice(slash + 1);
        if (parseRepoTarget({ owner, repo }).ok) return { kind: "github", owner, repo };
      } else if (demoNames().includes(input)) {
        return { kind: "demo", name: input };
      }
    }
  } catch {
    // fall through to invalid
  }
  return {
    kind: "invalid",
    code: "invalid_repo",
    message: `repo must be a path starting with /, ./ or ../, an owner/name, or one of the demo names: ${demoNames().join(", ")}`,
  };
}

export const NPM_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;

export const isNpmName = (s: unknown): s is string =>
  typeof s === "string" && s.length <= 214 && NPM_NAME_PATTERN.test(s);

/** Npm_Name guard (Requirement 3.4). */
export function checkPackage(raw: unknown): { ok: true; name: string } | ToolErrorValue {
  if (!isNpmName(raw)) {
    return toolError("invalid_package", "package must be a lower case npm package name of at most 214 characters");
  }
  return { ok: true, name: raw };
}

/** Proof_Name guard for `generate_pin_tests` (Requirement 3.5). */
export function checkProofPackage(raw: unknown): { ok: true; name: string } | ToolErrorValue {
  const npm = checkPackage(raw);
  if (!npm.ok) return npm;
  if (npm.name.startsWith("@")) {
    return toolError("invalid_package", "scoped packages are not supported by the proof harness");
  }
  if (!isProofName(npm.name)) {
    return toolError("invalid_package", "package must match ^[a-z0-9][a-z0-9-]{0,63}$ for the proof harness");
  }
  return { ok: true, name: npm.name };
}

/** Existence probes injected by the server (Requirement 3.6, 3.8). `undefined`: absent or unreadable. */
export interface FsProbe {
  stat(path: string): Promise<{ kind: "file" | "dir" | "other" } | undefined>;
  readText(path: string): Promise<string | undefined>;
}

function isPathString(raw: unknown): raw is string {
  return typeof raw === "string" && raw.length > 0 && raw.length <= MAX_PATH_UNITS && !raw.includes("\0");
}

/** Resolve against `cwd`; must exist and be a directory (Requirement 3.6). */
export async function checkPath(
  probe: FsProbe,
  cwd: string,
  raw: unknown,
): Promise<{ ok: true; abs: string } | ToolErrorValue> {
  if (!isPathString(raw)) {
    return toolError("invalid_path", "path must be a non-empty string of at most 4096 characters without NUL");
  }
  const abs = resolve(cwd, raw);
  const st = await probe.stat(abs);
  if (st === undefined) return toolError("path_not_found", `path not found: ${raw}`);
  if (st.kind !== "dir") return toolError("not_a_directory", `not a directory: ${raw}`);
  return { ok: true, abs };
}

const CANDIDATE_EXT = /\.(?:js|mjs|cjs)$/;

/** Resolve against `cwd`; must be a regular file ending in .js, .mjs or .cjs (Requirement 3.7). */
export async function checkCandidate(
  probe: FsProbe,
  cwd: string,
  raw: unknown,
): Promise<{ ok: true; abs: string } | ToolErrorValue> {
  if (!isPathString(raw)) {
    return toolError("invalid_candidate", "candidate must be a non-empty path string of at most 4096 characters without NUL");
  }
  if (!CANDIDATE_EXT.test(raw)) {
    return toolError("invalid_candidate", "candidate must be a .js, .mjs or .cjs file");
  }
  const abs = resolve(cwd, raw);
  const st = await probe.stat(abs);
  if (st === undefined || st.kind !== "file") {
    return toolError("invalid_candidate", `candidate is not a regular file: ${raw}`);
  }
  return { ok: true, abs };
}

export const DEFAULT_RUNS = 200;
export const MIN_RUNS = 100;
export const MAX_RUNS = 100000;

/** `undefined` gives 200; otherwise an integer from 100 to 100000 (Requirement 3.7). */
export function checkRuns(raw: unknown): { ok: true; runs: number } | ToolErrorValue {
  if (raw === undefined) return { ok: true, runs: DEFAULT_RUNS };
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= MIN_RUNS && raw <= MAX_RUNS) {
    return { ok: true, runs: raw };
  }
  return toolError("invalid_runs", `runs must be an integer from ${MIN_RUNS} to ${MAX_RUNS}`);
}

/** Agrees with `isProofOutPath` (Requirement 3.7). */
export function checkOut(raw: unknown): { ok: true; out: string } | ToolErrorValue {
  if (typeof raw === "string" && isProofOutPath(raw)) return { ok: true, out: raw };
  return toolError("invalid_out", "out must end in proofs/<repo-name>/<file> where <repo-name> matches ^[a-z0-9][a-z0-9-]{0,63}$");
}
