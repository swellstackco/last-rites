// Requirements 10.1-10.3: the argument parser of the proof CLI. Pure and total: it never throws and never reads process.
import { isProofName } from "@graveyard-kit/skeleton/proof";

export interface CliArgs {
  repo: string;
  package: string;
  candidate?: string;
  runs: number;
  seed: number;
  out?: string;
  label?: string;
  commit?: string;
  fresh: boolean;
}

export type CliParse = { ok: true; args: CliArgs } | { ok: false; message: string };

export const DEFAULT_RUNS = 200;
export const DEFAULT_SEED = 20261113;
export const MIN_RUNS = 100;
export const MAX_RUNS = 100000;

export const USAGE =
  "usage: npm run exorcise -w @graveyard-kit/exorcist-npm -- --repo <path> --package <name> " +
  "[--candidate <file>] [--runs <100..100000>] [--seed <n>] [--out <proofs/repo/package.json>] " +
  "[--label <owner/repo>] [--commit <text>] [--fresh]";

const VALUE_FLAGS = ["--repo", "--package", "--candidate", "--runs", "--seed", "--out", "--label", "--commit"] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];
const VALUE_FLAG_SET: ReadonlySet<string> = new Set(VALUE_FLAGS);

const DIGITS = /^[0-9]+$/;

/** True when `out` ends in `proofs/<Proof_Name>/<file>`. */
export function isProofOutPath(out: string): boolean {
  const segs = out.split("/");
  if (segs.length < 3) return false;
  const file = segs[segs.length - 1]!;
  const dir = segs[segs.length - 2]!;
  const parent = segs[segs.length - 3]!;
  return file !== "" && file !== "." && file !== ".." && isProofName(dir) && parent === "proofs";
}

export function parseCliArgs(argv: readonly string[]): CliParse {
  const bad = (message: string): CliParse => ({ ok: false, message });
  try {
    const values = new Map<ValueFlag, string>();
    let fresh = false;
    let freshSeen = false;
    for (let i = 0; i < argv.length; i++) {
      const token = argv[i];
      if (typeof token !== "string") return bad("arguments must be strings");
      if (token === "--fresh") {
        if (freshSeen) return bad("--fresh given more than once");
        freshSeen = true;
        fresh = true;
        continue;
      }
      if (!VALUE_FLAG_SET.has(token)) {
        return bad(token.startsWith("--") ? `unknown flag ${token}` : `unexpected argument ${JSON.stringify(token)}`);
      }
      const flag = token as ValueFlag;
      if (values.has(flag)) return bad(`${flag} given more than once`);
      const value = argv[i + 1];
      if (typeof value !== "string" || value === "" || value.startsWith("--")) return bad(`${flag} needs a value`);
      values.set(flag, value);
      i++;
    }

    const repo = values.get("--repo");
    if (repo === undefined) return bad("--repo is required");
    const pkg = values.get("--package");
    if (pkg === undefined) return bad("--package is required");
    if (!isProofName(pkg)) return bad(`--package must match ^[a-z0-9][a-z0-9-]{0,63}$ (got ${JSON.stringify(pkg)})`);

    let runs = DEFAULT_RUNS;
    const runsText = values.get("--runs");
    if (runsText !== undefined) {
      runs = DIGITS.test(runsText) ? Number(runsText) : Number.NaN;
      if (!Number.isInteger(runs) || runs < MIN_RUNS || runs > MAX_RUNS) {
        return bad(`--runs must be an integer from ${MIN_RUNS} to ${MAX_RUNS}`);
      }
    }

    let seed = DEFAULT_SEED;
    const seedText = values.get("--seed");
    if (seedText !== undefined) {
      seed = DIGITS.test(seedText) ? Number(seedText) : Number.NaN;
      if (!Number.isSafeInteger(seed)) return bad("--seed must be a non-negative integer");
    }

    const out = values.get("--out");
    if (out !== undefined && !isProofOutPath(out)) {
      return bad("--out must end in proofs/<repo-name>/<file> where <repo-name> matches ^[a-z0-9][a-z0-9-]{0,63}$");
    }

    const args: CliArgs = { repo, package: pkg, runs, seed, fresh };
    const candidate = values.get("--candidate");
    if (candidate !== undefined) args.candidate = candidate;
    if (out !== undefined) args.out = out;
    const label = values.get("--label");
    if (label !== undefined) args.label = label;
    const commit = values.get("--commit");
    if (commit !== undefined) args.commit = commit;
    return { ok: true, args };
  } catch {
    return bad("could not read the arguments");
  }
}
