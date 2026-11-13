import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface LoadedCandidate {
  module: unknown;
  /** Base name of the file. */
  name: string;
  /** Full source text. */
  source: string;
}

/**
 * Load a Candidate file: `default ?? namespace`. Rejects with a clear message, never with a stack.
 * A non-empty `cacheBust` adds `?cb=<cacheBust>` (not `?v=`, which Vite and vite-node strip) to the import URL so an edited file is re-evaluated.
 */
export async function loadCandidate(file: string, cacheBust?: string): Promise<LoadedCandidate> {
  const abs = resolve(file);
  let source: string;
  try {
    source = await readFile(abs, "utf8");
  } catch {
    throw new Error(`cannot read candidate file: ${file}`);
  }
  let ns: Record<string, unknown>;
  try {
    ns = (await import(
      cacheBust ? `${pathToFileURL(abs).href}?cb=${encodeURIComponent(cacheBust)}` : pathToFileURL(abs).href
    )) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`cannot import candidate file ${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { module: ns["default"] ?? ns, name: basename(abs), source };
}
