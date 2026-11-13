// Pure proof types. No fast-check, Node or app imports.

export type Enclosing = "src" | "test";

export type ImportForm =
  | "import-default"
  | "import-named"
  | "import-namespace"
  | "import-side-effect"
  | "import-type"
  | "import-equals"
  | "re-export"
  | "require"
  | "require-unbound"
  | "dynamic-import";

export interface CallSite {
  file: string;
  line: number;
  column: number;
  /** Source text of the callee expression. */
  callee: string;
  /** "" | "big" | "./get.x" | "<dynamic>" */
  member: string;
  argCount: number;
  /** Collapsed whitespace, cut at 200 code units + "…". */
  argTexts: string[];
  enclosing: Enclosing;
  consumedAs?: "undefined-check";
  new?: true;
}

export interface ImportSite {
  file: string;
  line: number;
  column: number;
  form: ImportForm;
}

export interface UsageSurfaceInput {
  root: string;
  package: string;
}

export interface UsageSurfaceResult {
  package: string;
  filesScanned: number;
  callSites: CallSite[];
  importSites: ImportSite[];
  warnings: string[];
}

export type UsageSurface = (input: UsageSurfaceInput) => Promise<UsageSurfaceResult>;

export type ProofStatus = "proved" | "counterexample" | "no-call-sites" | "error";

export type ProofErrorCode =
  | "invalid_runs"
  | "no_source_files"
  | "no_recipe"
  | "oracle_version_mismatch"
  | "unsupported_call_shapes"
  | "oracle_missing_member"
  | "candidate_missing_member"
  | "arbitrary_mismatch"
  | "async_not_supported"
  | "recipe_failure"
  | "insufficient_coverage";

export type Recommendation = "remove-dependency" | "review-imports";

export interface ShapeResult {
  id: string;
  status: "passed" | "failed" | "skipped" | "error";
  runs: number;
  /** Keys are sorted on serialize. */
  coverage: Record<string, number>;
}

export interface SabotageSummary {
  applied: number;
  caught: number;
  survivors: string[];
}

export interface CounterexampleRecord {
  shape: string;
  input: string;
  shrinks: number;
  path: string;
  oldOutput: string;
  newOutput: string;
  oldProjected: string;
  newProjected: string;
}

export interface ProofAttempt {
  attempt: number;
  candidate?: { name: string; source: string };
  status: ProofStatus;
  weak: boolean;
  numRuns: number;
  runs: number;
  seed: number;
  shapes: ShapeResult[];
  counterexample?: CounterexampleRecord;
  recommendation?: Recommendation;
  error?: { code: ProofErrorCode; message: string };
  sabotage: SabotageSummary;
}

export interface ProofReport {
  repo: string;
  commit?: string;
  package: string;
  oracleVersion?: string;
  filesScanned: number;
  callSites: CallSite[];
  importSites: ImportSite[];
  attempts: ProofAttempt[];
}
