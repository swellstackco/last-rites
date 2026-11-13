# Bugfix Design

## Overview

The Death_Score is a pure weighted sum, so an author's own declaration of abandonment (`deprecated`, `repoArchived`: at most 45 points by default) cannot carry a package into the dead band (>= 75). The fix adds a calibration floor: when the abandonment declaration is corroborated, the score is raised to `abandonedFloor` (default 75). The raise is shown as a separate `calibration` entry; `parts[]` is untouched, so the breakdown stays transparent and no part is ever rewritten to hide the floor.

The fix touches `skeleton/src/death-score/` only (`types.ts`, `weights.ts`, `score.ts`, `index.ts`, tests) plus fallout in consumers of `DeathScoreResult`. `severity.ts`, `grade.ts` and `normalizeWeights` do not change. Parent spec: `.kiro/specs/death-score/`.

## Bug Details

### Bug Condition

Let X = (signals, config). `known(v)` means `v.kind === "known"`.

```
FUNCTION isBugCondition(X)                       // C(X): Declared_Abandoned
  INPUT: X = (signals, config)
  dep   := signals.deprecated        // SignalValue<boolean>
  arc   := signals.repoArchived      // SignalValue<boolean>
  pub   := signals.monthsSinceLastPublish
  depT  := known(dep) AND dep.value = true
  arcT  := known(arc) AND arc.value = true
  stale := known(pub) AND max(0, pub.value) >= config.monthsSinceLastPublishFullDead
  RETURN (depT AND arcT) OR ((depT OR arcT) AND stale)
END FUNCTION
```

Unknown never triggers any term. The `>=` is non-strict (publish exactly at the threshold is stale). `max(0, ...)` mirrors the negative-clamp already done in `severityFactor`.

### Expected Behavior Property

Let `S = scoreDeath_v1(signals, config).score` (the Reference_Implementation) and `F = effectiveFloor(config)` (see Fix Implementation).

```
FOR ALL X WHERE isBugCondition(X) DO
  result := scoreDeath'(X.signals, X.config)
  ASSERT result.score = max(S, F)
  ASSERT result.parts deep-equals scoreDeath_v1(X).parts
  ASSERT (result.calibration is present) IFF (S < F)
  ASSERT result.calibration is present IMPLIES
         result.calibration.points = result.score - S AND result.calibration.points > 0
  ASSERT result.score = sum(result.parts.points) + (result.calibration?.points ?? 0)
  ASSERT config = DEFAULT_WEIGHT_CONFIG IMPLIES result.grade = "dead" AND result.score >= 75
END FOR
```

### Preservation Goal

```
FOR ALL X WHERE NOT isBugCondition(X) OR effectiveFloor(X.config) = 0 DO
  ASSERT scoreDeath'(X) deep-equals scoreDeath_v1(X)      // and "calibration" not in result
END FOR
```

### Real examples (default config)

| Package | C(X) | S | Fixed |
|---|---|---|---|
| ldapjs | true (dep+arc) | 72 | 75 dead, calibration +3 "deprecated + repo archived" |
| @saithodev/semantic-release-backmerge | true (arc, 35mo) | 61 | 75 dead, +14 |
| remark-footnotes | true (arc, 25mo) | 58 | 75 dead, +17 |
| deep-diff | true (dep, 98mo) | 48 | 75 dead, +27 |
| node-abort-controller | true (dep, 45mo) | 45 | 75 dead, +30 |
| @babel/plugin-proposal-object-rest-spread | true (dep, 43mo) | 40 | 75 dead, +35 |
| eslint | false (dep, publish 0mo) | 27 | 27 ailing (unchanged) |
| mongodb-runner | false (dep, publish 2mo) | 21 | 21 alive (unchanged) |
| cross-env | false (arc, publish 13mo) | 46 | 46 ailing (unchanged) |

## Hypothesized Root Cause

1. **Additive-only model.** The weights are authored so each signal is bounded by its share of 100. Two strong author declarations are capped at 45 points, and the model has no way to treat "the author said this is dead" as stronger than the sum of its weights.
2. **Corroboration is spread over other signals.** Staleness, commit age and maintainers each add a share, but a package can have one of them healthy (recent commit, many maintainers) and still be declared abandoned by its own author, so the sum never crosses 75 (ldapjs: 72; babel plugin: 40).
3. **Weights tuned for ranking, not for grading.** The defaults were chosen so no single signal dominates; that is right for ranking but wrong for the dead-band cutoff when the author's declaration is explicit.
4. Hypotheses are checked by task 1.1: the bug-condition property run against unfixed code must fail with a counterexample that has `deprecated`/`repoArchived` known true and grade other than `dead`. If the counterexample shows something else (for example a rounding or grade-boundary effect), this section is revised before the fix.

## Fix Implementation

### Changes

1. `types.ts`
   - `WeightConfig.abandonedFloor?: number` (optional; absent means 75).
   - `export interface DeathScoreCalibration { rule: "declared_abandoned"; reason: string; points: number }`.
   - `DeathScoreResult.calibration?: DeathScoreCalibration` (omitted, never `undefined`-valued, when not applied).
2. `weights.ts`
   - `DEFAULT_WEIGHT_CONFIG.abandonedFloor = 75`.
   - `export const DEFAULT_ABANDONED_FLOOR = 75` and `export function effectiveAbandonedFloor(config): number`: `undefined -> 75`; non-finite -> 0; otherwise `Math.round(clamp(v, 0, 100))`.
3. `score.ts`
   - Extract the current body unchanged into an internal `weightedSum(signals, config)` returning `{ score: S, parts }`.
   - Add `declaredAbandoned(signals, config): { reason: string } | undefined` implementing C(X). Reason text: both flags: `"deprecated + repo archived"`; deprecated + stale: `"deprecated + no publish for N months (threshold T)"`; archived + stale: `"repo archived + no publish for N months (threshold T)"`. The both-flags clause wins when both clauses hold.
   - `scoreDeath`: `F = effectiveAbandonedFloor(config)`; if `F > 0` and C holds and `S < F`, return `{ score: F, grade: toGrade(F), parts, calibration: { rule, reason, points: F - S } }`; otherwise return `{ score: S, grade: toGrade(S), parts }` with no `calibration` key.
   - Source URLs on parts are unchanged. `unknownFactor` clamping and negative-weight handling stay in `weightedSum`.
4. `index.ts`: export `DeathScoreCalibration`, `DEFAULT_ABANDONED_FLOOR`, `effectiveAbandonedFloor`.
5. `__reference__/score-v1.ts`: byte-for-byte copy of today's `scoreDeath` (header comment: FROZEN, test-only, never import from production code). It imports the unchanged `weights`, `severity`, `grade` helpers; those must not change in this spec. Exported as `scoreDeathV1`. Not re-exported from `index.ts`.
6. Consumers: `apps/exorcist-npm` and the graveyard UI read `DeathScoreResult`; any code that checks `sum(parts) === score` or renders parts as the full explanation must add `calibration?.points` and show a labelled calibration row (reason + points). Fixtures and snapshots containing scores of C(X) packages are updated in the same spec (task 6.x).

### Why the existing properties still hold

- **Bounded.** `F` is clamped to [0, 100] and the floor only takes `max(S, F)`; `S` is already in [0, 100]. Result in [0, 100].
- **Transparent (restated).** `parts` is unchanged so `sum(parts.points) = S`; when applied `calibration.points = F - S = score - S`, otherwise absent (0). Hence `score = sum(parts.points) + (calibration?.points ?? 0)` exactly, and calibration points are an integer because `F` and `S` are integers.
- **Deterministic.** The floor is a pure function of `(signals, config)`; the reason string is built from values only.
- **Monotonic (Property 4).** Let B be at least as dead as A on every signal, both fully known. Each term of C(X) is a death-direction predicate: `deprecated = true`, `repoArchived = true`, `publish >= T` can only flip false to true when a signal worsens, never true to false. So `C(A) implies C(B)`. Cases: (a) both C: `max(S_B, F) >= max(S_A, F)` since `S_B >= S_A` by the parent spec. (b) C(B) only: `final_B = max(S_B, F) >= S_B >= S_A = final_A`. (c) neither: unchanged. (d) C(A) and not C(B) is impossible. The floor `F` does not depend on the signals. Monotonicity is stated over fully-known pairs; the floor fires only on known death-direction values, so it adds no non-monotone behaviour.
- **Unknown is not alive (Property 5).** For a fully-known X and a signal i, the most-alive value (false / 0 / fullAlive) and Unknown both fail every term of C(X) for signal i, so `C(withUnknown) = C(withAlive)`. When C does not hold, nothing is floored and the parent argument applies: strict `>`. When C holds on both sides, both scores may be floored to the same value and strict `>` can fail (for example deprecated + archived with a low Weighted_Sum on both sides: 75 vs 75). The property is therefore restated: assert `u >= a` always, and assert strict `u > a` under the precondition `NOT C(withAlive)` (equivalently `NOT C(withUnknown)`). This is not a weakening for unknown-as-alive sabotage: that sabotage is still caught on the NOT C inputs, which the generator produces plentifully. The restatement is recorded in the parent spec pointer (task 7.2).

### Rejected alternatives (decided; not to be redesigned)

Raising weights for `deprecated`/`repoArchived` (distorts every package and ranking), and overwriting parts (breaks transparency). The decided rule is the floor above.

## Correctness Properties

All run with fast-check `numRuns: 100` (internal properties), the existing `fc-runner.ts` seed policy (`FC_SEED` wins, `CI` fixes seed 20261113, otherwise random and recorded on failure), through `assertProperty` / `checkProperty`. Each has a sabotage variant per `proof-rules.md`. Generators live in `arbitraries.ts`.

New generators:
- `declaredAbandonedArb`: signals plus default-or-random config where C(X) holds, built from the three branches (dep+arc; dep + stale; arc + stale), with `monthsSinceLastPublish` biased to `T`, `T+1`, large, and the other signals arbitrary (known or unknown). Includes cases with S already >= F, to exercise "calibration absent".
- `notDeclaredAbandonedArb`: C(X) false by construction with near-miss bias: dep true and publish `T-1`; arc true and publish Unknown; dep true, arc unknown, publish Unknown; both flags known false/unknown with ancient publish.
- `configWithFloorArb`: `weightConfigArb` extended with `abandonedFloor` from `{absent, 0, 1, 50, 75, 100, -5, 150, 74.6}`.

### Property 6: Fix checking (Declared_Abandoned is dead)

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**

- Arbitrary: `declaredAbandonedArb`.
- Assert, under default config: `grade === "dead"` and `score >= 75`; `score === max(S, 75)`; `calibration` present iff `S < 75`; when present `rule === "declared_abandoned"`, `points === score - S > 0`, `reason` non-empty and mentions each signal that fired; `parts` deep-equals the Reference_Implementation parts; `score === sum(parts.points) + (calibration?.points ?? 0)`. Also over `configWithFloorArb`: `score === max(S, effectiveAbandonedFloor(config))`.
- Sabotages (each must be caught):
  1. floor applied when only one of deprecated/archived is true and publish is fresh (caught by Property 7 and by the NOT C branch of Property 6 generators);
  2. unknown treated as true (caught by Property 7);
  3. floor applied but `calibration` omitted (caught by Property 6 and Property 2);
  4. floor overwrites parts instead of adding calibration (caught by Property 6 parts equality only: bumping a part keeps sum(parts) = score, so Property 2 cannot see it; found in build, see docs/kiro-log.md);
  5. strict `>` used against the threshold (publish exactly `T` not caught by the sabotage; caught by Property 6 because `declaredAbandonedArb` biases to `T`).

### Property 7: Preservation checking

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.8**

- Arbitrary: (a) `notDeclaredAbandonedArb` with `configWithFloorArb`; (b) any `packageSignalsArb` with `abandonedFloor: 0`.
- Assert: `JSON.stringify(scoreDeath(X)) === JSON.stringify(scoreDeathV1(X))` and `"calibration" in result === false`.
- Baseline: run against unfixed code first (expected PASS), then after the fix (still PASS).
- Sabotages caught: 1 and 2 above (they change a NOT C result), plus "floor ignores abandonedFloor = 0".

### Properties 1-5 (updated)

- Property 2 (Transparent): `sum(parts.points) + (calibration?.points ?? 0) === score`, one part per signal. Sabotages: independent rounding (existing); floor without calibration (new).
- Property 1 (Bounded), 3 (Deterministic): inputs extended with `configWithFloorArb`; Property 3 additionally deep-equals `calibration`.
- Property 4 (Monotonic): unchanged assertion; pair generator unchanged (it already produces pairs with known flags). Add the dominance pairs that cross the C(X) boundary (A not C, B C) to the generator.
- Property 5: restated as above.

### Sabotage harness

`sabotage.ts` gains the five wrong implementations; `runSabotageChecks` asserts each is caught by at least one of `ALL_PROPERTIES` (now seven) with seed 20261113.

## Testing Strategy

- **Exploratory (before the fix):** write Property 6 (bug condition) and run it against the unfixed `scoreDeath`; it must FAIL. Record the shrunk counterexample and seed in `docs/kiro-log.md`. Compare with the hypothesized root cause above.
- **Fix checking:** Property 6 against the fixed code, numRuns 100.
- **Preservation checking:** Property 7 against the unfixed code (PASS, baseline), then against the fixed code (PASS). The Reference_Implementation `__reference__/score-v1.ts` is the oracle.
- **Example tests:** a 9-row regression table in `score.test.ts` with signals hardcoded from `demo/parse-server.json` and `demo/prettier.json` (no network), asserting score, grade, calibration points and reason. Edge examples: publish exactly `T` and `T-1`; `abandonedFloor` 0, 100, -5, 150, NaN; S already >= 75.
- **Integration:** `apps/exorcist-npm` tests and any snapshots updated; `npm run typecheck` and `npm test` green across the repo.
- Tests never touch the network and use `__fixtures__/` or inline data.
