import type { PackageSignals } from "../types.js";

/**
 * Every signal at its most-alive value.
 * No source URLs attached.
 *
 * Expected score: 0 (grade "alive") with the default config.
 */
export const allAlive: PackageSignals = {
  deprecated: { kind: "known", value: false },
  repoArchived: { kind: "known", value: false },
  monthsSinceLastPublish: { kind: "known", value: 0 },
  monthsSinceLastCommit: { kind: "known", value: 0 },
  maintainerCount: { kind: "known", value: 5 }, // >= fullAlive (default 5)
  openVulnsNoFix: { kind: "known", value: 0 },
  knownReplacementExists: { kind: "known", value: false },
};
