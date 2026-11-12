import { scoreDeath } from "./score.js";
import { severityFactor } from "./severity.js";
import { toGrade } from "./grade.js";
import { DEFAULT_WEIGHT_CONFIG, SIGNAL_NAMES, normalizeWeights } from "./weights.js";
import { ALL_PROPERTIES, mostAliveValue, type ScoreFn } from "./properties.js";
import { FIXED_SEED, checkProperty, type CounterexampleReport } from "./fc-runner.js";
import type { DeathScoreResult, PackageSignals, SignalName, WeightConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Deliberately wrong implementations (proof-rules.md: sabotage check)
// ---------------------------------------------------------------------------

/** Build a result from per-part integer points, keeping parts and score consistent. */
function resultFromPoints(
  signals: PackageSignals,
  config: WeightConfig,
  weights: Record<SignalName, number>,
  pointsOf: (weight: number, factor: number) => number,
): DeathScoreResult {
  const parts = SIGNAL_NAMES.map((signal) => {
    const value = signals[signal];
    const factor = severityFactor(signal, value, config);
    return {
      signal,
      rawValue: value.kind === "unknown" ? "unknown" : String(value.value),
      weight: weights[signal],
      points: pointsOf(weights[signal], factor),
      status: value.kind,
    };
  });
  const score = parts.reduce((s, p) => s + p.points, 0);
  return { score, grade: toGrade(score), parts };
}

/** Skips weight normalization: raw weights summing above 100 escape [0,100]. */
export const noNormalization: ScoreFn = (signals, config = DEFAULT_WEIGHT_CONFIG) =>
  resultFromPoints(signals, config, { ...config.weights }, (w, f) => Math.round(w * f));

/** Rounds each part independently and the total separately, leaving drift. */
export const independentRounding: ScoreFn = (signals, config = DEFAULT_WEIGHT_CONFIG) => {
  const weights = normalizeWeights(config);
  const real = resultFromPoints(signals, config, weights, (w, f) => Math.round(w * f));
  const floatTotal = SIGNAL_NAMES.reduce(
    (s, n) => s + weights[n] * severityFactor(n, signals[n], config),
    0,
  );
  const score = Math.round(floatTotal);
  return { ...real, score, grade: toGrade(score) };
};

/** Inverts maintainerCount: more maintainers now looks deader. */
export const invertedSignal: ScoreFn = (signals, config = DEFAULT_WEIGHT_CONFIG) => {
  const v = signals.maintainerCount;
  if (v.kind === "unknown") return scoreDeath(signals, config);
  const inverted = Math.max(0, config.maintainerCountFullAlive - v.value);
  return scoreDeath({ ...signals, maintainerCount: { kind: "known", value: inverted } }, config);
};

/** Injects randomness: sometimes bumps one part (and the score) by 1. */
export const nondeterministic: ScoreFn = (signals, config = DEFAULT_WEIGHT_CONFIG) => {
  const real = scoreDeath(signals, config);
  if (Math.random() < 0.5) return real;
  const parts = real.parts.map((p, i) => (i === 0 ? { ...p, points: p.points + 1 } : p));
  const score = real.score + 1;
  return { score, grade: toGrade(score), parts };
};

/** Treats unknown signals as the most-alive value. */
export const unknownAsAlive: ScoreFn = (signals, config = DEFAULT_WEIGHT_CONFIG) => {
  const patched = { ...signals } as Record<string, unknown>;
  for (const name of SIGNAL_NAMES) {
    if (signals[name].kind === "unknown") patched[name] = mostAliveValue(name, config);
  }
  const real = scoreDeath(patched as unknown as PackageSignals, config);
  return {
    ...real,
    parts: real.parts.map((p) =>
      signals[p.signal].kind === "unknown" ? { ...p, status: "unknown" as const } : p,
    ),
  };
};

export const SABOTAGES: ReadonlyArray<{ name: string; impl: ScoreFn }> = [
  { name: "no normalization", impl: noNormalization },
  { name: "independent rounding", impl: independentRounding },
  { name: "inverted signal (maintainerCount)", impl: invertedSignal },
  { name: "nondeterminism (Math.random)", impl: nondeterministic },
  { name: "unknown treated as alive", impl: unknownAsAlive },
];

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

export interface SabotageOutcome {
  sabotage: string;
  /** Reports for every property that caught it (empty = sabotage stayed green). */
  caught: CounterexampleReport[];
}

/** Run every property against one implementation; fixed seed for reproducible output. */
export function runAgainst(impl: ScoreFn, seed: number = FIXED_SEED): CounterexampleReport[] {
  return ALL_PROPERTIES.flatMap((p) => {
    const r = checkProperty(p.name, p.build(impl), seed);
    return r ? [r] : [];
  });
}

export function runSabotageChecks(seed: number = FIXED_SEED): SabotageOutcome[] {
  return SABOTAGES.map(({ name, impl }) => ({ sabotage: name, caught: runAgainst(impl, seed) }));
}
