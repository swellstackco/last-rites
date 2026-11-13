import type { DeathScoreResult, GradeBand, PackageSignals } from "@graveyard-kit/skeleton";
import type { EvidenceResult, FailureCategory, ReplacementInfo } from "../evidence/index.js";

export type DependencyKind = "dependencies" | "devDependencies" | "optionalDependencies" | "peerDependencies";

/** Kind_Precedence. A name's Declared_Range comes from the first kind in this list that has it. */
export const KIND_PRECEDENCE: readonly DependencyKind[] = [
  "dependencies",
  "optionalDependencies",
  "devDependencies",
  "peerDependencies",
];

export type SkipReason = "npm_alias" | "git" | "file" | "link" | "http" | "workspace" | "other";

export interface DependencyEntry {
  name: string;
  /** Every kind the name appears in, in Kind_Precedence order, no duplicates. */
  kinds: readonly DependencyKind[];
  /** The string from the first kind in Kind_Precedence, unchanged. */
  declaredRange: string;
  /** Present only when versionSource is "lockfile". */
  resolvedVersion?: string;
  versionSource: "lockfile" | "range";
}

export interface SkippedEntry {
  name: string;
  /** The first kind in Kind_Precedence that lists the name. */
  kind: DependencyKind;
  specifier: string;
  reason: SkipReason;
}

export interface InventoryResult {
  /** Sorted by name, UTF-16 code-unit order. */
  dependencies: DependencyEntry[];
  /** Sorted by name, UTF-16 code-unit order. */
  skipped: SkippedEntry[];
  warnings: string[];
  lockfile: "used" | "absent";
}

export interface InventoryError {
  code: "malformed_package_json" | "invalid_package_json_shape";
  message: string;
}

export type InventoryOutcome =
  | { ok: true; inventory: InventoryResult }
  | { ok: false; error: InventoryError };

/** The npm adapter's inventory stage. Pure. Never throws. */
export type InventoryStage = (manifestText: string, lockfileText?: string) => InventoryOutcome;

/** Raw caller input to the pipeline. */
export interface RepoInput {
  owner: string;
  repo: string;
  ref?: string;
}

/** Validated target. `ref` is the requested ref, or "HEAD". */
export interface RepoTarget {
  owner: string;
  repo: string;
  ref: string;
}

export interface ScannedDependency extends DependencyEntry {
  signals: PackageSignals;
  unknownReasons: EvidenceResult["unknownReasons"];
  replacement?: ReplacementInfo;
  evidenceWarnings: string[];
  death: DeathScoreResult;
}

export interface ScanSummary {
  total: number;
  skipped: number;
  /** One count per GradeBand. */
  alive: number;
  ailing: number;
  dying: number;
  dead: number;
}

export interface ScanReport {
  /** "owner/repo" */
  repo: string;
  /** The Repo_Target ref. */
  ref: string;
  /** Absent for npm reports. Serialized only for "github-actions". */
  ecosystem?: "npm" | "github-actions";
  /** ISO 8601, from the one Clock reading. */
  scannedAt: string;
  dependencies: ScannedDependency[];
  skipped: SkippedEntry[];
  warnings: string[];
  summary: ScanSummary;
}

export type FetchFailureCategory = Extract<FailureCategory, "network_error" | "timeout" | "rate_limited">;

export type ScanError =
  | { code: "repo_fetch_failed"; message: string; failureCategory: FetchFailureCategory }
  | {
      code:
        | "invalid_repo"
        | "invalid_ref"
        | "no_package_json"
        | "malformed_package_json"
        | "invalid_package_json_shape"
        | "too_many_dependencies"
        | "scan_timeout"
        | "internal_error";
      message: string;
    };

export type ScanOutcome = { ok: true; report: ScanReport } | { ok: false; error: ScanError };

// Type-level check: the grade keys of ScanSummary are exactly GradeBand.
type SummaryGradeKeys = Exclude<keyof ScanSummary, "total" | "skipped">;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const SUMMARY_KEYS_MATCH_GRADE_BAND: Equal<SummaryGradeKeys, GradeBand> = true;
