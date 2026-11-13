import fc from "fast-check";
import { DEFAULT_WEIGHT_CONFIG, SIGNAL_NAMES } from "./weights.js";
import { scoreDeathV1 } from "./__reference__/score-v1.js";
import { toGrade } from "./grade.js";
import {
  declaredAbandonedArb,
  disabledFloorConfigArb,
  notDeclaredAbandonedArb,
  packageSignalsArb as anySignalsArb,
  deathDominatingPairArb,
  fullyKnownPackageSignalsArb,
  packageSignalsArb,
  weightConfigArb,
} from "./arbitraries.js";
import type {
  DeathScoreResult,
  PackageSignals,
  SignalName,
  SignalValue,
  WeightConfig,
} from "./types.js";

/** Any implementation of the engine's public entry point. */
export type ScoreFn = (
  signals: PackageSignals,
  config?: WeightConfig,
) => DeathScoreResult;

export interface NamedProperty {
  name: string;
  /** Build the fast-check property against a given implementation. */
  build: (score: ScoreFn) => fc.IProperty<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** The most-alive (severity factor = 0) value for a signal under `config`. */
export function mostAliveValue(
  signal: SignalName,
  config: WeightConfig = DEFAULT_WEIGHT_CONFIG,
): SignalValue<boolean> | SignalValue<number> {
  switch (signal) {
    case "deprecated":
    case "repoArchived":
    case "knownReplacementExists":
      return { kind: "known", value: false };
    case "monthsSinceLastPublish":
    case "monthsSinceLastCommit":
    case "openVulnsNoFix":
      return { kind: "known", value: 0 };
    case "maintainerCount":
      return { kind: "known", value: config.maintainerCountFullAlive };
  }
}

/** Structural equality for plain JSON-like results (stable key order). */
function sameResult(a: DeathScoreResult, b: DeathScoreResult): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Property 1: Bounded. Validates: Requirements 1.2, 1.3
export const boundedProperty: NamedProperty = {
  name: "Property 1: Bounded",
  build: (score) =>
    fc.property(packageSignalsArb, weightConfigArb, (signals, config) => {
      const { score: s } = score(signals, config);
      return s >= 0 && s <= 100;
    }),
};

// Property 2: Transparent. Validates: Requirements 2.3
export const transparentProperty: NamedProperty = {
  name: "Property 2: Transparent",
  build: (score) =>
    fc.property(packageSignalsArb, (signals) => {
      const result = score(signals, DEFAULT_WEIGHT_CONFIG);
      const sum = result.parts.reduce((acc, p) => acc + p.points, 0);
      return sum === result.score && result.parts.length === SIGNAL_NAMES.length;
    }),
};

// Property 3: Deterministic. Validates: Requirements 6.2
export const deterministicProperty: NamedProperty = {
  name: "Property 3: Deterministic",
  build: (score) =>
    fc.property(packageSignalsArb, weightConfigArb, (signals, config) => {
      const first = score(signals, config);
      const second = score(signals, config);
      const signalsCopy = JSON.parse(JSON.stringify(signals)) as PackageSignals;
      const configCopy = JSON.parse(JSON.stringify(config)) as WeightConfig;
      const third = score(signalsCopy, configCopy);
      return sameResult(first, second) && sameResult(first, third);
    }),
};

// Property 4: Monotonic in the death direction. Validates: Requirements 7.1
export const monotonicProperty: NamedProperty = {
  name: "Property 4: Monotonic",
  build: (score) =>
    fc.property(deathDominatingPairArb, ([a, b]) => {
      return (
        score(b, DEFAULT_WEIGHT_CONFIG).score >=
        score(a, DEFAULT_WEIGHT_CONFIG).score
      );
    }),
};

/**
 * Property 5: Unknown is not alive. Validates: Requirements 4.3
 *
 * Asserts `unknown > most-alive` (strict, as in the design). Under the default config
 * every weight is >= 3, so an unknown signal adds >= 1.5 float points over the
 * most-alive value and the rounded score must be strictly greater. We assert
 * that strict form too: a bare `>=` is satisfied by an engine that treats
 * unknown as alive (equal scores), which would make the property unable to
 * fail against that sabotage (proof-rules.md: no trivial passes).
 */
export const unknownNotAliveProperty: NamedProperty = {
  name: "Property 5: Unknown is not alive",
  build: (score) =>
    fc.property(
      fullyKnownPackageSignalsArb,
      fc.constantFrom(...SIGNAL_NAMES),
      (signals, signal) => {
        const withUnknown = { ...signals, [signal]: { kind: "unknown" } } as PackageSignals;
        const withAlive = {
          ...signals,
          [signal]: mostAliveValue(signal),
        } as PackageSignals;
        const u = score(withUnknown, DEFAULT_WEIGHT_CONFIG).score;
        const a = score(withAlive, DEFAULT_WEIGHT_CONFIG).score;
        return u > a; // implies u >= a
      },
    ),
};

/**
 * TEST-ONLY mirror of `effectiveAbandonedFloor` (weights.ts, task 3.2):
 * absent -> 75; non-finite -> 0; otherwise round(clamp(v, 0, 100)).
 */
function expectedFloor(config: WeightConfig): number {
  const v = (config as { abandonedFloor?: number }).abandonedFloor;
  if (v === undefined) return 75;
  if (!Number.isFinite(v)) return 0;
  return Math.round(Math.min(100, Math.max(0, v)));
}

/** Which signals fired for C(X), mirroring the reason-text rule in design.md. */
function firedTerms(signals: PackageSignals): string[] {
  const dep = signals.deprecated.kind === "known" && signals.deprecated.value;
  const arc = signals.repoArchived.kind === "known" && signals.repoArchived.value;
  if (dep && arc) return ["deprecated", "archived"];
  return [dep ? "deprecated" : "archived", "publish"];
}

/**
 * Property 6: Fix checking (Declared_Abandoned is dead).
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 *
 * Oracle: `scoreDeathV1` (frozen Reference_Implementation) gives S and parts.
 * NOT in ALL_PROPERTIES until task 3.5 (it fails on the unfixed engine).
 */
export const declaredAbandonedProperty: NamedProperty = {
  name: "Property 6: Declared abandoned is dead",
  build: (score) =>
    fc.property(declaredAbandonedArb, ([signals, config]) => {
      const ref = scoreDeathV1(signals, config);
      const S = ref.score;
      const F = expectedFloor(config);
      const result = score(signals, config);
      const sum = result.parts.reduce((acc, p) => acc + p.points, 0);
      // `calibration` is not on DeathScoreResult until task 3.1; read it structurally.
      const cal = (
        result as { calibration?: { rule: string; reason: string; points: number } }
      ).calibration;
      if (result.score !== Math.max(S, F)) return false;
      if (JSON.stringify(result.parts) !== JSON.stringify(ref.parts)) return false;
      if (result.score !== sum + (cal?.points ?? 0)) return false;
      if ((cal !== undefined) !== (F > 0 && S < F)) return false;
      if (cal !== undefined) {
        if (cal.rule !== "declared_abandoned") return false;
        if (cal.points !== result.score - S || cal.points <= 0) return false;
        if (cal.reason.length === 0) return false;
        const reason = cal.reason.toLowerCase();
        if (!firedTerms(signals).every((t) => reason.includes(t))) return false;
      }
      if (config === DEFAULT_WEIGHT_CONFIG) {
        if (result.grade !== "dead" || result.score < 75) return false;
      }
      return result.grade === toGrade(result.score);
    }),
};

/**
 * Property 7: Preservation. Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.8
 *
 * (a) NOT C(X) with any floor config, (b) any signals with abandonedFloor 0:
 * the result is identical to the Reference_Implementation and has no
 * `calibration` key. NOT in ALL_PROPERTIES until task 3.5.
 */
export const preservationProperty: NamedProperty = {
  name: "Property 7: Preservation",
  build: (score) =>
    fc.property(
      fc.oneof(
        notDeclaredAbandonedArb,
        fc
          .tuple(anySignalsArb, disabledFloorConfigArb)
          .map(([s, c]): [PackageSignals, WeightConfig] => [s, c]),
      ),
      ([signals, config]) => {
        const result = score(signals, config);
        return (
          JSON.stringify(result) === JSON.stringify(scoreDeathV1(signals, config)) &&
          !("calibration" in result)
        );
      },
    ),
};

export const ALL_PROPERTIES: readonly NamedProperty[] = [
  boundedProperty,
  transparentProperty,
  deterministicProperty,
  monotonicProperty,
  unknownNotAliveProperty,
];
