import { RECIPES, createUsageSurface } from "@last-rites/exorcist-npm/programmatic";
import { createMemoryFs } from "@last-rites/exorcist-npm/programmatic/testing";
import type { ExorcistDeps } from "../deps.js";
import { loadOracle } from "../oracles-static.js";
import { makeDeps, memoryProbe, recordingReportFs } from "./fakes.js";
import { loadTree } from "./trees.js";

/** A de-duplicating "replacement": Set based, so it drops repeats the oracle keeps. */
function dedup(lists: string[][]): string[] {
  if (lists.length === 0) return [];
  return [...lists.map((l) => new Set(l)).reduce((a, b) => new Set([...a].filter((x) => b.has(x))))];
}
export const dedupCandidate = Object.assign((l: string[][]) => dedup(l), { big: (l: string[][]) => dedup(l) });

/** The real oracle module of a pinned package (what a call-through candidate re-exports). */
export const oracleModule = (pkg: string): unknown => loadOracle(pkg)!.module;

/**
 * Deps for `generate_pin_tests` over a fixture tree mounted at `/work/<tree>`, with the real usage surface,
 * recipes and oracles. `candidates` maps `/work/<file>` to the module the loader returns for it.
 */
export function proofDeps(tree: string, candidates: Record<string, unknown> = {}, extra: Partial<ExorcistDeps> = {}) {
  const files = loadTree(tree);
  const mounted = Object.fromEntries(Object.entries(files).map(([k, v]) => [`/work/${tree}/${k}`, v]));
  const candidateFiles = Object.fromEntries(Object.keys(candidates).map((k) => [`/work/${k}`, `// ${k}\n`]));
  const probe = memoryProbe({ ...mounted, ...candidateFiles });
  const reportFs = recordingReportFs();
  const deps = makeDeps({
    probe,
    usageSurface: createUsageSurface({ fs: createMemoryFs(files, `/work/${tree}`) }),
    proof: {
      recipes: new Map(Object.entries(RECIPES)),
      loadOracle,
      async loadCandidate(file) {
        const key = file.replace(/^\/work\//, "");
        if (!(key in candidates)) throw new Error(`cannot read candidate file: ${file}`);
        return { module: candidates[key], name: key, source: `// ${key}\n` };
      },
      nodeReportFs: reportFs,
      repoRoot: "/work",
    },
    ...extra,
  });
  return { deps, probe, reportFs };
}
