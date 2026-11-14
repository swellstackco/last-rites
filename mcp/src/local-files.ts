import { join } from "node:path";
import type { RepoFileSource } from "@last-rites/exorcist-npm/programmatic";
import type { FsProbe } from "./guards.js";

/**
 * A `RepoFileSource` that reads `package.json` and `package-lock.json` from a local directory.
 * The `target` argument is ignored: the directory is the repository (Requirement 4.5).
 */
export function createLocalRepoFiles(probe: FsProbe, dir: string): RepoFileSource {
  return async (_target, file) => {
    const text = await probe.readText(join(dir, file));
    return text === undefined ? { kind: "not_found" } : { kind: "ok", text };
  };
}
