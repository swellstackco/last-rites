import {
  normalizeWeights,
  SIGNAL_NAMES,
  DEFAULT_WEIGHT_CONFIG,
  effectiveAbandonedFloor,
} from "./weights.js";
import { severityFactor } from "./severity.js";
import { toGrade } from "./grade.js";
import type {
  DeathScoreResult,
  PackageSignals,
  SignalPart,
  SignalValue,
  WeightConfig,
} from "./types.js";

/**
 * Small positive value used when unknownFactor is non-positive, so that
 * unknown signals are never treated as fully alive (per Error Handling).
 */
const MIN_UNKNOWN_FACTOR = 1e-9;

/**
 * Clamp a non-positive `unknownFactor` to a small positive value.
 * Negative weights are already clamped inside `normalizeWeights`.
 */
function withClampedUnknownFactor(config: WeightConfig): WeightConfig {
  if (config.unknownFactor > 0) return config;
  return { ...config, unknownFactor: MIN_UNKNOWN_FACTOR };
}

/**
 * Convert a signal value to a human-readable string for the breakdown.
 */
function rawValueOf(
  value: SignalValue<boolean> | SignalValue<number>,
): string {
  if (value.kind === "unknown") return "unknown";
  return String(value.value);
}

interface FloatEntry {
  signal: (typeof SIGNAL_NAMES)[number];
  float: number;
  weight: number;
  status: "known" | "unknown";
  rawValue: string;
  sourceUrl: string | undefined;
}

/**
 * The Weighted_Sum: round(sum(normalizedWeight_i * severityFactor_i)) and the
 * parts that add up to it exactly. Unchanged from the original engine.
 *
 * The engine is pure: it never fetches data, reads the clock, or calls an
 * LLM.  It normalizes weights to sum to 100, computes a severity factor per
 * signal, rounds the float total to an integer score, and assigns rounding
 * drift to the part with the largest fractional remainder so that the parts
 * always sum to the score exactly.
 *
 * Error handling (per design):
 * - Negative numeric signals are clamped to 0 (in `severityFactor`).
 * - Negative weights are clamped to 0 before normalization (in `normalizeWeights`).
 * - Non-positive `unknownFactor` is clamped to a small positive value.
 */
function weightedSum(
  signals: PackageSignals,
  config: WeightConfig,
): { score: number; parts: SignalPart[] } {
  const safeConfig = withClampedUnknownFactor(config);
  const weights = normalizeWeights(safeConfig);

  // Compute float points per signal and collect metadata for each part.
  const entries: FloatEntry[] = SIGNAL_NAMES.map((signal) => {
    const value = signals[signal];
    const factor = severityFactor(signal, value, safeConfig);
    const weight = weights[signal];
    const float = weight * factor;
    return {
      signal,
      float,
      weight,
      status: value.kind,
      rawValue: rawValueOf(value),
      sourceUrl: signals.sourceUrls?.[signal],
    };
  });

  // Score = round(sum(floats)), which is monotonic non-decreasing in inputs.
  const floatTotal = entries.reduce((sum, e) => sum + e.float, 0);
  const score = Math.round(floatTotal);

  // Largest-remainder method: floor each float, then distribute the drift
  // (score − sum(floors)) to the parts with the largest fractional remainders.
  const floored = entries.map((e) => Math.floor(e.float));
  const sumFloored = floored.reduce((s, p) => s + p, 0);
  const drift = score - sumFloored;

  // Sort indices by fractional remainder descending; stable tie-break on index.
  const indices = entries.map((_, i) => i);
  indices.sort((a, b) => {
    const fracA = entries[a]!.float - floored[a]!;
    const fracB = entries[b]!.float - floored[b]!;
    if (fracB !== fracA) return fracB - fracA;
    return a - b;
  });

  const points = [...floored];
  for (let i = 0; i < drift; i++) {
    const idx = indices[i];
    if (idx !== undefined) points[idx] = (points[idx] ?? 0) + 1;
  }

  const parts: SignalPart[] = entries.map((e, i) => ({
    signal: e.signal,
    rawValue: e.rawValue,
    weight: e.weight,
    points: points[i] ?? 0,
    status: e.status,
    ...(e.sourceUrl !== undefined ? { sourceUrl: e.sourceUrl } : {}),
  }));

  return { score, parts };
}

/**
 * C(X): Declared_Abandoned. (deprecated AND archived) OR ((deprecated OR
 * archived) AND publish age >= threshold). Unknown never satisfies any part.
 * Returns the reason text, or undefined when the condition does not hold.
 */
function declaredAbandoned(
  signals: PackageSignals,
  config: WeightConfig,
): { reason: string } | undefined {
  const dep = signals.deprecated;
  const arc = signals.repoArchived;
  const pub = signals.monthsSinceLastPublish;
  const depT = dep.kind === "known" && dep.value === true;
  const arcT = arc.kind === "known" && arc.value === true;
  if (depT && arcT) return { reason: "deprecated + repo archived" };
  if (!depT && !arcT) return undefined;
  if (pub.kind !== "known") return undefined;
  const months = Math.max(0, pub.value);
  const threshold = config.monthsSinceLastPublishFullDead;
  if (!(months >= threshold)) return undefined;
  const flag = depT ? "deprecated" : "repo archived";
  return {
    reason: `${flag} + no publish for ${months} months (threshold ${threshold})`,
  };
}

/**
 * Compute a 0–100 death score for a package given its signals and an
 * optional weight configuration.
 *
 * The engine is pure: it never fetches data, reads the clock, or calls an
 * LLM. The Weighted_Sum is computed by `weightedSum`. When the author's own
 * declaration of abandonment is corroborated (see `declaredAbandoned`) and the
 * sum is below the effective `abandonedFloor`, the score is raised to the floor
 * and the raise is reported as a separate `calibration` entry; `parts` is never
 * modified, so score = sum(parts.points) + (calibration?.points ?? 0).
 */
export function scoreDeath(
  signals: PackageSignals,
  config: WeightConfig = DEFAULT_WEIGHT_CONFIG,
): DeathScoreResult {
  const { score: S, parts } = weightedSum(signals, config);
  const floor = effectiveAbandonedFloor(config);
  if (floor > 0 && S < floor) {
    const abandoned = declaredAbandoned(signals, config);
    if (abandoned) {
      return {
        score: floor,
        grade: toGrade(floor),
        parts,
        calibration: {
          rule: "declared_abandoned",
          reason: abandoned.reason,
          points: floor - S,
        },
      };
    }
  }
  return { score: S, grade: toGrade(S), parts };
}
