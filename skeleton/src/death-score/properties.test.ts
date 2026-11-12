import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { scoreDeath } from "./score.js";
import { DEFAULT_WEIGHT_CONFIG, SIGNAL_NAMES } from "./weights.js";
import {
  fullyKnownPackageSignalsArb,
  packageSignalsArb,
  weightConfigArb,
} from "./arbitraries.js";
import type {
  PackageSignals,
  SignalName,
  SignalValue,
  WeightConfig,
} from "./types.js";

const NUM_RUNS = 100;

// ---------------------------------------------------------------------------
// Property 1: Bounded
// Validates: Requirements 1.2, 1.3
// For any PackageSignals and WeightConfig with non-negative weights and
// unknownFactor in (0, 1], the score is in [0, 100].
// ---------------------------------------------------------------------------

describe("Property 1: Bounded", () => {
  it("score is always in [0, 100]", () => {
    fc.assert(
      fc.property(
        packageSignalsArb,
        weightConfigArb,
        (signals: PackageSignals, config: WeightConfig) => {
          const result = scoreDeath(signals, config);
          return result.score >= 0 && result.score <= 100;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Transparent (parts add up)
// Validates: Requirements 2.3
// For any PackageSignals (default config), sum(parts.points) === score
// and there is exactly one part per signal.
// ---------------------------------------------------------------------------

describe("Property 2: Transparent", () => {
  it("parts sum to score and one part per signal", () => {
    fc.assert(
      fc.property(packageSignalsArb, (signals: PackageSignals) => {
        const result = scoreDeath(signals, DEFAULT_WEIGHT_CONFIG);
        const sum = result.parts.reduce((s, p) => s + p.points, 0);
        return sum === result.score && result.parts.length === SIGNAL_NAMES.length;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("every part has a valid signal name from SIGNAL_NAMES", () => {
    fc.assert(
      fc.property(packageSignalsArb, (signals: PackageSignals) => {
        const result = scoreDeath(signals, DEFAULT_WEIGHT_CONFIG);
        return result.parts.every((p) => SIGNAL_NAMES.includes(p.signal));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Deterministic
// Validates: Requirements 6.2
// scoreDeath(x, c) deep-equals a second call, and structurally equal inputs
// produce structurally equal results.
// ---------------------------------------------------------------------------

describe("Property 3: Deterministic", () => {
  it("same inputs produce same results on a second call", () => {
    fc.assert(
      fc.property(
        packageSignalsArb,
        weightConfigArb,
        (signals: PackageSignals, config: WeightConfig) => {
          const result1 = scoreDeath(signals, config);
          const result2 = scoreDeath(signals, config);
          expect(result1).toEqual(result2);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("structurally equal inputs produce structurally equal results", () => {
    fc.assert(
      fc.property(
        packageSignalsArb,
        weightConfigArb,
        (signals: PackageSignals, config: WeightConfig) => {
          const signalsCopy = JSON.parse(JSON.stringify(signals)) as PackageSignals;
          const configCopy = JSON.parse(JSON.stringify(config)) as WeightConfig;
          const result1 = scoreDeath(signals, config);
          const result2 = scoreDeath(signalsCopy, configCopy);
          expect(result1).toEqual(result2);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Unknown is not alive
// Validates: Requirements 4.3
// For any fully-known PackageSignals and any single signal index i,
// setting signal i to unknown yields a score >= setting signal i to its
// most-alive value, all other signals equal.
// ---------------------------------------------------------------------------

/** The most-alive (severity factor = 0) value for a signal, using the default config. */
function mostAliveValue(
  signal: SignalName,
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
      return {
        kind: "known",
        value: DEFAULT_WEIGHT_CONFIG.maintainerCountFullAlive,
      };
  }
}

describe("Property 5: Unknown is not alive", () => {
  it("unknown signal scores >= most-alive signal", () => {
    fc.assert(
      fc.property(
        fullyKnownPackageSignalsArb,
        fc.constantFrom(...SIGNAL_NAMES),
        (signals: PackageSignals, signal: SignalName) => {
          // Replace signal i with unknown
          const withUnknown = {
            ...signals,
            [signal]: { kind: "unknown" },
          } as PackageSignals;
          // Replace signal i with its most-alive value
          const withMostAlive = {
            ...signals,
            [signal]: mostAliveValue(signal),
          } as PackageSignals;

          const scoreUnknown = scoreDeath(withUnknown, DEFAULT_WEIGHT_CONFIG).score;
          const scoreAlive = scoreDeath(
            withMostAlive,
            DEFAULT_WEIGHT_CONFIG,
          ).score;

          return scoreUnknown >= scoreAlive;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
