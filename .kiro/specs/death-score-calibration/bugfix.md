# Bugfix Requirements Document

## Introduction

The Death_Score is a pure weighted sum (see `.kiro/specs/death-score/`). With the default Weight_Config, `deprecated` (20) and `repoArchived` (25) contribute at most 45 points together. A package whose own author has declared it abandoned therefore cannot reach the dead band (score >= 75) unless nearly every other signal is also maxed. This was found on real data (`demo/parse-server.json`, `demo/prettier.json`): packages the author deprecated or archived grade as `ailing` or `dying`, so the graveyard shows them as healthy-ish and the scanner ranks them below packages that are merely quiet.

Real examples under the default config (all currently graded wrongly):

| Package | Relevant signals | Current | Should be |
|---|---|---|---|
| ldapjs | deprecated=true, repoArchived=true, publish 35mo, commit 29mo, maintainers 4, vulns 0, replacement false | 72 dying | dead |
| @saithodev/semantic-release-backmerge | deprecated=false, archived=true, publish 35mo, commit 35mo, maintainers 1 | 61 dying | dead |
| remark-footnotes | archived=true, publish 25mo, commit 25mo, maintainers 1 | 58 dying | dead |
| deep-diff | deprecated=true, archived=false, publish 98mo, commit 10mo, maintainers 1 | 48 ailing | dead |
| node-abort-controller | deprecated=true, publish 45mo, commit 9mo, maintainers 2 | 45 ailing | dead |
| @babel/plugin-proposal-object-rest-spread | deprecated=true, publish 43mo, commit 0mo, maintainers 4, replacement true | 40 ailing | dead |

The decided fix adds a transparent calibration floor to the engine: when the author's own declaration of abandonment is corroborated, the score is raised to a floor (default 75) and the raise is shown as a separate, labelled `calibration` entry, so the breakdown stays honest. The rule itself is not up for redesign in this spec.

## Glossary

- **Death_Score_Engine**: the pure module `skeleton/src/death-score/` exposing `scoreDeath(signals, config?)`.
- **Weighted_Sum (S)**: the integer score the engine computes today: `round(sum(normalizedWeight_i * severityFactor_i))`, equal to `sum(parts[].points)`.
- **Declared_Abandoned (C(X))**: the bug condition on `Package_Signals` X and Weight_Config: (`deprecated` is known true AND `repoArchived` is known true) OR ((`deprecated` is known true OR `repoArchived` is known true) AND `monthsSinceLastPublish` is known AND >= `config.monthsSinceLastPublishFullDead`). An unknown signal never satisfies any part of it.
- **Abandoned_Floor**: the new `WeightConfig.abandonedFloor` field. Default 75 (the bottom of the dead band). 0 disables the rule. Values are clamped to [0, 100].
- **Calibration**: the optional `DeathScoreResult.calibration` object `{ rule: "declared_abandoned"; reason: string; points: number }`, present only when the floor actually raised the score.
- **Reference_Implementation**: the frozen copy of the original, unfixed `scoreDeath` at `skeleton/src/death-score/__reference__/score-v1.ts`, used only by tests.
- **Signal_Part**: one entry of `parts[]`, as defined in the death-score spec.
- **Unknown**: a `SignalValue` with `kind: "unknown"`.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `deprecated` is known true AND `repoArchived` is known true AND the Weighted_Sum is below 75 (for example ldapjs: 72), THEN the Death_Score_Engine returns that Weighted_Sum with grade `dying` or lower instead of `dead`.

1.2 WHEN exactly one of `deprecated` or `repoArchived` is known true AND `monthsSinceLastPublish` is known and >= `monthsSinceLastPublishFullDead` AND the Weighted_Sum is below 75 (for example deep-diff: 48, node-abort-controller: 45, remark-footnotes: 58), THEN the Death_Score_Engine returns that Weighted_Sum with grade `ailing` or `dying` instead of `dead`.

1.3 WHEN a package satisfies C(X) and has otherwise mostly healthy signals (for example @babel/plugin-proposal-object-rest-spread: commit 0mo, 4 maintainers), THEN the Death_Score_Engine returns a score that does not reflect the maintainers' own declaration of abandonment, and the breakdown gives the user no indication that the declaration was under-weighted.

1.4 WHEN the user wants more weight on author declarations, THEN the Weight_Config offers no way to express "a declared-abandoned package is dead" short of rebalancing all seven weights, which distorts every other package.

### Expected Behavior (Correct)

2.1 WHEN C(X) holds AND the Weighted_Sum S is below `abandonedFloor`, THEN the Death_Score_Engine SHALL return `score = abandonedFloor`, and with the default config the grade SHALL be `dead`.

2.2 WHEN C(X) holds AND S >= `abandonedFloor`, THEN the Death_Score_Engine SHALL return the same score, grade and parts as today and SHALL NOT include a `calibration` field.

2.3 WHEN the floor raises the score, THEN the Death_Score_Engine SHALL leave `parts[]` exactly as today (one Signal_Part per signal, `sum(parts[].points) = S`) and SHALL add `calibration: { rule: "declared_abandoned", reason, points }` where `points = score - S > 0` and `reason` names the signals that fired (for example `"deprecated + repo archived"`).

2.4 THE Death_Score_Engine SHALL satisfy `score = sum(parts[].points) + (calibration?.points ?? 0)` for every input and every config.

2.5 WHEN `deprecated` or `repoArchived` is Unknown, THEN that signal SHALL NOT contribute to C(X); and WHEN `monthsSinceLastPublish` is Unknown, THEN the staleness clause SHALL NOT be satisfied.

2.6 WHEN `monthsSinceLastPublish` is exactly `monthsSinceLastPublishFullDead`, THEN the staleness clause SHALL be satisfied (non-strict `>=`).

2.7 THE Weight_Config SHALL accept an optional `abandonedFloor` (default 75 in `DEFAULT_WEIGHT_CONFIG`; absent means the default). WHEN `abandonedFloor` is 0, THEN the rule SHALL be disabled and the result SHALL equal the Reference_Implementation result. WHEN `abandonedFloor` is outside [0, 100] it SHALL be clamped to [0, 100], and a non-integer value SHALL be rounded to the nearest integer; a non-finite value SHALL disable the rule.

2.8 THE six real examples in the table above SHALL grade `dead` under the default config with score 75 and a `calibration` entry.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN C(X) does not hold, THEN the Death_Score_Engine SHALL CONTINUE TO return a result deep-equal to the Reference_Implementation result (score, grade, parts, source URLs), with no `calibration` key.

3.2 WHEN `abandonedFloor` is 0, THEN the Death_Score_Engine SHALL CONTINUE TO return a result deep-equal to the Reference_Implementation result for every input.

3.3 WHEN `deprecated` is true but `monthsSinceLastPublish` is below `monthsSinceLastPublishFullDead` or Unknown and `repoArchived` is not known true (for example eslint: deprecated, publish 0mo, score 27 ailing; mongodb-runner: deprecated, publish 2mo, 22 maintainers, score 21 alive), THEN the score SHALL CONTINUE TO be the Weighted_Sum.

3.4 WHEN only `repoArchived` is known true and `monthsSinceLastPublish` is below `monthsSinceLastPublishFullDead` (for example cross-env: archived, publish 13mo, score 46 ailing), THEN the score SHALL CONTINUE TO be the Weighted_Sum.

3.5 WHEN `deprecated` and `repoArchived` are both known false or Unknown, THEN the score SHALL CONTINUE TO be the Weighted_Sum.

3.6 THE Death_Score_Engine SHALL CONTINUE TO satisfy the existing Properties 1-5: Bounded (0..100), Transparent (restated by 2.4), Deterministic, Monotonic in the death direction, and Unknown-is-not-alive (strict `>`, under the precondition stated in design.md).

3.7 THE Death_Score_Engine SHALL CONTINUE TO be pure: no network, no clock, no randomness, no LLM.

3.8 THE `parts[]` array SHALL CONTINUE TO contain exactly one Signal_Part per signal in `SIGNAL_NAMES` order, and the Signal_Part points SHALL NOT be changed by the floor.

3.9 THE consumers of `DeathScoreResult` (`apps/exorcist-npm`, graveyard UI, MCP) SHALL CONTINUE TO compile and pass their tests; `calibration` is optional so existing readers remain valid.
