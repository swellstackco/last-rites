// Small builders for Proof_Reports used by the page tests. Reports are consistent by construction
// and serialized with the real `serializeProofReport`, so the page parses exactly what a file holds.
import { serializeProofReport } from "@last-rites/skeleton/proof";
import type { CallSite, ImportSite, ProofAttempt, ProofReport } from "@last-rites/skeleton/proof";

export type ProofKind = "proved" | "weak" | "counterexample" | "no_call_sites" | "error";

export interface BuildProofOptions {
  /** Written into every free-text field of the report that the page may show. */
  hostile?: string;
  /** Number of call sites (ignored for `no_call_sites`). Default 2. */
  callSites?: number;
  /** For `no_call_sites`: number of import sites. Default 0 (recommendation remove-dependency). */
  importSites?: number;
  repo?: string;
  package?: string;
}

export const HOSTILE_STRINGS = ["<img src=x onerror=alert(1)>", "javascript:alert(1)", "&lt;b&gt;"] as const;

function callSite(i: number, hostile: string | undefined): CallSite {
  const file = hostile ?? `src/file-${i}.js`;
  return {
    file: i === 0 ? file : hostile === undefined ? file : `${hostile}-${i}`,
    line: i + 1,
    column: 3,
    callee: hostile ?? "dd",
    member: "",
    argCount: 2,
    argTexts: [hostile ?? "a", hostile ?? "b"],
    enclosing: i % 2 === 0 ? "src" : "test",
  };
}

function importSite(i: number): ImportSite {
  return { file: `src/imp-${i}.js`, line: i + 1, column: 1, form: "import-default" };
}

const NO_SABOTAGE = { applied: 0, caught: 0, survivors: [] as string[] };

function attemptOf(kind: ProofKind, n: number, hostile: string | undefined): ProofAttempt {
  const base = {
    attempt: n,
    candidate: { name: hostile ?? `candidate-${n}`, source: hostile ?? `demo/proofs/candidates/c${n}.js` },
    numRuns: 200,
    runs: 400,
    seed: 1234 + n,
    shapes: [{ id: "intersect", status: "passed" as const, runs: 400, coverage: { "multi-list": 400 } }],
  };
  switch (kind) {
    case "proved":
      return { ...base, status: "proved", weak: false, sabotage: { applied: 4, caught: 4, survivors: [] } };
    case "weak":
      return {
        ...base,
        status: "proved",
        weak: true,
        sabotage: { applied: 4, caught: 3, survivors: [hostile ?? "intersect:drop-last-element"] },
      };
    case "counterexample":
      return {
        ...base,
        status: "counterexample",
        weak: false,
        shapes: [{ id: "intersect", status: "failed", runs: 7, coverage: {} }],
        counterexample: {
          shape: "intersect",
          input: hostile ?? '[["a","a"],["a"]]',
          shrinks: 3,
          path: "6:1:0",
          oldOutput: hostile ?? '["a"]',
          newOutput: hostile ?? '["a","a"]',
          oldProjected: hostile ?? '["a"]',
          newProjected: hostile ?? '["a","a"]',
        },
        sabotage: NO_SABOTAGE,
      };
    case "no_call_sites":
      return { ...base, status: "no-call-sites", weak: false, shapes: [], sabotage: NO_SABOTAGE };
    case "error":
      return {
        ...base,
        status: "error",
        weak: false,
        shapes: [],
        error: { code: "no_recipe", message: hostile ?? "no recipe for this package" },
        sabotage: NO_SABOTAGE,
      };
  }
}

/** A consistent report whose last attempt has the given kind; `history` kinds come before it. */
export function buildProofReport(
  kind: ProofKind,
  options: BuildProofOptions = {},
  history: readonly ProofKind[] = [],
): ProofReport {
  const hostile = options.hostile;
  const kinds = [...history, kind];
  const noSites = kinds.some((k) => k === "no_call_sites");
  const siteCount = noSites ? 0 : (options.callSites ?? 2);
  const importCount = options.importSites ?? 0;
  const attempts = kinds.map((k, i) => {
    const a = attemptOf(k, i + 1, hostile);
    if (k === "no_call_sites") a.recommendation = importCount === 0 ? "remove-dependency" : "review-imports";
    return a;
  });
  const report: ProofReport = {
    repo: options.repo ?? hostile ?? "parse-server",
    package: options.package ?? hostile ?? "intersect",
    filesScanned: 12,
    callSites: Array.from({ length: siteCount }, (_, i) => callSite(i, hostile)),
    importSites: Array.from({ length: importCount }, (_, i) => importSite(i)),
    attempts,
  };
  if (hostile !== undefined) report.commit = hostile;
  return report;
}

export function buildProofText(kind: ProofKind, options: BuildProofOptions = {}, history: readonly ProofKind[] = []): string {
  return serializeProofReport(buildProofReport(kind, options, history));
}
