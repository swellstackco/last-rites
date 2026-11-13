import type { Sabotage } from "../sabotage-runner.js";
import type { ParseRepoUrlFn } from "../properties/repo-url.js";
import type { RepoRef } from "../../repo-url.js";

export interface ParserOptions {
  stripGit: boolean;
  caseInsensitiveHost: boolean;
  trim: boolean;
  wholePathAsRepo: boolean;
  anyHost: boolean;
  maxRepoLength: number;
  throwOnNonString: boolean;
}

export const CORRECT_OPTIONS: ParserOptions = {
  stripGit: true,
  caseInsensitiveHost: true,
  trim: true,
  wholePathAsRepo: false,
  anyHost: false,
  maxRepoLength: 100,
  throwOnNonString: false,
};

/**
 * A parameterized copy of the parser with one defect switched on at a time.
 * Shared by the P1 and P2 sabotage lists.
 */
export function makeParser(overrides: Partial<ParserOptions>): ParseRepoUrlFn {
  const o = { ...CORRECT_OPTIONS, ...overrides };
  return (field: unknown): RepoRef | undefined => {
    let raw: string | undefined;
    if (typeof field === "string") raw = field;
    else if (typeof field === "object" && field !== null && typeof (field as { url?: unknown }).url === "string") {
      raw = (field as { url: string }).url;
    }
    if (raw === undefined) {
      if (o.throwOnNonString) throw new TypeError("repository must be a string");
      return undefined;
    }
    let s = o.trim ? raw.trim() : raw;
    for (const sep of ["#", "?"]) {
      const i = s.indexOf(sep);
      if (i >= 0) s = s.slice(0, i);
    }
    const flags = o.caseInsensitiveHost ? "i" : "";
    const prefixes = [
      "^(?:git\\+)?https?:\\/\\/(?:www\\.)?github\\.com\\/",
      "^git:\\/\\/github\\.com\\/",
      "^git\\+ssh:\\/\\/git@github\\.com\\/",
      "^ssh:\\/\\/git@github\\.com\\/",
      "^git@github\\.com:",
      "^github:",
    ];
    if (o.anyHost) prefixes.push("^(?:git\\+)?(?:https?|git|ssh):\\/\\/(?:git@)?[^/]+\\/");
    for (const p of prefixes) {
      const m = new RegExp(p, flags).exec(s);
      if (m) {
        s = s.slice(m[0].length);
        break;
      }
    }
    const segments = s.split("/");
    if (segments.length < 2) return undefined;
    const owner = segments[0]!;
    let repo = o.wholePathAsRepo ? segments.slice(1).join("/") : segments[1]!;
    if (o.stripGit && repo.endsWith(".git")) repo = repo.slice(0, -4);
    if (!/^[A-Za-z0-9-]{1,39}$/.test(owner)) return undefined;
    if (o.wholePathAsRepo) {
      if (repo === "") return undefined;
    } else {
      if (!/^[A-Za-z0-9._-]+$/.test(repo) || repo.length > o.maxRepoLength) return undefined;
      if (repo === "." || repo === "..") return undefined;
    }
    return { owner, repo };
  };
}

export const P1_SABOTAGES: ReadonlyArray<Sabotage<ParseRepoUrlFn>> = [
  { name: "does not strip .git", impl: makeParser({ stripGit: false }) },
  { name: "case-sensitive host", impl: makeParser({ caseInsensitiveHost: false }) },
  { name: "no trim", impl: makeParser({ trim: false }) },
  { name: "whole path as repo", impl: makeParser({ wholePathAsRepo: true }) },
];
