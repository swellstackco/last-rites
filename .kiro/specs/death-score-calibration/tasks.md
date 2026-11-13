# Implementation Plan: death-score-calibration (bugfix)

## Overview

Fixes the Death_Score so that declared-abandoned packages (author deprecated or archived, corroborated) reach the dead band, via a transparent `calibration` floor. Order follows the bugfix workflow: explore the bug on unfixed code, capture the preservation baseline, implement, re-verify, sabotage, regress on real data, document, checkpoint. Commits reference task numbers (for example `death-score-calibration 3.2: ...`). Do not change `severity.ts`, `grade.ts` or `normalizeWeights`.

## Tasks

### Phase 1: Explore the bug on unfixed code

- [ ] 1.1 Exploratory bug-condition test (expected to FAIL on unfixed code)
  - Add `isDeclaredAbandoned(signals, config)` as a test-only helper (it mirrors C(X) from design.md; production code comes in 3.3) and `declaredAbandonedArb` in `arbitraries.ts`.
  - Write Property 6 (fix checking) in `properties.ts` / `calibration.test.ts` with `numRuns: 100` and the `fc-runner.ts` seed policy.
  - Run it against the UNFIXED `scoreDeath`. Confirm it FAILS. _Requirements: 1.1, 1.2, 1.3, 2.1_
- [ ] 1.2 Record the shrunk counterexample and seed in `docs/kiro-log.md` (dated entry) and compare with the hypothesized root cause; if it points elsewhere, revise design.md "Hypothesized Root Cause" before continuing.

### Phase 2: Preservation baseline on unfixed code

- [ ] 2.1 Freeze the original implementation as `skeleton/src/death-score/__reference__/score-v1.ts` (`scoreDeathV1`, header "FROZEN, test-only"). Exclude it from `index.ts`. _Requirements: 3.1, 3.2_
- [ ] 2.2 Add `notDeclaredAbandonedArb` (near-miss biased) and `configWithFloorArb` to `arbitraries.ts`. `configWithFloorArb` may only add the field in test code at this stage; the type change lands in 3.1.
- [ ] 2.3 Write Property 7 (preservation): for NOT C(X), and for any config with `abandonedFloor: 0`, `scoreDeath` deep-equals `scoreDeathV1` and has no `calibration` key. Run against the UNFIXED code. Confirm it PASSES (baseline) and note the seed in `docs/kiro-log.md`. _Requirements: 3.1-3.5, 3.8_

### Phase 3: Implement the fix

- [ ] 3.1 `types.ts`: add `WeightConfig.abandonedFloor?: number`, `DeathScoreCalibration`, and `DeathScoreResult.calibration?`.
- [ ] 3.2 `weights.ts`: add `DEFAULT_ABANDONED_FLOOR = 75`, set it in `DEFAULT_WEIGHT_CONFIG`, add `effectiveAbandonedFloor(config)` (absent -> 75; non-finite -> 0; clamp to [0,100]; round). Extend `weights.test.ts`.
- [ ] 3.3 `score.ts`: extract the current body into `weightedSum`; add `declaredAbandoned(signals, config)` (C(X), `>=` against `monthsSinceLastPublishFullDead`, unknown never fires, reason text per design); apply `max(S, F)` only when C holds and `S < F`; add `calibration` only then; leave `parts` untouched; omit the key otherwise. _Requirements: 2.1-2.7_
- [ ] 3.4 `index.ts`: export `DeathScoreCalibration`, `DEFAULT_ABANDONED_FLOOR`, `effectiveAbandonedFloor`.
- [ ] 3.5 Update existing properties: restate Property 2 (Transparent) with `+ (calibration?.points ?? 0)`; extend Properties 1 and 3 with `configWithFloorArb` (Property 3 also compares `calibration`); add C(X)-crossing pairs to `deathDominatingPairArb` for Property 4; restate Property 5 (`u >= a` always, strict `u > a` when NOT C). Update `ALL_PROPERTIES` to seven. _Requirements: 2.4, 3.6_

### Phase 4: Re-verify

- [ ] 4.1 Re-run Property 6 against the fixed code: PASS. Record the result in `docs/kiro-log.md`.
- [ ] 4.2 Re-run Property 7 against the fixed code: PASS (same seed as 2.3). Run Properties 1-5 (updated): PASS.
- [ ] 4.3 Run the full death-score suite with `CI=1` (seed 20261113) and with two random seeds; confirm green.

### Phase 5: Sabotage

- [ ] 5.1 Add five wrong implementations to `sabotage.ts`: (a) floor applied with one flag true and fresh publish; (b) unknown treated as true; (c) floor applied but `calibration` omitted; (d) floor overwrites `parts` (for example bumps a part) instead of adding calibration; (e) strict `>` against `monthsSinceLastPublishFullDead`. Add them to `SABOTAGES`.
- [ ] 5.2 Update `sabotage.test.ts` so every sabotage (the five old and five new) is caught by at least one property at seed 20261113, and the real implementation passes under the same seed. If (e) is not caught, fix the generator bias toward `T` (not the property) and record it.
- [ ] 5.3 Record the shrunk counterexamples of the five new sabotages in `docs/kiro-log.md`.

### Phase 6: Regression table and consumer fallout

- [ ] 6.1 Add a 9-row regression table to `score.test.ts`. Signals are hardcoded from `demo/parse-server.json` and `demo/prettier.json` (read once by hand, no network, no file reads at test time). Expected under the default config: ldapjs 75 dead (+3); @saithodev/semantic-release-backmerge 75 dead (+14); remark-footnotes 75 dead (+17); deep-diff 75 dead (+27); node-abort-controller 75 dead (+30); @babel/plugin-proposal-object-rest-spread 75 dead (+35); eslint 27 ailing (no calibration); mongodb-runner 21 alive (no calibration); cross-env 46 ailing (no calibration). If a hardcoded row yields a different Weighted_Sum than the numbers in bugfix.md, stop and reconcile the signals, not the expectation.
- [ ] 6.2 Add edge example tests: publish exactly `T` and `T-1`; `abandonedFloor` 0, 100, -5, 150, `NaN`; S already >= 75 (no calibration); both flags with Unknown publish.
- [ ] 6.3 Find every consumer of `DeathScoreResult` or `parts` sums (`grep` in `apps/`, `mcp/`, `skeleton/`): `apps/exorcist-npm/src/scan/{types,pipeline,assemble}`, `evidence/stage.test.ts`, `scan/test-support/{properties,sabotage}/scan-p4.ts` and `scan-p5.ts`, the graveyard UI component. Fix type errors and any `sum(parts) === score` checks (add `calibration?.points`).
- [ ] 6.4 Canonical_Json: confirm a result without calibration serializes without a `calibration` key (no `undefined` values), so the scan round-trip property and cached JSON stay stable. Fix if not.
- [ ] 6.5 Update tests or snapshots whose expected scores change because a recorded fixture is declared-abandoned. Do not re-run the network demo snapshot in this spec; note in `docs/kiro-log.md` that `demo/*.json` cached scores are stale until `npm run demo-snapshot -w @graveyard-kit/exorcist-npm` is run manually.
- [ ] 6.6 Graveyard UI: where parts are rendered as the full explanation of the score, render a labelled calibration row (reason and points) when `calibration` is present.

### Phase 7: Documentation

- [ ] 7.1 README: if the README or `skeleton` docs describe the score breakdown, add one sentence on the declared-abandoned floor and the `calibration` entry. Skip if there is no such description.
- [ ] 7.2 `.kiro/specs/death-score/design.md`: add a pointer section "Calibration (bugfix)" linking to `.kiro/specs/death-score-calibration/`, noting the restated Transparent and Unknown-is-not-alive properties and the new `abandonedFloor` field in `WeightConfig`.
- [ ] 7.3 Append the final dated entry to `docs/kiro-log.md`: bug, root cause confirmed, fix, properties, sabotage results, stale demo snapshot note, any judgement calls.

### Phase 8: Checkpoint

- [ ] 8.1 Run `npm run typecheck` across the repo: green.
- [ ] 8.2 Run `npm test` across the repo: green (all workspaces, `numRuns: 100`, no network). Fix any fallout in `apps/exorcist-npm` in this spec.
- [ ] 8.3 Final check against bugfix.md: each clause 2.1-2.8 and 3.1-3.9 maps to a passing test; list any unverified clause in `docs/kiro-log.md`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": "wave-1", "tasks": ["1.1", "2.1"] },
    { "id": "wave-2", "tasks": ["1.2", "2.2"] },
    { "id": "wave-3", "tasks": ["2.3", "3.1"] },
    { "id": "wave-4", "tasks": ["3.2"] },
    { "id": "wave-5", "tasks": ["3.3"] },
    { "id": "wave-6", "tasks": ["3.4", "3.5"] },
    { "id": "wave-7", "tasks": ["4.1", "4.2", "5.1", "6.1", "6.2"] },
    { "id": "wave-8", "tasks": ["4.3", "5.2", "6.3"] },
    { "id": "wave-9", "tasks": ["5.3", "6.4", "6.5", "6.6"] },
    { "id": "wave-10", "tasks": ["7.1", "7.2"] },
    { "id": "wave-11", "tasks": ["7.3", "8.1"] },
    { "id": "wave-12", "tasks": ["8.2"] },
    { "id": "wave-13", "tasks": ["8.3"] }
  ],
  "dependencies": {
    "1.2": ["1.1"],
    "2.2": ["2.1"],
    "2.3": ["2.1", "2.2"],
    "3.1": ["1.2", "2.3"],
    "3.2": ["3.1"],
    "3.3": ["3.2"],
    "3.4": ["3.3"],
    "3.5": ["3.3"],
    "4.1": ["3.5"],
    "4.2": ["3.5"],
    "4.3": ["4.1", "4.2"],
    "5.1": ["3.5"],
    "5.2": ["5.1"],
    "5.3": ["5.2"],
    "6.1": ["3.3"],
    "6.2": ["3.3"],
    "6.3": ["3.4"],
    "6.4": ["6.3"],
    "6.5": ["6.3"],
    "6.6": ["6.3"],
    "7.1": ["4.3"],
    "7.2": ["4.3"],
    "7.3": ["5.3", "6.5", "7.2"],
    "8.1": ["6.4", "6.6"],
    "8.2": ["8.1", "6.5", "5.3"],
    "8.3": ["8.2", "7.3"]
  }
}
```

## Notes

- Tests never hit the network; regression-table signals are hardcoded.
- Task 1.1 must FAIL and 2.3 must PASS on unfixed code; if either is reversed, stop and revisit design.md before touching `score.ts`.
- Per `proof-rules.md`, every new property has sabotage coverage; a property that cannot fail is rejected.
- `abandonedFloor` is optional on `WeightConfig`, so existing config literals keep compiling.
