// Requirements 1.4-1.6, 2.1-2.9: the npm usage surface. Reads only, through an injected SourceFs; never throws.
import type { CallSite, ImportSite, UsageSurface, UsageSurfaceResult } from "@last-rites/skeleton/proof";
import { sortSites } from "@last-rites/skeleton/proof";
import ts from "typescript";
import { collectBindings } from "./bindings.js";
import { collectCallSites } from "./calls.js";
import { enclosingOf } from "./classify-path.js";
import type { SourceFs } from "./source-fs.js";

const SKIPPED_DIRS: ReadonlySet<string> = new Set(["node_modules", "dist", "build", "coverage", ".git"]);
const EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"] as const;
const DECLARATION_SUFFIXES = [".d.ts", ".d.mts", ".d.cts"] as const;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 50000;

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function eligible(name: string): boolean {
  if (DECLARATION_SUFFIXES.some((s) => name.endsWith(s))) return false;
  return EXTENSIONS.some((e) => name.endsWith(e));
}

function scriptKindOf(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".ts") || file.endsWith(".mts") || file.endsWith(".cts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JSX;
}

/** The only use of a compiler-internal field: the count of syntax diagnostics of a parsed file. */
export function syntaxDiagnosticCount(sf: ts.SourceFile): number {
  const list = (sf as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics;
  return Array.isArray(list) ? list.length : 0;
}

export interface ParsedSource {
  importSites: ImportSite[];
  callSites: CallSite[];
  diagnostics: number;
}

/** `file` is relative to the scan root. */
export function parseSource(file: string, text: string, pkg: string): ParsedSource {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindOf(file));
  const { bindings, importSites } = collectBindings(sf, pkg);
  const callSites = collectCallSites(sf, bindings, pkg, enclosingOf(file));
  return { importSites, callSites, diagnostics: syntaxDiagnosticCount(sf) };
}

export function createUsageSurface(deps: { fs: SourceFs }): UsageSurface {
  const { fs } = deps;
  return async ({ root, package: pkg }): Promise<UsageSurfaceResult> => {
    const warnings: string[] = [];
    const callSites: CallSite[] = [];
    const importSites: ImportSite[] = [];
    let filesScanned = 0;
    let visited = 0;
    let stopped = false;
    const base = root.length > 1 ? root.replace(/\/+$/, "") : root;

    const readFileSafely = async (path: string): Promise<string | undefined> => {
      try {
        return await fs.readText(path);
      } catch {
        return undefined;
      }
    };

    const scanFile = async (rel: string, size: number | undefined): Promise<void> => {
      if (size !== undefined && size > MAX_BYTES) {
        warnings.push(`${rel}: skipped, larger than 2 MiB`);
        return;
      }
      const text = await readFileSafely(`${base}/${rel}`);
      if (text === undefined) {
        warnings.push(`${rel}: skipped, could not be read`);
        return;
      }
      if (text.length > MAX_BYTES) {
        warnings.push(`${rel}: skipped, larger than 2 MiB`);
        return;
      }
      filesScanned++;
      try {
        const parsed = parseSource(rel, text, pkg);
        if (parsed.diagnostics > 0) warnings.push(`${rel}: ${parsed.diagnostics} syntax diagnostics`);
        callSites.push(...parsed.callSites);
        importSites.push(...parsed.importSites);
      } catch {
        warnings.push(`${rel}: skipped, could not be parsed`);
      }
    };

    const walk = async (rel: string): Promise<void> => {
      if (stopped) return;
      let entries;
      try {
        entries = await fs.readDir(rel === "" ? base : `${base}/${rel}`);
      } catch {
        entries = undefined;
      }
      if (entries === undefined) {
        warnings.push(rel === "" ? `${root}: not a readable directory` : `${rel}: directory could not be read`);
        return;
      }
      // Sorted so that the file-count guard is reproducible whatever order the file system lists.
      const sorted = [...entries].sort((a, b) => byCodeUnit(a.name, b.name));
      for (const e of sorted) {
        if (stopped) return;
        const path = rel === "" ? e.name : `${rel}/${e.name}`;
        if (e.kind === "dir") {
          if (!SKIPPED_DIRS.has(e.name)) await walk(path);
        } else if (e.kind === "file" && eligible(e.name)) {
          if (++visited > MAX_FILES) {
            warnings.push(`${root}: stopped after ${MAX_FILES} files`);
            stopped = true;
            return;
          }
          await scanFile(path, e.size);
        }
      }
    };

    try {
      await walk("");
    } catch {
      warnings.push(`${root}: scan stopped by an unexpected error`);
    }

    return {
      package: pkg,
      filesScanned,
      callSites: sortSites(callSites),
      importSites: sortSites(importSites),
      warnings: [...warnings].sort(byCodeUnit),
    };
  };
}
