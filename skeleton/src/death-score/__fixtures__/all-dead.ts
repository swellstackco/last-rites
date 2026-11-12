import type { PackageSignals } from "../types.js";

/**
 * Every signal at its fully-dead value.
 * Source URLs attached for every signal.
 *
 * Expected score: 100 (grade "dead") with the default config.
 */
export const allDead: PackageSignals = {
  deprecated: { kind: "known", value: true },
  repoArchived: { kind: "known", value: true },
  monthsSinceLastPublish: { kind: "known", value: 24 }, // >= fullDead (default 24)
  monthsSinceLastCommit: { kind: "known", value: 36 },  // >= fullDead (default 36)
  maintainerCount: { kind: "known", value: 0 },
  openVulnsNoFix: { kind: "known", value: 1 },          // >= fullDead (default 1)
  knownReplacementExists: { kind: "known", value: true },
  sourceUrls: {
    deprecated: "https://www.npmjs.com/package/example",
    repoArchived: "https://github.com/example/repo",
    monthsSinceLastPublish: "https://registry.npmjs.org/example",
    monthsSinceLastCommit: "https://github.com/example/repo/commits",
    maintainerCount: "https://www.npmjs.com/package/example/access",
    openVulnsNoFix: "https://osv.dev/list?q=example",
    knownReplacementExists: "https://github.com/e18e/module-replacements",
  },
};
