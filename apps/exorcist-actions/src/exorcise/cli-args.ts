// Requirement 15.1: the argument parser of the exorcise CLI. Pure and total: it never throws and never
// reads process or the file system. Same flag rules as the scan parser (Requirement 9.2).
import { isProofOutPath } from "@last-rites/exorcist-npm/programmatic";
import { DEFAULT_CACHE, defaultLabel, LABEL_PATTERN } from "../scan/cli-args.js";

export type ExorciseFix = "pin" | "swap";

export interface ExorciseArgs {
  repo: string;
  /** The Action_Name `owner/repo`, as given (compared case-insensitively). */
  action: string;
  fix: ExorciseFix;
  write: boolean;
  out?: string;
  label: string;
  commit?: string;
  cache: string;
  fresh: boolean;
}

export type ExorciseArgsParse = { ok: true; args: ExorciseArgs } | { ok: false; message: string };

export const EXORCISE_USAGE =
  "usage: npm run exorcise -w @last-rites/exorcist-actions -- --repo <path> --action <owner/repo> " +
  "--fix pin|swap [--write] [--out <proofs/repo/file.json>] [--label <owner/name>] [--commit <text>] " +
  "[--cache <dir>] [--fresh]";

const VALUE_FLAGS = ["--repo", "--action", "--fix", "--out", "--label", "--commit", "--cache"] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];
const VALUE_FLAG_SET: ReadonlySet<string> = new Set(VALUE_FLAGS);
const SWITCHES = ["--write", "--fresh"] as const;
type Switch = (typeof SWITCHES)[number];
const SWITCH_SET: ReadonlySet<string> = new Set(SWITCHES);

/** `cwd` only decides the basename of a relative `--repo` such as `.`; it is never read from the process here. */
export function parseExorciseArgs(argv: readonly string[], cwd = "/"): ExorciseArgsParse {
  const bad = (message: string): ExorciseArgsParse => ({ ok: false, message });
  try {
    if (!Array.isArray(argv)) return bad("arguments must be a list");
    const values = new Map<ValueFlag, string>();
    const switches = new Set<Switch>();
    for (let i = 0; i < argv.length; i++) {
      const token = argv[i];
      if (typeof token !== "string") return bad("arguments must be strings");
      if (SWITCH_SET.has(token)) {
        const sw = token as Switch;
        if (switches.has(sw)) return bad(`${sw} given more than once`);
        switches.add(sw);
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
    const action = values.get("--action");
    if (action === undefined) return bad("--action is required");
    if (!LABEL_PATTERN.test(action)) return bad(`--action must be <owner>/<repo> (got ${JSON.stringify(action)})`);
    const fix = values.get("--fix");
    if (fix === undefined) return bad("--fix is required");
    if (fix !== "pin" && fix !== "swap") return bad(`--fix must be pin or swap (got ${JSON.stringify(fix)})`);

    const label = values.get("--label") ?? defaultLabel(repo, typeof cwd === "string" ? cwd : "/");
    if (!LABEL_PATTERN.test(label)) return bad(`--label must match ${LABEL_PATTERN.source} (got ${JSON.stringify(label)})`);

    const out = values.get("--out");
    if (out !== undefined && !isProofOutPath(out)) return bad("--out must end in proofs/<proof-name>/<file>");
    const commit = values.get("--commit");

    return {
      ok: true,
      args: {
        repo,
        action,
        fix,
        write: switches.has("--write"),
        ...(out !== undefined ? { out } : {}),
        label,
        ...(commit !== undefined ? { commit } : {}),
        cache: values.get("--cache") ?? DEFAULT_CACHE,
        fresh: switches.has("--fresh"),
      },
    };
  } catch {
    return bad("invalid arguments");
  }
}
