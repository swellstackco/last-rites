import type { PackageSignals } from "../types.js";

/**
 * Every signal unknown.
 * No source URLs attached.
 *
 * Expected score: 50 (grade "dying") with the default config
 * (100 × unknownFactor 0.5 = 50).
 */
export const allUnknown: PackageSignals = {
  deprecated: { kind: "unknown" },
  repoArchived: { kind: "unknown" },
  monthsSinceLastPublish: { kind: "unknown" },
  monthsSinceLastCommit: { kind: "unknown" },
  maintainerCount: { kind: "unknown" },
  openVulnsNoFix: { kind: "unknown" },
  knownReplacementExists: { kind: "unknown" },
};
