import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TempCache {
  /** Cache root directory (the cache layer creates `.cache/` inside it). */
  root: string;
  cleanup(): void;
}

/** Fresh temp directory per call, so runs never share cache state. */
export function createTempCache(): TempCache {
  const root = mkdtempSync(join(tmpdir(), "exorcist-evidence-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
