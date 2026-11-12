import type { PackageSignals } from "../types.js";

/**
 * Mixed signals: some alive, some dead, some unknown.
 * Source URLs attached for the known signals.
 *
 * With the default config:
 *  deprecated:            true  → f=1     → 20.0
 *  repoArchived:          false → f=0     →  0.0
 *  monthsSinceLastPublish: unknown → f=0.5 →  7.5
 *  monthsSinceLastCommit:  12   → f=12/36  →  4.0
 *  maintainerCount:        2   → f=1-2/5  →  7.2
 *  openVulnsNoFix:          0   → f=0     →  0.0
 *  knownReplacementExists: unknown → f=0.5 →  1.5
 *  Total float: 40.2  → score 40 (grade "ailing")
 */
export const mixed: PackageSignals = {
  deprecated: { kind: "known", value: true },
  repoArchived: { kind: "known", value: false },
  monthsSinceLastPublish: { kind: "unknown" },
  monthsSinceLastCommit: { kind: "known", value: 12 },
  maintainerCount: { kind: "known", value: 2 },
  openVulnsNoFix: { kind: "known", value: 0 },
  knownReplacementExists: { kind: "unknown" },
  sourceUrls: {
    deprecated: "https://www.npmjs.com/package/example",
    repoArchived: "https://github.com/example/repo",
    monthsSinceLastCommit: "https://github.com/example/repo/commits",
    maintainerCount: "https://www.npmjs.com/package/example/access",
    openVulnsNoFix: "https://osv.dev/list?q=example",
  },
};
