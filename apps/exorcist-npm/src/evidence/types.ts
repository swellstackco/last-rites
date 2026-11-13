import type { PackageSignals, SignalName } from "@graveyard-kit/skeleton";

export type Source = "npm" | "github" | "osv" | "e18e" | "depsdev";

export type FailureCategory =
  | "not_found"
  | "timeout"
  | "rate_limited"
  | "malformed_response"
  | "network_error"
  | "not_applicable"
  | "incomplete";

export interface UnknownReason {
  source: Source;
  category: FailureCategory;
  /** Human-readable, built from the category and the public URL only. Never contains a token. */
  message: string;
}

export interface ReplacementInfo {
  /** As reported by the manifest. */
  type: string;
  /** First entry of `replacements`, absent when none. */
  replacement?: string;
  /** All entries, in manifest order (may be empty). */
  replacements: readonly string[];
}

export interface EvidenceInput {
  name: string;
  versionRange?: string;
  /** ISO 8601 or Date. */
  now: Date | string;
}

export interface EvidenceResult {
  signals: PackageSignals;
  /** Exactly one entry per unknown signal and no entry for a known signal. */
  unknownReasons: Partial<Record<SignalName, UnknownReason>>;
  replacement?: ReplacementInfo;
  warnings: string[];
}

export type EvidenceStage = (input: EvidenceInput) => Promise<EvidenceResult>;

/** Empty name or invalid now. */
export class EvidenceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceInputError";
  }
}

/** Bad concurrency, retries, TTL, ... */
export class EvidenceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceConfigError";
  }
}
