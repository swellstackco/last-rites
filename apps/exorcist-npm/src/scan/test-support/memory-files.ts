import type { FetchFailureCategory } from "../types.js";
import type { RepoFileName, RepoFileSource } from "../repo-fetch.js";

export interface MemoryFilesOptions {
  /** Fail the lockfile fetch with this category instead of returning it. */
  failLockfile?: FetchFailureCategory;
  /** Fail the manifest fetch with this category. */
  failManifest?: FetchFailureCategory;
}

export interface MemoryFiles {
  source: RepoFileSource;
  /** Every request, in order. */
  requests: Array<{ owner: string; repo: string; ref: string; file: RepoFileName }>;
}

/**
 * A RepoFileSource over generated text. `manifestText` undefined means package.json is missing (404);
 * `lockfileText` undefined means package-lock.json is missing (404).
 */
export function memoryFiles(
  manifestText: string | undefined,
  lockfileText?: string,
  opts: MemoryFilesOptions = {},
): MemoryFiles {
  const requests: MemoryFiles["requests"] = [];
  const source: RepoFileSource = (target, file) => {
    requests.push({ owner: target.owner, repo: target.repo, ref: target.ref, file });
    if (file === "package.json") {
      if (opts.failManifest) return Promise.resolve({ kind: "failed", category: opts.failManifest });
      return Promise.resolve(manifestText === undefined ? { kind: "not_found" } : { kind: "ok", text: manifestText });
    }
    if (opts.failLockfile) return Promise.resolve({ kind: "failed", category: opts.failLockfile });
    return Promise.resolve(lockfileText === undefined ? { kind: "not_found" } : { kind: "ok", text: lockfileText });
  };
  return { source, requests };
}
