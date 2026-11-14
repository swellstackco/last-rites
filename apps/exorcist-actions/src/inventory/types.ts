import type { SourceFs } from "@graveyard-kit/exorcist-npm/programmatic";

export type RefKind = "sha" | "mutable";

export interface LineRange {
  start: number;
  end: number;
  eolEnd: number;
}

export interface WithKey {
  name: string;
  /** Offset and length of the key text. */
  offset: number;
  length: number;
  /** Whole-line range (without the line ending) when the entry is a single-line `key: value` line. */
  line?: LineRange;
}

export interface ActionUse {
  file: string; // repository-relative, "/" separators
  line: number; // 1-based
  column: number; // 1-based
  offset: number; // Source_Offset of the Uses_String content
  length: number;
  owner: string;
  repo: string;
  path?: string;
  ref: string;
  refKind: RefKind;
  with: Record<string, string>;
  withKeys: WithKey[]; // source order
  withLine?: LineRange; // the `with:` key line, when single-line
  jobId: string;
  site: "step" | "job";
  stepIndex?: number;
  stepId?: string;
  outputRefs: string[]; // sorted, unique
}

export type SkipReasonActions = "docker" | "local" | "no_ref" | "malformed" | "unsupported_value";

export interface SkippedUse {
  file: string;
  line: number;
  column: number;
  specifier: string;
  reason: SkipReasonActions;
}

export interface InventoryResult {
  uses: ActionUse[];
  skipped: SkippedUse[];
  warnings: string[];
  filesRead: number;
}

export type Inventory = (fs: SourceFs, root: string) => Promise<InventoryResult>;
