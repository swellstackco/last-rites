# Kiro build log

Dated notes on how Kiro was used to build this project: which surface (IDE, CLI, Web, Crew), which feature (spec, steering, hook, agent, MCP, power), what worked, what didn't, and every bug property-based testing caught (with the shrunk counterexample).

## 2026-11-13
- Repo created. Steering written first: `product.md`, `tech.md`, `structure.md` (always included), `migration-rules.md` and `proof-rules.md` (file-matched).
- Next: first spec in the Kiro IDE: `death-score`, with correctness properties.
- death-score spec refined in Kiro IDE Spec mode (requirements detailing pass, ~23 credits, 38 min). Kiro flagged one judgment call: `knownReplacementExists` counts as a death signal. Kept: a listing in e18e `module-replacements` means the ecosystem has already moved on, which is the product's core claim. Lightly weighted.
- Kiro CLI 3.2.1 installed so spec tasks can also be run headless (`kiro-cli chat --no-interactive`).

## 2026-11-13 (death-score: property suite + sabotage checks)
- Tasks 3.6, 3.8, 3.9, 4.3, 4.4, 4.5 were run headless via kiro-cli (`kiro-cli chat --no-interactive`), in dependency order.
- Shared property definitions now live in `properties.ts` (used by `properties.test.ts` and by `sabotage.ts`); `fc-runner.ts` holds numRuns=100, the seed policy (`FC_SEED` env, else fixed seed 20261113 when `CI` is set, else random) and failure recording (seed, shrunk counterexample, replay hint in the thrown error and test output). Sabotage runs always use seed 20261113.
- Real implementation: all 5 properties green, no real bugs found. `npm run typecheck` clean, `npm test` 63/63 green.
- **Spec gap found by sabotage:** Property 5 as written in design.md asserts `unknown >= most-alive`. The "unknown treated as alive" sabotage gives equal scores, so it passed: the property could not fail. Strengthened to `unknown > most-alive`, which the real engine satisfies under the default config (every default weight >= 3, so unknown adds >= 1.5 float points). design.md still says `>=`; update it.
- Sabotage results (seed 20261113; shrunk counterexamples abbreviated to the relevant fields; signals not mentioned are unknown or all-alive in the shrunk case):
  - no normalization -> caught by Property 1 (Bounded), 37 shrinks. Weights `{deprecated:42, monthsSinceLastPublish:18, maintainerCount:10, openVulnsNoFix:48, others 0}` (sum 118), signals deprecated=true, maintainerCount=0, openVulnsNoFix=1, thresholds all 1 -> score > 100.
  - independent rounding -> caught by Property 2 (Transparent), 1 shrink. Signals `{deprecated: false, maintainerCount: 0, monthsSinceLastCommit: 0, others unknown}` (default config): parts sum != score.
  - inverted signal (maintainerCount) -> caught by Property 4 (Monotonic), 4 shrinks. A = `{deprecated:true, repoArchived:true, publish:24, commit:88, maintainerCount:2, vulns:2, replacement:false}`, B = same with maintainerCount 0: B scores below A. Also caught by Property 5: all-alive-except `maintainerCount:0`, signal `maintainerCount`.
  - nondeterminism (Math.random) -> caught by Property 3 (Deterministic), 23 shrinks, plus Properties 1, 4, 5. P3 counterexample: signals `{deprecated: unknown, repoArchived: false, publish: 0, commit: unknown, maintainerCount: 0, vulns: unknown, replacement: false}`, config with all weights 0, thresholds 1, unknownFactor 0.001. P4: A = B = `{commit:25, maintainerCount:0, rest alive}`. P5: signal `knownReplacementExists`. (Shrunk examples for random sabotage are not stable across runs; the call is the failure, not the input.)
  - unknown treated as alive -> caught by Property 5, 4 shrinks. Signals `{all known: deprecated false, repoArchived false, publish 0, commit 0, maintainerCount 0, vulns 0, replacement false}`, signal index `deprecated`.
