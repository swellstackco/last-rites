import type { CallSite, ImportSite } from "./types.js";

type Positioned = Pick<CallSite | ImportSite, "file" | "line" | "column">;

/** Order by file (UTF-16 code unit), then line, then column. */
export function compareSites(a: Positioned, b: Positioned): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.line !== b.line) return a.line - b.line;
  return a.column - b.column;
}

/** Returns a new, stably sorted array; the input is not modified. */
export function sortSites<T extends Positioned>(sites: readonly T[]): T[] {
  return [...sites].sort(compareSites);
}
