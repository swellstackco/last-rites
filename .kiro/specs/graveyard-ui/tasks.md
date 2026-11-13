# Implementation Plan: graveyard-ui

## Overview

This plan builds The Graveyard in two places per `structure.md`: the pure view model in `skeleton/src/graveyard/` and the page in the new workspace package `apps/exorcist-web` (Vite + TypeScript, no framework). TypeScript strict, ESM, Vitest + fast-check, jsdom for DOM tests, zero network in tests. It delivers the view model and its five properties with sabotage lists, the page's pure models and three additive properties, the Api_Client, the night theme, the views with keyboard and focus handling, DOM and static tests, the dev workflow, and a final green `npm run typecheck` and `npm test`.

Scope is the Graveyard only. No change to the scan API, scanner, evidence stage or death-score engine. No proof harness (a disabled placeholder and a data shape only). Nothing is renamed to "Last Rites"; the name is display text. Phases are sequential; within a phase, tasks are mostly independent. Do not write more than the task asks.

## Tasks

### Phase 1: Scaffold and wiring

- [ ] 1.1 Edit `skeleton/package.json` to add the exports `"./graveyard": "./src/graveyard/index.ts"` and `"./graveyard/testing": "./src/graveyard/testing.ts"`, keeping `.` and `./death-score` unchanged. Create `skeleton/src/graveyard/index.ts` and `testing.ts` as empty re-export stubs so the paths resolve.
  - _Requirements: 1.1, 1.2_
- [ ] 1.2 Edit `apps/exorcist-npm/package.json` to add `"exports": { "./report": "./src/scan/report.ts" }`, and nothing else. Confirm `npm run typecheck` still passes for `exorcist-npm` (no existing deep import of the package by name exists).
  - _Requirements: 1.3, 1.4_
- [ ] 1.3 Create the package `apps/exorcist-web`: `package.json` (name `@graveyard-kit/exorcist-web`, private, ESM, scripts `dev`, `build`, `typecheck`; dependencies `@graveyard-kit/skeleton` `*` and `@graveyard-kit/exorcist-npm` `*`; devDependencies `vite` pinned to the hoisted exact version 5.4.21, `vitest` and `fast-check` as in the other packages, and `jsdom` pinned exact), `tsconfig.json` extending `../../tsconfig.base.json` with `lib: ["ES2022", "DOM", "DOM.Iterable"]` and `include: ["src", "scripts", "vite.config.ts"]`, and a minimal `index.html` and `src/main.ts` that only set the page title. Run `npm install` to update the lockfile. Record the installed `jsdom` version for the log.
  - _Requirements: 1.1, 1.3, 21.1, 22.6_
- [ ] 1.4 Add a type-check-only smoke file `apps/exorcist-web/src/imports.check.ts` that imports `parseReport` and `ScanReport` from `@graveyard-kit/exorcist-npm/report`, `toGrade` from `@graveyard-kit/skeleton`, and a stub from `@graveyard-kit/skeleton/graveyard`. Run `npm run typecheck`; fix the web tsconfig (for example leave `types` unset or add `"types": ["node"]`) until it is green. Delete the smoke file once the real code imports the same names (task 4.14).
  - _Requirements: 1.4, 24.1_
- [ ] 1.5 Verify the root `vitest.config.ts` picks up `apps/exorcist-web/src/**/*.test.ts` with no change, and that `no-network.setup.ts` loads for it. Add one trivial test `apps/exorcist-web/src/setup.test.ts` that asserts the global `fetch` throws the "Real network access is forbidden" error, and one file with the docblock `// @vitest-environment jsdom` that asserts `document.body` exists, to prove both environments work.
  - _Requirements: 21.1, 22.1, 22.2_
- [ ] 1.6 Checkpoint after Phase 1 - Ensure `npm run typecheck` and `npm test` pass, ask the user if questions arise.

### Phase 2: View model - types, labels, links, breakdown

- [ ] 2.1 Create `skeleton/src/graveyard/types.ts` with `UnknownReasonView`, `GraveRecord`, `Grave`, `GradeGroup`, `GraveyardView`, `SignalRow`, `CalibrationRow`, `BreakdownRow` and `Breakdown` exactly as in the design. Import `DeathScoreResult`, `GradeBand`, `SignalName` from `../death-score/index.js`; do not redeclare them.
  - _Requirements: 1.2, 1.4, 6.1, 9.3_
- [ ] 2.2 Create `skeleton/src/graveyard/grade-order.ts` with `GRADE_ORDER` (`dead`, `dying`, `ailing`, `alive`) and `GRADE_INFO` (`label`, `min`, `max`, `description` per band). Derive `min` and `max` by scanning scores 0..100 with `toGrade`, not by typing numbers.
  - _Requirements: 6.2, 15.3_
- [ ] 2.3 Write `grade-order.test.ts`: for every integer 0..100 the score lies inside the range of `toGrade(score)` and in no other range; ranges are contiguous and cover 0..100; `GRADE_ORDER` has each band once.
  - _Requirements: 15.3_
- [ ] 2.4 Create `skeleton/src/graveyard/signal-info.ts` with `SIGNAL_INFO: Record<SignalName, { label; explanation }>` for all seven signals (one plain sentence each, saying why the signal matters), plus `formatRawValue(signal, rawValue, status)` (units for months, maintainers and vulnerabilities, yes/no for booleans, "unknown" for unknown).
  - _Requirements: 9.3, 15.4_
- [ ] 2.5 Write `signal-info.test.ts`: every `SIGNAL_NAMES` entry has a non-empty label and explanation; `formatRawValue` examples for each signal kind and for unknown.
  - _Requirements: 9.3_
- [ ] 2.6 Create `skeleton/src/graveyard/safe-url.ts` with `safeHttpUrl(value: unknown)` (rules in the design: string, at most 2048 chars, `http(s)://` in any case, non-empty authority without `@`, no whitespace, control characters or `<>"'` backtick backslash anywhere; returns the input unchanged) and `hostOf(safeUrl)`. No `URL` class; never throws.
  - _Requirements: 12.2, 12.3_
- [ ] 2.7 Write `safe-url.test.ts` examples: every hostile string of the corpus in Requirement 19.6 is rejected; valid http and https URLs (mixed case, with query, fragment, `@` in the path, port) are returned unchanged; non-strings return `undefined`; 2049-character string rejected; `hostOf` examples.
  - _Requirements: 12.2, 12.3, 19.6_
- [ ] 2.8 Create `skeleton/src/graveyard/breakdown.ts` with `buildBreakdown(record)`, `formatCalibration(calibration)`, `topSignals(record, n)` and `summaryLine(record)`: one `SignalRow` per part in part order; `href`/`hrefHost` only from `safeHttpUrl`; `withheldUrl` (cut to 80 characters) when a `sourceUrl` exists but is unsafe; `unknownReason` from an own-property lookup of `unknownReasons`; the `CalibrationRow` after the signal rows; `sum`, `score` (copied from `death.score`), `consistent`, `gradeConsistent`. Never adjusts a number.
  - _Requirements: 9.3, 9.4, 9.5, 9.6, 10.1, 10.2, 10.4, 11.2, 11.3, 12.1, 12.3, 12.4_
- [ ] 2.9 Write `breakdown.test.ts` examples with records built by the real `scoreDeath`: a calibrated record (`deprecated + repo archived`, +3: the row text is exactly "Declared abandoned: deprecated + repo archived, +3" and points add up); a record with no calibration has no calibration row; an all-unknown record with and without `unknownReasons` ("No reason recorded" case); a record with a missing `sourceUrl`; a tampered sum gives `consistent: false` and an unchanged `score`; a tampered grade gives `gradeConsistent: false`; `summaryLine` prefers the calibration reason, else the two largest-points signals; `__proto__` as a signal-keyed reason cannot leak.
  - _Requirements: 9.4, 9.5, 9.6, 10.1, 10.2, 11.2, 12.3_
- [ ] 2.10 Create `skeleton/src/graveyard/build-graveyard.ts` with `compareGraves` and `buildGraveyard`: keys by name count (`name`, then `name#2`, `name#3`), buckets by `death.grade`, sorted by score descending, then name by code-unit comparison (`<`, `>`), then input index; four groups always, `defaultCollapsed` only for alive, `counts`, `total`. No mutation of the input, no `localeCompare`, no `Date`, no `Math.random`.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_
- [ ] 2.11 Write `build-graveyard.test.ts` examples: empty input; ties on score broken by name; mixed-case and non-ASCII names in code-unit order (`"A" < "a"`, `"Z" < "a"`, `"a" < "é"`); duplicate names get `#2` keys and keep input order; boundary scores 24/25, 49/50, 74/75 land in the right groups; only alive is `defaultCollapsed`; input unchanged.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.7, 6.8_
- [ ] 2.12 Create `skeleton/src/graveyard/proof-slot.ts` with `ProofLeg`, `Counterexample`, `SabotageResult`, `ProofState`, `ProofSlot` and `proofSlotFor` (slot with `coming_soon` for dead and dying, `undefined` for ailing and alive). Document in comments that only `coming_soon` is produced and that the shape follows `proof-rules.md` and `migration-rules.md`.
  - _Requirements: 13.1, 13.2_
- [ ] 2.13 Write `proof-slot.test.ts`: dead and dying return a slot with `coming_soon`; ailing and alive return `undefined`; a type-level exhaustiveness helper `assertNever` compiles over all five `ProofState` statuses.
  - _Requirements: 13.1, 13.2, 13.5_
- [ ] 2.14 Fill `skeleton/src/graveyard/index.ts` with the public exports (`GRADE_ORDER`, `GRADE_INFO`, `SIGNAL_INFO`, `formatRawValue`, `buildGraveyard`, `compareGraves`, `buildBreakdown`, `formatCalibration`, `topSignals`, `summaryLine`, `safeHttpUrl`, `hostOf`, `proofSlotFor`, and all types). Add a static check to `skeleton/src/graveyard/smoke.test.ts`: no file under `skeleton/src/graveyard/` (outside `test-support` and tests) uses `document`, `window`, `URL(`, `Date`, `Math.random`, `process`, `fetch` (comments excluded) or imports under `apps`.
  - _Requirements: 1.2, 6.6_
- [ ] 2.15 Checkpoint after Phase 2 - Ensure `npm run typecheck` and `npm test` pass, ask the user if questions arise.

### Phase 3: View model properties and sabotage

- [ ] 3.1 Create `skeleton/src/graveyard/test-support/arbitraries.ts`: `graveRecordArb` (real `scoreDeath` over `packageSignalsArb` and `configWithFloorArb`, collision-prone names including `__proto__` and `constructor`, boundary-biased scores, calibrated and all-unknown records, `unknownReasons` for unknown signals), `graveRecordsArb` (0..60 records), `tamperedRecordArb` (one tamper: part points, score, grade or calibration points), and `hostileUrlArb` (the corpus of Requirement 19.6 mixed with `fc.string()` and valid URLs in mixed case). Re-use, do not copy, the generators in `death-score/arbitraries.ts`.
  - _Requirements: 19.2, 19.4, 19.6_
- [ ] 3.2 Create `skeleton/src/graveyard/test-support/sabotage-runner.ts` with `assertAllSabotagesCaught(propertyName, list, runProperty)` that fails with `Sabotage "<name>" stayed green for "<property>"`. Create `testing.ts` re-exporting the arbitraries, the runner and `assertProperty`, `NUM_RUNS`, `FIXED_SEED` from `death-score/fc-runner.ts`.
  - _Requirements: 19.8, 20.3_
- [ ] 3.3 Write the Property 1 test in `test-support/properties/p1.ts` and `partition.p1.test.ts` (exporting `build(impl)`), with sabotages in `test-support/sabotage/p1.ts`: drop a record that shares a name; drop the alive group; boundary-score record in two groups; keys without suffix; filter out score 0; sort the input in place.
  - **Property 1: Grouping is a partition**
  - **Validates: Requirements 6.1, 6.2, 6.4, 6.7, 19.2**
- [ ] 3.4 Write the Property 2 test in `test-support/properties/p2.ts` and `ordering.p2.test.ts` with an independently written reference comparator, and sabotages in `test-support/sabotage/p2.ts`: score ascending; no name tiebreak; reversed grade order; name before score; `localeCompare`; score as string; `Math.random` tiebreak; name descending.
  - **Property 2: Ordering is band, then score descending, then name, stable and deterministic**
  - **Validates: Requirements 6.3, 6.6, 19.3**
- [ ] 3.5 Write the Property 3 test in `test-support/properties/p3.ts` and `breakdown.p3.test.ts`, with sabotages in `test-support/sabotage/p3.ts`: omit the calibration row; count calibration twice; weight instead of points; exclude unknown rows from the sum; score computed from the sum; `consistent` always true.
  - **Property 3: Breakdown rows sum to the displayed score**
  - **Validates: Requirements 9.3, 9.4, 9.5, 10.1, 10.2, 10.4, 11.3, 19.4**
- [ ] 3.6 Write the Property 4 test for the view-model half in `test-support/properties/p4.ts` and `counts.p4.test.ts` (counts equal group sizes, equal an independent recount, sum to total), with sabotages in `test-support/sabotage/p4.ts` for the view-model: `dying` counted as `dead`; off-by-one alive; counts from the first 50 records. The header half of Property 4 is added in task 5.5.
  - **Property 4: Header counts equal the grouped list sizes (view model)**
  - **Validates: Requirements 6.5, 8.2, 19.5**
- [ ] 3.7 Write the Property 5 test in `test-support/properties/p5.ts` and `safe-url.p5.test.ts` (over `safeHttpUrl` and over every row `href` produced by `buildBreakdown` for tampered URLs), with sabotages in `test-support/sabotage/p5.ts`: no check; `javascript:` denylist only; case-sensitive denylist; `startsWith("http")`; accepts `//host`; accepts userinfo; validates trimmed but returns untrimmed; returns a normalized copy.
  - **Property 5: Source links only ever render http or https URLs**
  - **Validates: Requirements 12.1, 12.2, 12.3, 12.5, 18.1, 19.6**
- [ ] 3.8 Create `skeleton/src/graveyard/sabotage.test.ts`: import the five lists and `build` functions; run each property against every entry with seed 20261113 through `assertAllSabotagesCaught`; assert every list is non-empty; assert the sabotages named in Requirement 20.2 exist in the right lists; assert the real implementations pass every property under the same seed.
  - _Requirements: 20.1, 20.2, 20.3_
- [ ] 3.9 Checkpoint after Phase 3 - Ensure `npm run typecheck` and `npm test` pass, ask the user if questions arise.

### Phase 4: Page models, Api_Client and fixtures

- [ ] 4.1 Create `apps/exorcist-web/src/constants.ts` (`PRODUCT_NAME`, `SCREEN_NAME`, `LIVE_SCAN_LIMIT`, timeouts, `DEFAULT_RETRY_AFTER_S`, `MAX_SERVER_MESSAGE`, `WITHHELD_URL_CUT`, copy strings used by more than one view) and `model/demo-repos.ts` (`DEMO_REPOS` with name, `owner/repo`, count-free blurb).
  - _Requirements: 1.5, 2.1, 2.3, 3.6_
- [ ] 4.2 Write `demo-repos.test.ts`: the names equal the set of `demo/*.json` file names (read with `node:fs`), each matches `^[a-z0-9][a-z0-9-]{0,63}$`, order is parse-server, prettier, jest, pump; and `LIVE_SCAN_LIMIT` equals `DEFAULT_SCAN_API_CONFIG.scanRateLimit` imported by a relative path in the test only.
  - _Requirements: 2.1, 2.3, 3.6_
- [ ] 4.3 Create `model/repo-input.ts` with `parseRepoInput(repoText, refText?)` per the design: trim, length 1..300, optional scheme, only the `github.com/` host prefix, one trailing `/` then one trailing `.git`, exact `owner/name` patterns of the scanner, ref rule, case preserved, field-tagged error messages.
  - _Requirements: 3.2, 3.3, 3.4_
- [ ] 4.4 Write `repo-input.test.ts` examples: each accepted spelling, whitespace, `www.github.com` rejected, other hosts rejected, extra path segment rejected, `owner/..` rejected, owner of 40 characters rejected, repo with `_` and `.` accepted, bad ref (`a..b`, `a b`, 201 characters) rejected with `ref`, empty ref accepted as none.
  - _Requirements: 3.2, 3.3, 3.4_
- [ ] 4.5 Create `app/router.ts` with the `Route` type, `parseRoute` and `formatRoute` per the design (`encodeURIComponent` for every value, manual split, try/catch around decoding, demo name and live repo validation, empty `pkg` means absent).
  - _Requirements: 17.1, 17.2, 17.3_
- [ ] 4.6 Write `router.test.ts` examples: each route shape, `pkg` with `/`, `@scope/name`, `#`, `%`, `&`, `?`, spaces and emoji, bad percent-escape gives picker, empty string and `#` give picker, upper-case demo name gives picker.
  - _Requirements: 17.1, 17.2, 17.3_
- [ ] 4.7 Create `api/errors.ts` with `UiError`, `KNOWN_ERROR_CODES`, and the total `describeError` that implements the table in the design (titles, details, `retryable`, `retryAfterSeconds` clamped 1..3600 with default 60, `serverMessage` cut to 300, `parseDetail`).
  - _Requirements: 4.2, 4.3, 4.5, 4.6, 4.7, 4.8, 4.11_
- [ ] 4.8 Write `errors.test.ts`: a table-driven test over every documented code (status, title present, `retryable` as documented), 429 with `retry-after: 42`, `"0"`, `"-5"`, `"abc"`, `"99999"` and missing, a body that is `null`, an array and a 1 MB string, `network`, `timeout` and `parse` kinds.
  - _Requirements: 4.2, 4.3, 4.5, 4.6, 4.7, 4.11_
- [ ] 4.9 Create `test-support/fake-fetch.ts` (records calls with method, URL, headers, body; serves a route table of static responses or functions; throws a test-failing error with method and URL for anything unmatched; supports delayed responses released by the test and honours `AbortSignal`), `test-support/fake-timers.ts` (a manual `setTimeout`/`clearTimeout` and a clock with `advance(ms)`), and `test-support/build-report.ts` (builds a `ScanReport` from a list of `{ name, signals, config?, unknownReasons?, versionSource? }` using the real `scoreDeath`, with correct `summary`, plus tamper helpers for URLs, sums and grades).
  - _Requirements: 22.1, 22.5_
- [ ] 4.10 Create `api/client.ts` with `createApiClient({ fetch, setTimeout, clearTimeout, baseUrl })`: `getDemo` (API first, one static fallback for network error, 5xx and 404, none for 429 or 400, original error reported when both fail) and `scanRepo` (POST, JSON body, `credentials: "omit"`, 75 s timeout); every 200 body goes through `parseReport`; error bodies are read defensively (64 KB cap); caller abort returns a cancelled marker.
  - _Requirements: 2.2, 2.6, 3.5, 4.5, 4.6, 4.7, 5.1, 5.4_
- [ ] 4.11 Write `client.test.ts` with the fake fetch and timers: exact request shapes for demo and scan, no other demo requested, 200 with a valid report, 200 with garbage gives `bad_response` with category and path, 429 with `retry-after`, no fallback on 429 or 400, fallback on rejected fetch, 502 and 404, original error reported when the fallback fails, timeouts abort and give `client_timeout`, caller abort gives cancelled, no `fetch` call at import time, no storage API touched.
  - _Requirements: 2.2, 2.6, 3.5, 4.3, 4.5, 4.6, 4.7, 5.1, 5.4, 22.1_
- [ ] 4.12 Create the fixtures under `apps/exorcist-web/src/__fixtures__/`: write a one-off helper `test-support/trim-report.ts` (pure: keep chosen dependency names, recompute `summary`, keep `warnings` and `skipped`, serialize with `serializeReport`) and use it, run by hand once, to commit `parse-server.trim.json` (all five dead calibrated packages plus two ailing and two alive), `prettier.trim.json` (`remark-footnotes` plus three others), `jest.trim.json` (no dead, no dying, the warnings and the skipped workspace entries), and `pump.json` (copied whole). Write `__fixtures__/README.md` naming the source files and the trimming rule.
  - _Requirements: 22.3_
- [ ] 4.13 Write `fixtures.test.ts`: every committed fixture parses with `parseReport`; the parse-server fixture has at least one calibrated dead package; the jest fixture has zero dead and zero dying; and a real-data test parses all four `/demo/*.json`, then asserts the Requirement 6 invariants (partition, order, counts), that `buildBreakdown(...).consistent` is true for every dependency, and that every part URL is a Safe_Url. No hard-coded counts.
  - _Requirements: 22.3, 22.4_
- [ ] 4.14 Create `model/report-view.ts` (it imports from `@graveyard-kit/skeleton/graveyard` and `@graveyard-kit/exorcist-npm/report`, so delete the smoke file `imports.check.ts` from task 1.4 in this task) with `formatScannedAt`, `buildSummaryHeader` and `buildReportView(report, source)` per the design: counts from `buildGraveyard`, verbatim warnings, `rangesOnly` from `versionSource`, `summaryDisagrees`, `refLabel` ("default branch (HEAD)"), `sourceLabel`.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
- [ ] 4.15 Write `report-view.test.ts`: header for each fixture (repo, ref label, formatted time, counts, skipped, warnings verbatim and in order); `rangesOnly` true for the jest fixture and false when one dependency has `versionSource: "lockfile"`; `rangesOnly` false for zero dependencies; `summaryDisagrees` true for a tampered summary; `formatScannedAt` examples including an unparseable string and a leap-second-free millisecond form; no `Date` use (static check).
  - _Requirements: 8.1, 8.3, 8.4, 8.5_
- [ ] 4.16 Checkpoint after Phase 4 - Ensure `npm run typecheck` and `npm test` pass, ask the user if questions arise.

### Phase 5: Page properties and sabotage

- [ ] 5.1 Write the Property 6 test in `test-support/properties/p6.ts` and `router.p6.test.ts` (round trip over valid routes with hostile `pkg` strings; totality over arbitrary strings; idempotent normal form), with sabotages in `test-support/sabotage/p6.ts`: `/` not encoded; `&` not encoded; `ref` dropped; repo lower-cased on parse; decode errors thrown; `+` decoded as space.
  - **Property 6: Route codec round trip and totality**
  - **Validates: Requirements 17.1, 17.2, 17.3, 19.7**
- [ ] 5.2 Write the Property 7 test in `test-support/properties/p7.ts` and `repo-input.p7.test.ts` (accepted outputs match the patterns; every valid pair is accepted in each spelling with case preserved; other hosts, extra segments, `..`, inner spaces and over-length are rejected), with sabotages in `test-support/sabotage/p7.ts`: extra path segments accepted; any host accepted; `..` in ref accepted; `_` rejected in a repo name; result lower-cased; `.git` stripped anywhere in the name.
  - **Property 7: Repo input parsing**
  - **Validates: Requirements 3.2, 3.3, 19.7**
- [ ] 5.3 Write the Property 8 test in `test-support/properties/p8.ts` and `errors.p8.test.ts` (total, safe, bounded, non-empty strings, clamped retry), with sabotages in `test-support/sabotage/p8.ts`: throws on an unknown code; empty detail for unknown codes; unclamped `retryAfterSeconds`; negative or NaN `retryAfterSeconds`; server message not truncated; 429 without header gives `undefined`.
  - **Property 8: Error description is total and safe**
  - **Validates: Requirements 4.2, 4.3, 4.8, 4.11, 19.7**
- [ ] 5.4 Create `apps/exorcist-web/src/sabotage.test.ts`: run Properties 6 to 8, and the header half of Property 4 once task 5.5 adds it, against their lists with seed 20261113, the same failure message, the non-empty and presence assertions, and the real implementations passing under the same seed.
  - _Requirements: 20.1, 20.2, 20.3_
- [ ] 5.5 Add the header half of Property 4: extend `counts.p4.test.ts` (or a page-side `header.p4.test.ts`) to run `buildReportView` over generated reports (correct and tampered `summary`), asserting header counts deep-equal the view counts and an independent recount, `total === dependencies.length` (skipped excluded), and `summaryDisagrees` iff the summary differs. Add the sabotages to `test-support/sabotage/p4.ts` (counts from `report.summary`; total includes skipped; `summaryDisagrees` always false) and run them from `apps/exorcist-web/src/sabotage.test.ts` (task 5.4).
  - **Property 4: Header counts equal the grouped list sizes (header)**
  - **Validates: Requirements 6.5, 8.2, 8.3, 19.5**
- [ ] 5.6 Checkpoint after Phase 5 - Ensure `npm run typecheck` and `npm test` pass, ask the user if questions arise.

### Phase 6: Theme and DOM foundation

- [ ] 6.1 Create `apps/exorcist-web/src/styles/tokens.css` with the Theme_Tokens from the design (colors, `--font-ui`, `--font-num`, sizes, spacing, radii, focus ring) and `color-scheme: dark`. Create `theme/contrast.ts` with `parseHex`, `relativeLuminance`, `contrastRatio` and `hueOf`/`saturationOf`/`lightnessOf` (used by tests only).
  - _Requirements: 16.1, 16.2, 16.8_
- [ ] 6.2 Write `theme.test.ts`: contrast ratio examples (black on white is 21, symmetric, at least 1); every listed text/background pair of `tokens.css` is at least 4.5, and the focus ring and `--edge` pairs are at least 3; no saturated color token (saturation above 15%) has a hue from 250 to 335; no background token is lighter than 25%; no font stack contains a serif family (only `sans-serif` and `monospace` generics); a property over `contrastRatio` (symmetric, between 1 and 21, `numRuns` 100).
  - _Requirements: 16.1, 16.2_
- [ ] 6.3 Create `dom/h.ts`: `h(tag, props, ...children)` with the closed prop vocabulary of the design, a `SafeHref` brand produced only by `safeHref(value)` (wrapping `safeHttpUrl`) or by `constantHref(literal)`, text children via `createTextNode`, no HTML option. Create `dom/focus.ts`: `focusableWithin`, `trapTab`, `setInertAround`, `restoreFocus`.
  - _Requirements: 14.4, 14.5, 18.1, 18.3, 12.5_
- [ ] 6.4 Write `h.test.ts` (jsdom): text is never parsed as HTML (a name like `<img src=x onerror=alert(1)>` appears as text and creates no element), `href` set only from a `SafeHref`, unsupported props throw at type level (a `// @ts-expect-error` line), and `focus.test.ts` (jsdom): `trapTab` wraps from last to first and first to last, ignores `tabindex="-1"` and removed nodes.
  - _Requirements: 12.5, 14.4, 18.1_
- [ ] 6.5 Create `styles/base.css` (reset, typography scale with 16 px base and 18 px at 1200 px and up, landmarks, links, buttons with 44 px targets, focus ring `:focus-visible` using `--focus` 3 px with 2 px offset, never bare `outline: none`, `min-width: 0` on grid children, `overflow-wrap: anywhere` on names, `@media (forced-colors: active)` borders) and put all animation, transition and smooth scroll inside `@media (prefers-reduced-motion: no-preference)`.
  - _Requirements: 14.3, 16.3, 16.4, 16.5, 16.6, 16.8_
- [ ] 6.6 Create `styles/graveyard.css` (ground and fog, header stat blocks, group sections, tombstone variants: dead slab with arched top, ember top border, glow, "DEAD" chip, 24 px name and 56 px score at 1200 px and up; dying; ailing compact; alive chips; grids per the design with `minmax(min(100%, …), 1fr)`) and `styles/detail.css` (sheet on wide, full-height at narrow, backdrop, points bars, calibration row with double top rule and label chip, heavy total rule, stacked table at narrow with `data-label`).
  - _Requirements: 10.3, 16.3, 16.5, 16.6, 16.7_
- [ ] 6.7 Extend `theme.test.ts` with CSS text checks: every `animation`, `transition` and `scroll-behavior: smooth` declaration sits inside a `prefers-reduced-motion: no-preference` block; no `outline: none` or `outline: 0` without a following `:focus-visible` replacement; `min-width: 0`, `overflow-wrap: anywhere`, a 44 px target rule, a `forced-colors` block and the 18 px and 56 px recording sizes are present; no `url(http`, no remote `@import`.
  - _Requirements: 14.3, 16.3, 16.4, 16.5, 16.6, 16.8, 1.6_
- [ ] 6.8 Checkpoint after Phase 6 - Ensure `npm run typecheck` and `npm test` pass, ask the user if questions arise.

### Phase 7: Views and controller

- [ ] 7.1 Create `views/tombstone.ts`: a `<button>` per Grave with the accessible name "<name>, <grade>, score <n> of 100", description "Opens the score breakdown", `title`, text name (cut to 200 characters with an ellipsis), big score element with the accessible text of Requirement 15.2, grade text, `summaryLine`, and the "n unknown" badge with an `aria-label`; variants by grade; element ids from the Grave index (`grave-3`), never from the name.
  - _Requirements: 7.5, 11.4, 15.1, 15.2, 18.3, 18.5_
- [ ] 7.2 Create `views/graveyard.ts`: group sections in Grade_Order with `h2` and count, lists of Tombstones, the alive disclosure button (`aria-expanded`, `aria-controls`, lazy creation of alive Tombstones on first expand), the "no dead or dying packages" message, the zero-dependencies message, and the collapsed "Skipped (n)" `<details>` (create `views/skipped.ts`).
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7, 7.8_
- [ ] 7.3 Create `views/header.ts`: repo, ref label, formatted time, source label, totals, the four count controls (focus the group, or expand and focus the alive disclosure), the legend from `GRADE_INFO`, the verbatim warnings list (omitted when empty), the ranges-only note, the summary-disagrees notice, and the skip link "Skip to the dead packages" (first focusable of the screen).
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 14.2, 15.3_
- [ ] 7.4 Create `views/breakdown.ts`: a semantic table with caption and `th scope`; one row per `BreakdownRow` with label, visible explanation, raw display, "points / weight" text plus a CSS-width bar, known/unknown mark; Unknown_Row with the word "Unknown", source, plain-words category, message, or "No reason recorded", and the "scored as partly dead, never as alive" explanation; the Calibration_Row in its own `<tbody>` with the label chip and the text "Declared abandoned: <reason>, +<points>"; Source_Link anchors only from `safeHref` with `target="_blank"`, `rel="noopener noreferrer"` and the accessible name of Requirement 12.1; withheld text for unsafe values; "No source recorded"; the Total_Row in `<tfoot>`; the "Breakdown does not add up: rows sum to X, score is Y" error row; the grade notice.
  - _Requirements: 9.3, 9.4, 9.5, 9.6, 9.8, 10.1, 10.2, 10.3, 11.1, 11.2, 11.3, 12.1, 12.3, 12.4_
- [ ] 7.5 Create `views/proof-slot.ts`: an exhaustive `switch (state.status)` with a `never` default; `coming_soon` renders the "Proof" heading, "Exorcism coming", the description, and a button with `aria-disabled="true"` and `aria-describedby` that does nothing; the other four states render a plain "not available in this version" fallback line (they are never produced now).
  - _Requirements: 13.2, 13.3, 13.5, 13.6_
- [ ] 7.6 Create `views/detail.ts`: the `role="dialog"` panel (`aria-modal`, `aria-labelledby`), heading with `tabindex="-1"`, facts (name, version with "from lockfile" or "declared range", kinds, "n / 100", grade and range, replacement type and names), the Breakdown, evidence warnings, the Proof section for dead and dying only, Close button with `aria-label`, backdrop; open and close functions that implement the focus rules of Requirement 14.4 and 14.5 through `dom/focus.ts`.
  - _Requirements: 9.1, 9.2, 9.7, 13.3, 13.4, 14.4, 14.5, 15.5_
- [ ] 7.7 Create `views/picker.ts` and `views/live-form.ts`: the four Demo_Repo cards first (buttons, name, `owner/repo`, blurb, "cached snapshot, loads instantly, runs no scan"), then the Live_Scan_Form (labels, optional ref in a `<details>`, submit on Enter, the limit hint from `LIVE_SCAN_LIMIT`, the public-only and two-files text, inline field errors with `aria-invalid` and `aria-describedby`, `aria-disabled` while loading or cooling down). Create `views/status.ts`: the loading block (`role="status"`, repo name, "up to a minute", Cancel) and the error block (`role="alert"`, title, detail, secondary server message, parse detail, Retry when retryable, "Back to repos").
  - _Requirements: 2.1, 2.4, 2.5, 3.1, 3.4, 3.6, 3.7, 4.1, 4.3, 4.7, 4.8, 4.9_
- [ ] 7.8 Create `app/controller.ts`: the `Phase` state machine, request id with latest-wins and `AbortController`, the cancel path that keeps form values, the cooldown (`cooldownUntil`, a one-second timer for the `aria-hidden` countdown text, one `role="status"` announcement at start and one at end, injected clock and timers), route-driven loading (a demo route loads the demo, a live route shows the prefilled picker with the "not re-run on reload" message and never scans), `pkg` handling (open, unknown key notice), focus moves to the new `h1` on phase change, `document.title`, and a catch at the phase boundary that shows `unknown_error` with Retry.
  - _Requirements: 3.8, 4.1, 4.3, 4.4, 4.9, 4.10, 14.6, 15.7, 15.8, 17.4, 17.5, 17.6, 17.7_
- [ ] 7.9 Create `main.ts`: build the real dependencies (`fetch`, timers, clock, `location`), import the three stylesheets, mount the controller into `#app-root`, listen to `hashchange`, and keep `index.html` free of inline script and style (`lang="en"`, viewport without `maximum-scale`, a `<noscript>` message, the `#app-root` and `#dialog-root` siblings).
  - _Requirements: 1.6, 15.6, 16.8, 17.7_
- [ ] 7.10 Checkpoint after Phase 7 - Ensure `npm run typecheck` and `npm test` pass, ask the user if questions arise.

### Phase 8: DOM and static tests

- [ ] 8.1 Create `test-support/dom-harness.ts`: `mountPage({ route, fetchRoutes, now })` that creates the page DOM in jsdom with the fake fetch, fake timers and a fake clock, returns helpers (`tab()`, `shiftTab()`, `press(key)`, `click(el)`, `byRole`, `flush()`) and records focus. Keep it small; no network.
  - _Requirements: 21.1, 22.1_
- [ ] 8.2 Write `detail.dom.test.ts` (jsdom): open a calibrated dead package from the trimmed parse-server fixture; assert one Signal_Row per part, exactly one Calibration_Row whose text is "Declared abandoned: <reason>, +<points>", the Total_Row equals the score, and the sum of displayed row points equals the displayed score; a package without calibration has no such row.
  - _Requirements: 9.3, 9.4, 10.1, 10.2, 21.2_
- [ ] 8.3 Write `unknown.dom.test.ts` (jsdom): a synthetic report with unknown signals; each Unknown_Row shows "Unknown", the source, the category and the message (and "No reason recorded" when none), the explanation, its points count in the sum, and the Tombstone shows the "n unknown" badge.
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 21.3_
- [ ] 8.4 Write `links.dom.test.ts` (jsdom): a report with `javascript:alert(1)` and `data:text/html,x` source URLs and a valid https URL; no element in the document has an `href` or `src` starting with `javascript:` or `data:`; the withheld text appears; the valid link has `rel="noopener noreferrer"`, `target="_blank"` and the accessible name; a package name like `<img src=x onerror=alert(1)>` renders as text and creates no `img`.
  - _Requirements: 12.1, 12.3, 12.5, 18.1, 21.4_
- [ ] 8.5 Write `keyboard.dom.test.ts` (jsdom): Tab reaches the skip link, then the first Dead_Tombstone; Enter opens the Detail_Panel; focus is on the heading; Tab and Shift+Tab stay inside; the page behind has `inert` and `aria-hidden`; Escape closes; focus returns to the same Tombstone and `inert` is gone; Space also opens; a deep link `#/demo/parse-server?pkg=ldapjs` opens the panel on load and restores focus to the tombstone on close; an unknown `pkg` shows the notice and no panel.
  - _Requirements: 9.1, 14.2, 14.4, 14.5, 17.4, 17.6, 21.5_
- [ ] 8.6 Write `proof.dom.test.ts` (jsdom): a dead Grave shows the Proof section with "Exorcism coming" and a control with `aria-disabled="true"` that is focusable, does nothing when clicked or activated by Enter, and triggers no fetch; a dying Grave (synthetic) shows it; ailing and alive Graves show none.
  - _Requirements: 13.1, 13.3, 13.4, 13.6, 21.6_
- [ ] 8.7 Write `alive.dom.test.ts` (jsdom): the alive group is collapsed with the count text; no alive Tombstone exists in the DOM; Enter on the button sets `aria-expanded="true"` and creates the tombstones; Enter again collapses; the header count control for alive expands and focuses it.
  - _Requirements: 7.3, 7.4, 8.2, 21.7_
- [ ] 8.8 Write `states.dom.test.ts` (jsdom, fake fetch, fake timers): a 429 with `retry-after: 42` shows 42 seconds and keeps the scan button `aria-disabled="true"` while a demo card still loads a demo; advancing the fake clock to the end re-enables the button and writes the "scan again now" status once; the status is not rewritten every second; a network failure shows `network_unreachable` with Retry and "Back to repos"; a garbage 200 shows `bad_response`; Cancel returns to the picker with the typed values kept; a superseded slow request that resolves after a newer one does not change the page; a `#/live?...` load makes no request and shows the prefilled form with the message.
  - _Requirements: 3.7, 3.8, 4.3, 4.4, 4.5, 4.7, 4.9, 4.10, 17.5, 21.8, 21.9_
- [ ] 8.9 Write `safety.test.ts` (static, Node): none of `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`, `new Function`, `setAttribute("on` appears in `apps/exorcist-web/src/**/*.ts` outside test files and the test that lists them; no `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie`; `index.html` has no inline `<script>` body or `style=` attribute and no `http(s)://` resource reference; every `href` assignment goes through `SafeHref`.
  - _Requirements: 5.4, 12.5, 18.1, 18.2, 21.10_
- [ ] 8.10 Write `smoke.test.ts` (static): no file under `skeleton/` imports a path under `apps/`; `apps/exorcist-web/package.json` and every package.json changed by this spec declare no LLM client dependency and only exact-pinned versions for added dependencies; the `exorcist-npm` exports map contains only `./report`; `report.ts` runtime imports are only `@graveyard-kit/skeleton` and `./types.js`; the web `src` contains no import of a Node built-in outside test and `scripts/`; the root `package.json` has `dev`.
  - _Requirements: 1.2, 1.3, 1.6, 22.6, 23.1_
- [ ] 8.11 Checkpoint after Phase 8 - Ensure `npm run typecheck` and `npm test` pass, ask the user if questions arise.

### Phase 9: Dev workflow, build and documentation

- [ ] 9.1 Create `apps/exorcist-web/vite.config.ts`: `server.host` `127.0.0.1`, port 5173, `strictPort`, `server.proxy` `/api` to `http://127.0.0.1:27431`, the `demoSnapshots` plugin (dev middleware that serves `/demo/<name>.json` from the repo-root `demo/` directory only for names matching the demo pattern; `generateBundle` that emits every `demo/*.json` as `demo/<name>.json`), the build-only CSP `<meta>` injection from the design, `build.target` `es2022`, no sourcemaps.
  - _Requirements: 2.7, 16.9, 23.2, 23.3_
- [ ] 9.2 Write `vite-config.test.ts` (static, Node): import the plugin function and assert the demo-name guard rejects `..`, `a/b`, upper case, empty and 65-character names without touching the filesystem; the built-in CSP string forbids remote sources (`default-src 'self'`, `base-uri 'none'`, `form-action 'self'`); the proxy target is `127.0.0.1:27431`.
  - _Requirements: 2.7, 16.9, 23.2_
- [ ] 9.3 Create `apps/exorcist-web/scripts/dev.ts` (run with `vite-node`): spawn `npm run serve -w @graveyard-kit/exorcist-npm` and `vite`, prefix their output, forward SIGINT and SIGTERM to both, exit non-zero if either exits non-zero, print `Last Rites: http://127.0.0.1:5173/`. Add the web scripts `dev` (`vite-node scripts/dev.ts`) and `build` (`vite build`), and the root script `"dev": "npm run dev -w @graveyard-kit/exorcist-web"`. `npm test` and `npm run typecheck` must start none of them.
  - _Requirements: 23.1, 23.3_
- [ ] 9.4 Run `npm run build -w @graveyard-kit/exorcist-web` once; confirm `dist/` contains `index.html`, the bundled assets and `dist/demo/{jest,parse-server,prettier,pump}.json`, that the CSP meta is present, and that `dist/` is ignored by git (`.gitignore` already lists `dist/`). Fix any `.js`-suffix import or type-only import problem in the code, not by changing the convention. Do not commit `dist/`.
  - _Requirements: 2.7, 16.9, 23.3, 23.4_
- [ ] 9.5 Visual verification: if a browser or a headless screenshot tool is available, serve the build (or run the dev server) and check, at 375 by 812 and 1920 by 1080: no horizontal scroll at 375 and 320; the Summary_Header and all dead tombstones of parse-server visible without scrolling at 1920 by 1080; the calibration row and total readable in the Detail_Panel; focus ring visible on Tab; reduced motion stops the glow (emulate `prefers-reduced-motion: reduce`). If no browser is available, do not claim these checks; list them as not run.
  - _Requirements: 16.3, 16.5, 16.6, 24.3_
- [ ] 9.6 Append a dated entry to `docs/kiro-log.md`: the graveyard-ui build, the eight properties (five required plus the route codec, repo input and error totality), the sabotage results, the jsdom version chosen, the checks of 9.5 that were and were not run, and the judgment calls that matter (package name `exorcist-web`, view-model-only skeleton, no framework, custom dialog, static demo fallback, `./report` export, `npm run dev` added).
  - _Requirements: 23.5, 24.3_
- [ ] 9.7 Final checkpoint - Run `npm run typecheck` (zero errors across all workspaces) and `npm test` (all suites green, including the existing ones unchanged); confirm every property runs with `numRuns` 100, the fixed seed applies when `CI` is set, `FC_SEED` replays, and every sabotage entry fails its property. Ask the user if questions arise.
  - _Requirements: 19.1, 20.3, 24.1, 24.2_

## Task dependency graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4", "1.5", "2.1", "2.2", "2.4", "2.6", "2.12"] },
    { "id": 2, "tasks": ["2.3", "2.5", "2.7", "2.8", "2.10", "2.13", "4.1", "4.3", "4.5", "4.7", "6.1"] },
    { "id": 3, "tasks": ["2.9", "2.11", "2.14", "3.1", "3.2", "4.2", "4.4", "4.6", "4.8", "4.9", "6.2", "6.3"] },
    { "id": 4, "tasks": ["3.3", "3.4", "3.5", "3.6", "3.7", "4.10", "4.12", "6.4", "6.5", "6.6"] },
    { "id": 5, "tasks": ["3.8", "4.11", "4.13", "4.14", "5.1", "5.2", "5.3", "6.7"] },
    { "id": 6, "tasks": ["4.15", "5.4", "5.5", "7.1", "7.4", "7.5", "7.7"] },
    { "id": 7, "tasks": ["7.2", "7.3", "7.6"] },
    { "id": 8, "tasks": ["7.8", "7.9"] },
    { "id": 9, "tasks": ["8.1", "8.9", "8.10", "9.1"] },
    { "id": 10, "tasks": ["8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "9.2", "9.3"] },
    { "id": 11, "tasks": ["9.4"] },
    { "id": 12, "tasks": ["9.5", "9.6"] },
    { "id": 13, "tasks": ["9.7"] }
  ]
}
```

## Notes

- Scope is the Graveyard only. The proof harness, pin tests, spec export, the MCP server and the GitHub Actions app belong to other specs. The Proof panel is a disabled placeholder and `ProofState` is a data shape only.
- Nothing is renamed to "Last Rites" in this spec. `PRODUCT_NAME` is display text; the repo and package scopes are renamed later.
- Tests perform zero network requests: `no-network.setup.ts` loads for every test file, the Api_Client takes an injected `fetch`, and `fake-fetch.ts` fails any request it was not given. Fixtures are trimmed copies of `/demo/*.json` plus synthetic reports built with the real `scoreDeath`, because the demo snapshots contain no dying package, no unknown signal and no unsafe URL.
- Tests that need a DOM carry `// @vitest-environment jsdom`; everything else runs in Node. `jsdom` ignores `inert`, so DOM tests assert the attribute and the trap logic; real enforcement is part of the manual check in 9.5.
- Per the tech steering, properties use `numRuns: 100` and the existing seed policy (`FC_SEED` wins, `CI` fixes 20261113, otherwise a random seed recorded on failure). Per `proof-rules.md`, every property has a sabotage list that the central sabotage tests run.
- Properties 6 to 8 and the header half of Property 4 are additive to the five properties the brief asked for.
- Layout facts (no horizontal scroll at 375 px, above-the-fold fit at 1920 by 1080, real focus-ring rendering) cannot be proved by jsdom. CSS-text tests guard the rules that make them true, and task 9.5 records which checks were actually run in a browser.
- Commits reference spec task numbers (for example, `graveyard-ui 2.8: ...`) per the structure steering file.
- Test sub-tasks are not marked optional, matching the earlier plans: the product principle is proof over claims.
