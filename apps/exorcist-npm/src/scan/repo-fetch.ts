import type { CacheLayer } from "../evidence/http/cache.js";
import { classifyStatus } from "../evidence/http/fetch-json.js";
import type { RepoTarget, FetchFailureCategory } from "./types.js";

export type RepoFileName = "package.json" | "package-lock.json";

export type FileFetch =
  | { kind: "ok"; text: string }
  | { kind: "not_found" }
  | { kind: "failed"; category: FetchFailureCategory };

/** Seam for tests: the pipeline depends on this function type, not on CacheLayer. */
export type RepoFileSource = (target: RepoTarget, file: RepoFileName) => Promise<FileFetch>;

export function createRepoFileSource(cache: Pick<CacheLayer, "get">, requestTimeoutMs: number): RepoFileSource {
  return async (target, file) => {
    // Plain GET, no headers: no token can be attached.
    const url = `https://raw.githubusercontent.com/${target.owner}/${target.repo}/${target.ref}/${file}`;
    try {
      const result = await cache.get("github", { method: "GET", url, timeoutMs: requestTimeoutMs });
      if (result.ok) return { kind: "ok", text: result.response.body };
      if (result.failure.kind === "transport") return { kind: "failed", category: result.failure.category };
      const res = result.failure.response;
      if (res.status === 404) return { kind: "not_found" };
      const category = classifyStatus(res);
      return { kind: "failed", category: category === "rate_limited" || category === "timeout" ? category : "network_error" };
    } catch {
      return { kind: "failed", category: "network_error" };
    }
  };
}
