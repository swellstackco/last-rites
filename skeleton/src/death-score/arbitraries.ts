import fc from "fast-check";
import type {
  PackageSignals,
  SignalName,
  SignalValue,
  WeightConfig,
} from "./types.js";

// ---------------------------------------------------------------------------
// Signal-value generator
// ---------------------------------------------------------------------------

/**
 * Generate a `SignalValue<T>` that is either known (drawn from `knownArb`)
 * or unknown, with roughly equal probability.
 */
export function signalValueArb<T>(
  knownArb: fc.Arbitrary<T>,
): fc.Arbitrary<SignalValue<T>> {
  return fc.oneof(
    knownArb.map((v): SignalValue<T> => ({ kind: "known", value: v })),
    fc.constant({ kind: "unknown" }) as fc.Arbitrary<SignalValue<T>>,
  );
}

// ---------------------------------------------------------------------------
// PackageSignals generator
// ---------------------------------------------------------------------------

/** Realistic domains for each numeric signal. */
const monthsArb = fc.nat({ max: 120 }); // 0–10 years
const maintainerArb = fc.nat({ max: 20 }); // 0–20 maintainers
const vulnsArb = fc.nat({ max: 10 }); // 0–10 unfixed vulns

/**
 * Random `PackageSignals` where each signal is independently known (with a
 * realistic domain) or unknown.
 */
const randomPackageSignalsArb: fc.Arbitrary<PackageSignals> = fc.record({
  deprecated: signalValueArb(fc.boolean()),
  repoArchived: signalValueArb(fc.boolean()),
  monthsSinceLastPublish: signalValueArb(monthsArb),
  monthsSinceLastCommit: signalValueArb(monthsArb),
  maintainerCount: signalValueArb(maintainerArb),
  openVulnsNoFix: signalValueArb(vulnsArb),
  knownReplacementExists: signalValueArb(fc.boolean()),
});

// ---------------------------------------------------------------------------
// Edge-case signals
// ---------------------------------------------------------------------------

/** All signals at their most-alive values (default thresholds). */
const allAliveSignals: PackageSignals = {
  deprecated: { kind: "known", value: false },
  repoArchived: { kind: "known", value: false },
  monthsSinceLastPublish: { kind: "known", value: 0 },
  monthsSinceLastCommit: { kind: "known", value: 0 },
  maintainerCount: { kind: "known", value: 5 },
  openVulnsNoFix: { kind: "known", value: 0 },
  knownReplacementExists: { kind: "known", value: false },
};

/** All signals at their fully-dead values (default thresholds). */
const allDeadSignals: PackageSignals = {
  deprecated: { kind: "known", value: true },
  repoArchived: { kind: "known", value: true },
  monthsSinceLastPublish: { kind: "known", value: 24 },
  monthsSinceLastCommit: { kind: "known", value: 36 },
  maintainerCount: { kind: "known", value: 0 },
  openVulnsNoFix: { kind: "known", value: 1 },
  knownReplacementExists: { kind: "known", value: true },
};

/** All signals unknown. */
const allUnknownSignals: PackageSignals = {
  deprecated: { kind: "unknown" },
  repoArchived: { kind: "unknown" },
  monthsSinceLastPublish: { kind: "unknown" },
  monthsSinceLastCommit: { kind: "unknown" },
  maintainerCount: { kind: "unknown" },
  openVulnsNoFix: { kind: "unknown" },
  knownReplacementExists: { kind: "unknown" },
};

/** Random signals with maintainerCount fixed at 0 (fully dead for that signal). */
const zeroMaintainersArb: fc.Arbitrary<PackageSignals> =
  randomPackageSignalsArb.map((s): PackageSignals => ({
    ...s,
    maintainerCount: { kind: "known", value: 0 },
  }));

/** Random signals with months at the default boundary thresholds. */
const boundaryMonthsArb: fc.Arbitrary<PackageSignals> =
  randomPackageSignalsArb.map((s): PackageSignals => ({
    ...s,
    monthsSinceLastPublish: { kind: "known", value: 24 },
    monthsSinceLastCommit: { kind: "known", value: 36 },
  }));

/**
 * `PackageSignals` generator combining random signals with edge cases:
 * all-alive, all-dead, all-unknown, zero maintainers, and boundary months.
 */
export const packageSignalsArb: fc.Arbitrary<PackageSignals> = fc.oneof(
  randomPackageSignalsArb,
  fc.constant(allAliveSignals),
  fc.constant(allDeadSignals),
  fc.constant(allUnknownSignals),
  zeroMaintainersArb,
  boundaryMonthsArb,
);

// ---------------------------------------------------------------------------
// WeightConfig generator
// ---------------------------------------------------------------------------

const signalNames: SignalName[] = [
  "deprecated",
  "repoArchived",
  "monthsSinceLastPublish",
  "monthsSinceLastCommit",
  "maintainerCount",
  "openVulnsNoFix",
  "knownReplacementExists",
];

function weightsArb(): fc.Arbitrary<Record<SignalName, number>> {
  return fc.record(
    signalNames.reduce(
      (acc, name) => {
        acc[name] = fc.nat({ max: 50 });
        return acc;
      },
      {} as Record<SignalName, fc.Arbitrary<number>>,
    ),
  );
}

/**
 * `WeightConfig` generator with non-negative weights and `unknownFactor`
 * strictly in (0, 1].  Thresholds are at least 1 to avoid division by zero.
 */
export const weightConfigArb: fc.Arbitrary<WeightConfig> = fc.record({
  weights: weightsArb(),
  monthsSinceLastPublishFullDead: fc.integer({ min: 1, max: 60 }),
  monthsSinceLastCommitFullDead: fc.integer({ min: 1, max: 60 }),
  maintainerCountFullAlive: fc.integer({ min: 1, max: 20 }),
  openVulnsFullDead: fc.integer({ min: 1, max: 10 }),
  unknownFactor: fc.double({ min: 0.001, max: 1, noNaN: true }),
});
