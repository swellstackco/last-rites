// Public API for the death-score engine.

export { scoreDeath } from "./score.js";
export { toGrade } from "./grade.js";
export {
  normalizeWeights,
  DEFAULT_WEIGHT_CONFIG,
  DEFAULT_WEIGHTS,
  SIGNAL_NAMES,
} from "./weights.js";
export { severityFactor } from "./severity.js";

export type {
  SignalValue,
  SignalName,
  PackageSignals,
  WeightConfig,
  SignalPart,
  GradeBand,
  DeathScoreResult,
} from "./types.js";
