// Requirement 9.2, 9.3: the argument parser of the scan CLI. Pure and total: it never throws and never
// reads process or the file system.
import { resolve } from "node:path/posix";

export interface ScanArgs {
  repo: string;
  out?: string;
  label: string;
  ref: string;
  cache: string;
}

export type ScanArgsParse = { ok: true; args: ScanArgs } | { ok: false; message: string };

export const LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
export const REF_PATTERN = /^[A-Za-z0-9._/-]{1,255}$/;
export const DEFAULT_REF = "local";
export const DEFAULT_CACHE = ".cache/actions";

export const SCAN_USAGE =
  "usage: npm run scan -w @graveyard-kit/exorcist-actions -- --repo <path> [--out <file>] " +
  "[--label <owner/name>] [--ref <text>] [--cache <dir>]";

const VALUE_FLAGS = ["--repo", "--out", "--label", "--ref", "--cache"] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];
const VALUE_FLAG_SET: ReadonlySet<string> = new Set(VALUE_FLAGS);

/** `local/<basename of the path>`, with characters outside the label alphabet replaced by `-`. */
export function defaultLabel(repo: string, cwd: string): string {
  const absolute = resolve(cwd.startsWith("/") ? cwd : "/", repo.replace(/\\/g, "/"));
  const base = absolute.split("/").filter((s) => s !== "").pop() ?? "";
  const clean = base.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 100);
  return `local/${clean === "" ? "repo" : clean}`;
}

/** `cwd` only decides the basename of a relative `--repo` such as `.`; it is never read from the process here. */
export function parseScanArgs(argv: readonly string[], cwd = "/"): ScanArgsParse {
  const bad = (message: string): ScanArgsParse => ({ ok: false, message });
  try {
    if (!Array.isArray(argv)) return bad("arguments must be a list");
    const values = new Map<ValueFlag, string>();
    for (let i = 0; i < argv.length; i++) {
      const token = argv[i];
      if (typeof token !== "string") return bad("arguments must be strings");
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

    const label = values.get("--label") ?? defaultLabel(repo, typeof cwd === "string" ? cwd : "/");
    if (!LABEL_PATTERN.test(label)) return bad(`--label must match ${LABEL_PATTERN.source} (got ${JSON.stringify(label)})`);

    const ref = values.get("--ref") ?? DEFAULT_REF;
    if (!REF_PATTERN.test(ref)) return bad(`--ref must match ${REF_PATTERN.source} (got ${JSON.stringify(ref)})`);

    const out = values.get("--out");
    return {
      ok: true,
      args: { repo, ...(out !== undefined ? { out } : {}), label, ref, cache: values.get("--cache") ?? DEFAULT_CACHE },
    };
  } catch {
    return bad("invalid arguments");
  }
}
