// A signal value is either known or unknown (missing). Unknown is never the alive value.
export type SignalValue<T> =
  | { kind: "known"; value: T }
  | { kind: "unknown" };

export type SignalName =
  | "deprecated"
  | "repoArchived"
  | "monthsSinceLastPublish"
  | "monthsSinceLastCommit"
  | "maintainerCount"
  | "openVulnsNoFix"
  | "knownReplacementExists";

// All seven signals, each independently known or unknown. Source URLs are optional per signal.
export interface PackageSignals {
  deprecated: SignalValue<boolean>;
  repoArchived: SignalValue<boolean>;
  monthsSinceLastPublish: SignalValue<number>; // >= 0
  monthsSinceLastCommit: SignalValue<number>;  // >= 0
  maintainerCount: SignalValue<number>;        // >= 0
  openVulnsNoFix: SignalValue<number>;         // >= 0
  knownReplacementExists: SignalValue<boolean>;
  sourceUrls?: Partial<Record<SignalName, string>>;
}

export interface WeightConfig {
  // Raw max-point weights. Normalized so their sum is 100 before scoring.
  weights: Record<SignalName, number>;
  // Thresholds for numeric signal mappings.
  monthsSinceLastPublishFullDead: number; // months at/above which the signal is fully dead (default 24)
  monthsSinceLastCommitFullDead: number;  // default 36
  maintainerCountFullAlive: number;       // maintainers at/above which the signal is fully alive (default 5)
  openVulnsFullDead: number;               // vuln count at/above which fully dead (default 1)
  // Factor applied to unknown signals, in (0, 1]. Strictly greater than 0 so unknown is never alive.
  unknownFactor: number; // default 0.5
}

export interface SignalPart {
  signal: SignalName;
  rawValue: string;             // human-readable, or "unknown"
  weight: number;               // normalized weight (max points for this signal)
  points: number;               // integer contribution; 0 <= points <= weight
  status: "known" | "unknown";
  sourceUrl?: string;
}

export type GradeBand = "alive" | "ailing" | "dying" | "dead";

export interface DeathScoreResult {
  score: number;   // integer 0..100, equal to sum(parts[].points)
  grade: GradeBand;
  parts: SignalPart[]; // one per Signal, in a stable order
}
