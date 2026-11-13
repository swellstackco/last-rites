import type fc from "fast-check";
import type {
  CallSite,
  ImportSite,
  ProofErrorCode,
  ProofStatus,
  Recommendation,
  SabotageSummary,
  ShapeResult,
  UsageSurfaceResult,
} from "../types.js";

export type OutputKind = "array" | "object" | "boolean" | "opaque";

export interface Projection {
  name: "identity" | "isUndefined";
  observes: "value" | "definedness";
  /** identity: v => v; isUndefined: v => v === undefined */
  apply(value: unknown): unknown;
}

export type Outcome = { kind: "returned"; value: unknown } | { kind: "threw" };

export interface CallShape {
  /** "intersect.big" */
  id: string;
  /** "" | "big" */
  member: string;
  argCount: number;
  outputKind: OutputKind;
  orderSensitive: boolean;
  projection: Projection;
  accepts(site: CallSite): boolean;
  arbitrary: fc.Arbitrary<unknown[]>;
  guard(args: unknown[]): boolean;
  classify(args: unknown[], oracle: Outcome): string[];
  requiredLabels: readonly string[];
}

export interface Recipe {
  package: string;
  expectedVersion?: string;
  shapes: readonly CallShape[];
}

export interface Mutator {
  name: "reverse-array" | "drop-last" | "return-undefined" | "swap-first-two-args" | "add-key" | "return-defined";
  applicable(shape: CallShape): boolean;
  wrap(fn: (...a: unknown[]) => unknown): (...a: unknown[]) => unknown;
}

export interface ProofInput {
  package: string;
  usage: UsageSurfaceResult;
  recipe?: Recipe;
  oracle?: unknown;
  oracleVersion?: string;
  candidate?: unknown;
  numRuns: number;
  seed: number;
  /** Default BUILT_IN_MUTATORS (tests inject). */
  mutators?: readonly Mutator[];
}

export interface ProofResult {
  status: ProofStatus;
  weak: boolean;
  runs: number;
  numRuns: number;
  seed: number;
  shapes: ShapeResult[];
  counterexample?: { shape: string; args: unknown[]; input: string; shrinks: number; path: string };
  oldOutput?: string;
  newOutput?: string;
  oldProjected?: string;
  newProjected?: string;
  callSites: CallSite[];
  importSites: ImportSite[];
  recommendation?: Recommendation;
  error?: { code: ProofErrorCode; message: string };
  sabotage: SabotageSummary;
}
