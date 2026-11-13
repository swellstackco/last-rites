import type { RepoInput, RepoTarget } from "./types.js";

export type RepoTargetError = { code: "invalid_repo" | "invalid_ref"; message: string };
export type ParseRepoTargetOutcome = { ok: true; target: RepoTarget } | { ok: false; error: RepoTargetError };

const OWNER_RE = /^[A-Za-z0-9-]{1,39}$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const REF_RE = /^[A-Za-z0-9._/-]{1,200}$/;

/**
 * Validate a raw owner/repo/ref. Pure; never throws.
 * `invalid_repo` wins over `invalid_ref` (Requirement 4.10). A missing ref becomes `HEAD`.
 * The ref charset excludes `?`, `#`, `%` and whitespace, so a validated ref cannot change the URL structure.
 */
export function parseRepoTarget(input: RepoInput): ParseRepoTargetOutcome {
  const owner: unknown = input?.owner;
  const repo: unknown = input?.repo;
  const ref: unknown = input?.ref;

  if (typeof owner !== "string" || !OWNER_RE.test(owner)) {
    return { ok: false, error: { code: "invalid_repo", message: "owner must be 1 to 39 letters, digits or hyphens" } };
  }
  if (typeof repo !== "string" || !REPO_RE.test(repo) || repo === "." || repo === "..") {
    return {
      ok: false,
      error: {
        code: "invalid_repo",
        message: "repo must be 1 to 100 letters, digits, '.', '_' or '-', and not '.' or '..'",
      },
    };
  }
  if (ref === undefined) return { ok: true, target: { owner, repo, ref: "HEAD" } };
  if (typeof ref !== "string" || !REF_RE.test(ref) || ref.includes("..")) {
    return {
      ok: false,
      error: {
        code: "invalid_ref",
        message: "ref must be 1 to 200 letters, digits, '.', '_', '-' or '/', and must not contain '..'",
      },
    };
  }
  return { ok: true, target: { owner, repo, ref } };
}
