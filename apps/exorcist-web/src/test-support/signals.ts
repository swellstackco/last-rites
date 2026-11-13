// Hand-picked signal sets for DOM tests (scores checked against the real scoreDeath by the tests).
import type { PackageSignals } from "@graveyard-kit/skeleton";

const known = <T>(value: T) => ({ kind: "known" as const, value });
const unknown = { kind: "unknown" as const };

/** Scores 50, grade dying, no calibration. */
export const DYING_SIGNALS: PackageSignals = {
  deprecated: known(false),
  repoArchived: known(false),
  monthsSinceLastPublish: known(30),
  monthsSinceLastCommit: known(40),
  maintainerCount: known(1),
  openVulnsNoFix: known(1),
  knownReplacementExists: known(false),
};

/** Scores 1, grade alive. */
export const ALIVE_SIGNALS: PackageSignals = {
  deprecated: known(false),
  repoArchived: known(false),
  monthsSinceLastPublish: known(1),
  monthsSinceLastCommit: known(1),
  maintainerCount: known(9),
  openVulnsNoFix: known(0),
  knownReplacementExists: known(false),
};

/** Every signal unknown: scores 50, grade dying. */
export const ALL_UNKNOWN_SIGNALS: PackageSignals = {
  deprecated: unknown,
  repoArchived: unknown,
  monthsSinceLastPublish: unknown,
  monthsSinceLastCommit: unknown,
  maintainerCount: unknown,
  openVulnsNoFix: unknown,
  knownReplacementExists: unknown,
};

/** Deprecated and archived on top of the dying signals: grade dead (checked by an example test). */
export const DEAD_SIGNALS: PackageSignals = {
  ...DYING_SIGNALS,
  deprecated: known(true),
  repoArchived: known(true),
};

/** Recent commit and no open vulnerabilities on top of the dying signals: grade ailing (checked by an example test). */
export const AILING_SIGNALS: PackageSignals = {
  ...DYING_SIGNALS,
  monthsSinceLastCommit: known(0),
  openVulnsNoFix: known(0),
};
