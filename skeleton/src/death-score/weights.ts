import type { SignalName, WeightConfig } from "./types.js";

/**
 * Stable ordering of all signal names.
 * Used by normalizeWeights, score, and tests to iterate signals in a fixed order.
 */
export const SIGNAL_NAMES: readonly SignalName[] = [
  "deprecated",
  "repoArchived",
  "monthsSinceLastPublish",
  "monthsSinceLastCommit",
  "maintainerCount",
  "openVulnsNoFix",
  "knownReplacementExists",
];

/**
 * Default raw weights, authored to sum to exactly 100.
 * `repoArchived` and `deprecated` are the strongest death signals;
 * `knownReplacementExists` is weighted lightly per the design decision.
 */
export const DEFAULT_WEIGHTS: Record<SignalName, number> = {
  deprecated: 20,
  repoArchived: 25,
  monthsSinceLastPublish: 15,
  monthsSinceLastCommit: 12,
  maintainerCount: 12,
  openVulnsNoFix: 13,
  knownReplacementExists: 3,
};

/** Default calibration floor: the bottom of the dead band. */
export const DEFAULT_ABANDONED_FLOOR = 75;

/**
 * Default WeightConfig with raw weights summing to 100, default thresholds,
 * unknownFactor = 0.5 and abandonedFloor = 75.
 */
export const DEFAULT_WEIGHT_CONFIG: WeightConfig = {
  weights: { ...DEFAULT_WEIGHTS },
  monthsSinceLastPublishFullDead: 24,
  monthsSinceLastCommitFullDead: 36,
  maintainerCountFullAlive: 5,
  openVulnsFullDead: 1,
  unknownFactor: 0.5,
  abandonedFloor: DEFAULT_ABANDONED_FLOOR,
};

/**
 * Effective calibration floor: absent -> 75; non-finite -> 0 (rule disabled);
 * otherwise clamped to [0, 100] and rounded to an integer.
 */
export function effectiveAbandonedFloor(config: WeightConfig): number {
  const v = config.abandonedFloor;
  if (v === undefined) return DEFAULT_ABANDONED_FLOOR;
  if (!Number.isFinite(v)) return 0;
  return Math.round(Math.min(100, Math.max(0, v)));
}

/**
 * Normalize weights so they sum to 100, preserving relative ratios.
 *
 * Negative weights are clamped to 0 before normalization (per Error Handling).
 * If the total is 0 (all weights zero or negative), the weights are returned
 * as-is — every signal contributes 0 points.
 *
 * For the default config (weights sum to exactly 100) this is a no-op.
 */
export function normalizeWeights(
  config: WeightConfig,
): Record<SignalName, number> {
  // Clamp negative weights to 0.
  const clamped: Record<SignalName, number> = { ...config.weights };
  for (const name of SIGNAL_NAMES) {
    if (clamped[name] < 0) {
      clamped[name] = 0;
    }
  }

  const sum = SIGNAL_NAMES.reduce((acc, name) => acc + clamped[name], 0);
  if (sum === 0) {
    return clamped;
  }

  const scale = 100 / sum;
  const normalized: Record<SignalName, number> = { ...clamped };
  for (const name of SIGNAL_NAMES) {
    normalized[name] = clamped[name] * scale;
  }
  return normalized;
}
