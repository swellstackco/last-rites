import fc from "fast-check";
import { DEFAULT_WEIGHT_CONFIG, SIGNAL_NAMES } from "./weights.js";
import {
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

export const ALL_PROPERTIES: readonly NamedProperty[] = [
  boundedProperty,
  transparentProperty,
  deterministicProperty,
  monotonicProperty,
  unknownNotAliveProperty,
];
