import fc from "fast-check";
import { DEFAULT_WEIGHT_CONFIG } from "./weights.js";
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

// ---------------------------------------------------------------------------
// Fully-known PackageSignals generator (for Property 5)
// ---------------------------------------------------------------------------

/** Generate a known signal value from an arbitrary (no unknown variant). */
function knownSignal<T>(arb: fc.Arbitrary<T>): fc.Arbitrary<SignalValue<T>> {
  return arb.map((v): SignalValue<T> => ({ kind: "known", value: v }));
}

/**
 * PackageSignals where every signal is known (no unknowns).
 * Used by Property 5 (Unknown is not alive).
 */
export const fullyKnownPackageSignalsArb: fc.Arbitrary<PackageSignals> =
  fc.record({
    deprecated: knownSignal(fc.boolean()),
    repoArchived: knownSignal(fc.boolean()),
    monthsSinceLastPublish: knownSignal(monthsArb),
    monthsSinceLastCommit: knownSignal(monthsArb),
    maintainerCount: knownSignal(maintainerArb),
    openVulnsNoFix: knownSignal(vulnsArb),
    knownReplacementExists: knownSignal(fc.boolean()),
  });

// ---------------------------------------------------------------------------
// Death-dominance generator (for Property 4: Monotonic)
// ---------------------------------------------------------------------------

/**
 * Generate a pair (A, B) of fully-known PackageSignals where B is at least
 * as dead as A on every signal:
 * - Booleans (deprecated, repoArchived, knownReplacementExists): B is true if A is true.
 * - Months (monthsSinceLastPublish, monthsSinceLastCommit): B >= A.
 * - Maintainer count: B <= A (fewer maintainers = deader).
 * - Open vulns: B >= A (more vulns = deader).
 *
 * Includes edge cases: all-alive -> all-dead, and A = B (equal pair).
 */
export const deathDominatingPairArb: fc.Arbitrary<
  [PackageSignals, PackageSignals]
> = fc.oneof(
  // Random dominance pair: generate A, then worsen-or-equal each signal for B.
  fc
    .record({
      deprecatedA: fc.boolean(),
      repoArchivedA: fc.boolean(),
      monthsSinceLastPublishA: monthsArb,
      monthsSinceLastCommitA: monthsArb,
      maintainerCountA: maintainerArb,
      openVulnsNoFixA: vulnsArb,
      knownReplacementExistsA: fc.boolean(),
    })
    .chain((a) =>
      fc
        .record({
          deprecatedB: a.deprecatedA ? fc.constant(true) : fc.boolean(),
          repoArchivedB: a.repoArchivedA ? fc.constant(true) : fc.boolean(),
          monthsSinceLastPublishB: fc.integer({
            min: a.monthsSinceLastPublishA,
            max: 120,
          }),
          monthsSinceLastCommitB: fc.integer({
            min: a.monthsSinceLastCommitA,
            max: 120,
          }),
          maintainerCountB: fc.integer({ min: 0, max: a.maintainerCountA }),
          openVulnsNoFixB: fc.integer({ min: a.openVulnsNoFixA, max: 10 }),
          knownReplacementExistsB: a.knownReplacementExistsA
            ? fc.constant(true)
            : fc.boolean(),
        })
        .map((b): [PackageSignals, PackageSignals] => {
          const A: PackageSignals = {
            deprecated: { kind: "known", value: a.deprecatedA },
            repoArchived: { kind: "known", value: a.repoArchivedA },
            monthsSinceLastPublish: {
              kind: "known",
              value: a.monthsSinceLastPublishA,
            },
            monthsSinceLastCommit: {
              kind: "known",
              value: a.monthsSinceLastCommitA,
            },
            maintainerCount: { kind: "known", value: a.maintainerCountA },
            openVulnsNoFix: { kind: "known", value: a.openVulnsNoFixA },
            knownReplacementExists: {
              kind: "known",
              value: a.knownReplacementExistsA,
            },
          };
          const B: PackageSignals = {
            deprecated: { kind: "known", value: b.deprecatedB },
            repoArchived: { kind: "known", value: b.repoArchivedB },
            monthsSinceLastPublish: {
              kind: "known",
              value: b.monthsSinceLastPublishB,
            },
            monthsSinceLastCommit: {
              kind: "known",
              value: b.monthsSinceLastCommitB,
            },
            maintainerCount: { kind: "known", value: b.maintainerCountB },
            openVulnsNoFix: { kind: "known", value: b.openVulnsNoFixB },
            knownReplacementExists: {
              kind: "known",
              value: b.knownReplacementExistsB,
            },
          };
          return [A, B];
        }),
    ),
  // Edge case: all-alive -> all-dead (maximal dominance)
  fc.constant([
    allAliveSignals,
    allDeadSignals,
  ] as [PackageSignals, PackageSignals]),
  // Edge case: A = B (equal pair, dominance holds trivially)
  fullyKnownPackageSignalsArb.map(
    (s): [PackageSignals, PackageSignals] => [s, s],
  ),
  // death-score-calibration: pairs that cross the C(X) boundary (A not C, B C)
  // under the default config (publish threshold 24). B only worsens signals.
  fc
    .tuple(
      fullyKnownPackageSignalsArb,
      fc.constantFrom("dep", "arc"),
      fc.constantFrom("stale", "both"),
      fc.integer({ min: 0, max: 23 }),
      fc.integer({ min: 24, max: 120 }),
    )
    .map(([base, flag, how, freshMonths, staleMonths]): [PackageSignals, PackageSignals] => {
      const t: SignalValue<boolean> = { kind: "known", value: true };
      const f: SignalValue<boolean> = { kind: "known", value: false };
      const A: PackageSignals = {
        ...base,
        deprecated: flag === "dep" ? t : f,
        repoArchived: flag === "arc" ? t : f,
        monthsSinceLastPublish: { kind: "known", value: freshMonths },
      };
      const B: PackageSignals =
        how === "stale"
          ? { ...A, monthsSinceLastPublish: { kind: "known", value: staleMonths } }
          : { ...A, deprecated: t, repoArchived: t };
      return [A, B];
    }),
);

// ---------------------------------------------------------------------------
// death-score-calibration generators (Declared_Abandoned, C(X))
// ---------------------------------------------------------------------------

/**
 * TEST-ONLY mirror of the bug condition C(X) from the death-score-calibration
 * design. Production code (`declaredAbandoned` in score.ts) comes in task 3.3.
 * Unknown never satisfies any part; the publish comparison is non-strict.
 */
export function isDeclaredAbandoned(
  signals: PackageSignals,
  config: WeightConfig,
): boolean {
  const dep = signals.deprecated;
  const arc = signals.repoArchived;
  const pub = signals.monthsSinceLastPublish;
  const depT = dep.kind === "known" && dep.value === true;
  const arcT = arc.kind === "known" && arc.value === true;
  const stale =
    pub.kind === "known" &&
    Math.max(0, pub.value) >= config.monthsSinceLastPublishFullDead;
  return (depT && arcT) || ((depT || arcT) && stale);
}

/** Floor values exercised by `configWithFloorArb`; `undefined` = field absent. */
const FLOOR_CHOICES: readonly (number | undefined)[] = [
  undefined, 0, 1, 50, 75, 100, -5, 150, 74.6,
];

/**
 * `weightConfigArb` extended with `abandonedFloor` drawn from
 * {absent, 0, 1, 50, 75, 100, -5, 150, 74.6}. The field is added in test code
 * only (cast) until the type change lands in task 3.1.
 */
export const configWithFloorArb: fc.Arbitrary<WeightConfig> = fc
  .tuple(weightConfigArb, fc.constantFrom(...FLOOR_CHOICES))
  .map(([config, floor]): WeightConfig =>
    floor === undefined
      ? config
      : ({ ...config, abandonedFloor: floor } as WeightConfig),
  );

const knownBool = (value: boolean): SignalValue<boolean> => ({ kind: "known", value });
const unknownBool: SignalValue<boolean> = { kind: "unknown" };
const knownMonths = (value: number): SignalValue<number> => ({ kind: "known", value });
const unknownMonths: SignalValue<number> = { kind: "unknown" };

/** Flag value that is NOT known-true: known false or unknown. */
const notTrueFlagArb: fc.Arbitrary<SignalValue<boolean>> = fc.constantFrom(
  knownBool(false),
  unknownBool,
);

/** Publish age >= T, biased to T, T+1 and large values. */
function staleMonthsArb(t: number): fc.Arbitrary<SignalValue<number>> {
  return fc
    .oneof(
      fc.constant(t),
      fc.constant(t + 1),
      fc.constant(t + 200),
      fc.integer({ min: t, max: t + 120 }),
    )
    .map(knownMonths);
}

/** Publish age strictly below T, biased to T-1, or unknown. */
function freshOrUnknownMonthsArb(t: number): fc.Arbitrary<SignalValue<number>> {
  return fc.oneof(
    fc.constant(knownMonths(Math.max(0, t - 1))),
    fc.constant(knownMonths(0)),
    fc.integer({ min: 0, max: Math.max(0, t - 1) }).map(knownMonths),
    fc.constant(unknownMonths),
  );
}

/** Config for the calibration generators: default half the time, else random with floor. */
const calibrationConfigArb: fc.Arbitrary<WeightConfig> = fc.oneof(
  fc.constant(DEFAULT_WEIGHT_CONFIG),
  configWithFloorArb,
);

/**
 * `[signals, config]` where C(X) holds, from the three branches
 * (dep + arc; dep + stale; arc + stale). The other signals are arbitrary
 * (known or unknown), so S may already be >= the floor.
 */
export const declaredAbandonedArb: fc.Arbitrary<[PackageSignals, WeightConfig]> =
  calibrationConfigArb.chain((config) => {
    const t = config.monthsSinceLastPublishFullDead;
    const overridesArb: fc.Arbitrary<Partial<PackageSignals>> = fc.oneof(
      // dep + arc, any publish
      signalValueArb(monthsArb).map((p) => ({
        deprecated: knownBool(true),
        repoArchived: knownBool(true),
        monthsSinceLastPublish: p,
      })),
      // dep + stale, arc not known true
      fc.tuple(notTrueFlagArb, staleMonthsArb(t)).map(([arc, p]) => ({
        deprecated: knownBool(true),
        repoArchived: arc,
        monthsSinceLastPublish: p,
      })),
      // arc + stale, dep not known true
      fc.tuple(notTrueFlagArb, staleMonthsArb(t)).map(([dep, p]) => ({
        deprecated: dep,
        repoArchived: knownBool(true),
        monthsSinceLastPublish: p,
      })),
    );
    return fc
      .tuple(packageSignalsArb, overridesArb)
      .map(([base, o]): [PackageSignals, WeightConfig] => [
        { ...base, ...o },
        config,
      ]);
  });

/**
 * `[signals, config]` where C(X) is false by construction, with near-miss
 * bias: dep true + publish T-1; arc true + publish unknown; dep true + arc
 * unknown + publish unknown; both flags not true with ancient publish.
 */
export const notDeclaredAbandonedArb: fc.Arbitrary<[PackageSignals, WeightConfig]> =
  configWithFloorArb.chain((config) => {
    const t = config.monthsSinceLastPublishFullDead;
    const overridesArb: fc.Arbitrary<Partial<PackageSignals>> = fc.oneof(
      // dep true, arc not true, publish fresh or unknown (incl. T-1)
      fc.tuple(notTrueFlagArb, freshOrUnknownMonthsArb(t)).map(([arc, p]) => ({
        deprecated: knownBool(true),
        repoArchived: arc,
        monthsSinceLastPublish: p,
      })),
      // arc true, dep not true, publish fresh or unknown
      fc.tuple(notTrueFlagArb, freshOrUnknownMonthsArb(t)).map(([dep, p]) => ({
        deprecated: dep,
        repoArchived: knownBool(true),
        monthsSinceLastPublish: p,
      })),
      // dep true, arc unknown, publish unknown
      fc.constant({
        deprecated: knownBool(true),
        repoArchived: unknownBool,
        monthsSinceLastPublish: unknownMonths,
      }),
      // arc true, dep unknown, publish unknown
      fc.constant({
        deprecated: unknownBool,
        repoArchived: knownBool(true),
        monthsSinceLastPublish: unknownMonths,
      }),
      // neither flag known true, ancient or any publish
      fc.tuple(notTrueFlagArb, notTrueFlagArb, signalValueArb(monthsArb), staleMonthsArb(t))
        .chain(([dep, arc, anyPub, oldPub]) =>
          fc.constantFrom(anyPub, oldPub).map((p) => ({
            deprecated: dep,
            repoArchived: arc,
            monthsSinceLastPublish: p,
          })),
        ),
    );
    return fc
      .tuple(packageSignalsArb, overridesArb)
      .map(([base, o]): [PackageSignals, WeightConfig] => [
        { ...base, ...o },
        config,
      ]);
  });

/** Config pool for preservation (b): any config with the rule disabled. */
export const disabledFloorConfigArb: fc.Arbitrary<WeightConfig> = weightConfigArb.map(
  (c): WeightConfig => ({ ...c, abandonedFloor: 0 }) as WeightConfig,
);
