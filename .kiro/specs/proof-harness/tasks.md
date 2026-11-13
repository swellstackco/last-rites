# Implementation Plan: proof-harness

## Overview

This plan builds the Proof_Harness per the proof-harness design: TypeScript (strict, ESM), Vitest + fast-check, zero network in tests, and no file copied from the parse-server checkout. It delivers the pure proof types, names and report codec in `skeleton/src/proof/`, the generic runner (outcome comparison, differential runner, mutators, sabotage check, `runProof`) in `skeleton/src/proof/runner/`, the npm usage surface on the TypeScript compiler API, the three hero recipes with pinned oracles, the `exorcise` CLI, the pure Proof_View and the Proof_Section of the page, all eleven correctness properties with sabotage lists, and a final group that runs the real CLI against `../lastrites-work/parse-server` and records every outcome truthfully.

Scope is the proof harness only. No change to the scan API, the scanner, the evidence stage or the death-score engine. No automatic rewriting of the target repository, no run of its test suite. Phases are sequential; within a phase, tasks are mostly independent. Do not write more than a task asks.

Terminology used in the tasks: a *Mutator* is part of the product (a deliberately wrong candidate wrapper); a *Sabotage_List* is the test-suite list of deliberately wrong implementations that a property must catch (`proof-rules.md`).

## Tasks

### Phase 1: Scaffold and dependencies

- [x] 1.1 Edit `skeleton/package.json`: move `fast-check` from `devDependencies` to `dependencies` pinned to the installed exact version `3.23.2`, and add the exports `"./proof": "./src/proof/index.ts"`, `"./proof/runner": "./src/proof/runner/index.ts"` and `"./proof/testing": "./src/proof/testing.ts"`, keeping every existing export. Create the three entry files as empty re-export stubs so the paths resolve.
  - _Requirements: 11.2, 11.4_
- [x] 1.2 Run `npm install --save-dev --save-exact intersect@1.0.1 deep-diff@1.0.2 -w @graveyard-kit/exorcist-npm` and `npm install --save-exact typescript@5.9.3 -w @graveyard-kit/exorcist-npm` (this is the only task that needs the network; it updates `package-lock.json`). Confirm `apps/exorcist-npm/package.json` lists the three exact versions and that `npm ls typescript` still shows one hoisted `5.9.3`.
  - _Requirements: 11.1, 11.6_
- [x] 1.3 Edit `apps/exorcist-npm/package.json` to add the script `"exorcise": "vite-node src/exorcise/cli.ts --"` and nothing else (the `exports` field stays unchanged).
  - _Requirements: 10.1, 11.3_
- [x] 1.4 Create `demo/proofs/.gitkeep` and `demo/proofs/candidates/parse-server/.gitkeep` so the directories exist before the final task group.
  - _Requirements: 9.8, 15.6_
- [x] 1.5 Run `npm run typecheck` and `npm test` and confirm they are still green with the stubs; confirm the root `vitest.config.ts` already includes `skeleton/src/**/*.test.ts` and `apps/*/src/**/*.test.ts` (no change expected).
  - _Requirements: 17.6_
- [x] 1.6 Checkpoint after Phase 1 - Ensure all tests pass, ask the user if questions arise.

### Phase 2: Pure proof types, names and report codec (skeleton)

- [x] 2.1 Create `skeleton/src/proof/types.ts` with `Enclosing`, `ImportForm`, `CallSite`, `ImportSite`, `UsageSurfaceInput`, `UsageSurfaceResult`, `UsageSurface`, `ProofStatus`, `ProofErrorCode`, `Recommendation`, `ShapeResult`, `SabotageSummary`, `CounterexampleRecord`, `ProofAttempt` and `ProofReport`, exactly as in the design. No import of `fast-check`, Node or `apps/`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 9.2, 9.3_
- [x] 2.2 Create `skeleton/src/proof/usage-surface.ts` with `compareSites` (file by UTF-16 code unit, then line, then column) and `sortSites` (returns a new array, stable).
  - _Requirements: 1.5_
- [x] 2.3 Write `skeleton/src/proof/usage-surface.test.ts`: examples for `compareSites` (code-unit order of `B` before `a`, line before column) plus one fast-check property (`numRuns` 100 through `fc-runner.ts`) that `sortSites` is a permutation, is sorted, and is idempotent.
  - _Requirements: 1.5_
- [x] 2.4 Create `skeleton/src/proof/names.ts` with `PROOF_NAME_PATTERN`, `isProofName`, `proofReportPath` and `parseProofReportPath`.
  - _Requirements: 9.8, 13.1, 13.6_
- [x] 2.5 Write `skeleton/src/proof/names.test.ts` examples: `parse-server`, `intersect`, 64 and 65 characters, upper case, `.`, `..`, `a/b`, empty, `-x`, `%2e`; `proofReportPath` shape and `parseProofReportPath` inverse. (The numbered Property 11 is written in Phase 6 over names and CLI arguments together.)
  - _Requirements: 9.8, 13.1_
- [x] 2.6 Create `skeleton/src/proof/report.ts` part 1: `serializeProofReport` with the key order table of the design, field-by-field rebuilding (never relying on input key order), sorted `coverage` keys, two-space indent, one trailing newline, absent optionals omitted.
  - _Requirements: 9.1, 9.2, 9.3, 9.4_
- [x] 2.7 Extend `report.ts` part 2: `parseProofReport` structural walk copying the `Fail`, `field`, `describe` and `Object.hasOwn` pattern of `apps/exorcist-npm/src/scan/report.ts` (categories `empty`, `invalid_json`, `missing_field`, `wrong_type`, unknown keys rejected as `wrong_type`, integers only, `-0` rejected, path messages, never throws).
  - _Requirements: 9.5_
- [x] 2.8 Extend `report.ts` part 3: `checkConsistency` (every rule of Requirement 9.7, first violation with a path message), the `inconsistent` category, the `not_canonical` re-serialization check in the order structural, consistent, canonical, and `appendAttempt` (returns a new report, numbers the attempt).
  - _Requirements: 9.5, 9.6, 9.7_
- [x] 2.9 Create `skeleton/src/proof/test-support/arbitraries/report.ts`: a valid, consistent `ProofReport` arbitrary built field by field (0 to 8 call sites and import sites; 1 to 4 attempts built per status so that every rule of Requirement 9.7 holds; Unicode and escaped strings in `source`, `input` and outputs; empty and non-empty arrays; integers only).
  - _Requirements: 9.1, 9.7_
- [x] 2.10 Write the Property 9 test in `skeleton/src/proof/report.p9.test.ts` (exporting `build(codec)`): round trip, canonical re-serialization, single-edit rejection (whitespace, key order, extra key, missing newline, `1.0`), `missing_field` and `wrong_type` with path, each consistency rule broken alone gives `inconsistent`, no throw on arbitrary strings.
  - **Property 9: Proof_Report codec**
  - **Validates: Requirements 9.1, 9.2, 9.3, 9.5, 9.6, 9.7**
- [x] 2.11 Create the Sabotage_List `skeleton/src/proof/test-support/sabotage/proof-p9.ts` (four-space indent; no trailing newline; key order from input; absent optional as `null`; lenient parse without the canonical comparison; skip the consistency check; parse throws on empty text; parse fills a missing field; accept an unknown key), with the required-name constants.
  - _Requirements: 18.2, 18.5_
- [x] 2.12 Write `skeleton/src/proof/report.test.ts` examples: a handwritten report with its exact expected text, each `ReportParseError` category with its path message, each consistency rule with its message, `appendAttempt` numbering and non-mutation.
  - _Requirements: 9.1, 9.5, 9.6, 9.7_
- [x] 2.13 Fill `skeleton/src/proof/index.ts` with the pure exports (types, `compareSites`, `sortSites`, names, `serializeProofReport`, `parseProofReport`, `appendAttempt`, `checkConsistency`).
  - _Requirements: 1.1, 11.4_
- [x] 2.14 Checkpoint after Phase 2 - Ensure all tests pass, ask the user if questions arise.

### Phase 3: Runner (outcome, differential, mutators, sabotage, runProof)

- [x] 3.1 Create `skeleton/src/proof/runner/types.ts`: `OutputKind`, `Projection`, `Outcome`, `CallShape`, `Recipe`, `ProofInput`, `ProofResult`, `Mutator`, as in the design. Imports `fast-check` types and the pure proof types only.
  - _Requirements: 5.2, 5.3, 5.5, 5.6, 6.1_
- [x] 3.2 Create `skeleton/src/proof/runner/clone.ts`: `deepClone` (arrays, plain objects with own `__proto__` keys defined not assigned, `Date`, primitives including `-0`, `NaN`, `undefined`, `bigint`; other objects returned as is; depth guard 1000).
  - _Requirements: 6.6_
- [x] 3.3 Create `skeleton/src/proof/runner/equal.ts`: `structuralEqual` per Requirement 6.5.
  - _Requirements: 6.5_
- [x] 3.4 Create `skeleton/src/proof/runner/outcome.ts`: `capture`, `isThenable`, `outcomesAgree(projection, a, b)`, `render` (`fc.stringify`, cut to 2000 code units plus `…`), `renderOutcome` (`<threw>`), `resolveMember(module, member)` returning `{ fn, thisArg }` or `undefined`.
  - _Requirements: 6.4, 6.7, 6.8_
- [x] 3.5 Write the Property 8 test in `skeleton/src/proof/runner/outcome.p8.test.ts` (exporting `build(impl)` over `{ structuralEqual, deepClone, outcomesAgree }`): reflexive, symmetric, key-order permutation, `-0` vs `0`, `NaN`, array order, `Date`, class instances, clone equality and non-identity, own `__proto__` preserved, throw-versus-return rules with random messages.
  - **Property 8: Outcome equivalence including exceptions**
  - **Validates: Requirements 6.4, 6.5, 6.6**
- [x] 3.6 Create the Sabotage_List `skeleton/src/proof/test-support/sabotage/proof-p8.ts` (compare thrown messages; `-0` as `0`; `NaN` never equal; key-order sensitive; sort arrays before comparing; compare with `JSON.stringify`; `deepClone` returns the same object; `deepClone` assigns `__proto__`).
  - _Requirements: 18.2_
- [x] 3.7 Create `skeleton/src/proof/test-support/synthetic-recipes.ts`: pure synthetic oracles, candidates and `CallShape`s (`sort-unique` over integer arrays, `guarded-sqrt` throwing on negatives with the input in the message, `subtract(a, b)` order sensitive, `make-record` returning plain objects, `first-of-two` symmetric), a `usageFor(shape, n)` helper that builds accepted call sites, and a fault family of candidates (identity, de-duplicate, reverse, drop-last, off-by-one on a threshold, throw on empty, mutate its input, swap arguments).
  - _Requirements: 6.1, 8.3_
- [x] 3.8 Create `skeleton/src/proof/runner/differential.ts`: `runShape` with `fc.check`, `guardOrThrow`, thenable rejection, `safely` wrapper around recipe code, coverage counting, the three harness error classes, counterexample re-run on fresh clones for the rendered outputs, and `ShapeRun`.
  - _Requirements: 6.1, 6.2, 6.3, 6.6, 6.7, 6.8, 6.9, 6.10, 6.12, 7.6_
- [x] 3.9 Write `skeleton/src/proof/runner/differential.test.ts` examples with the synthetic recipes: passes with the recorded seed, counterexample with shrunk input and rendered outputs, both-throw equal, one-throw different, a thenable result, a throwing `classify`, a failing `guard`, `this` set to the holder of the member, an argument-mutating candidate not affecting the oracle, `runs` counting, same seed gives the same inputs.
  - _Requirements: 6.1, 6.3, 6.4, 6.6, 6.7, 6.8, 6.9, 6.10, 6.12_
- [x] 3.10 Create `skeleton/src/proof/runner/mutators.ts`: `BUILT_IN_MUTATORS` (the six Mutators with the applicability table of Requirement 8.3) and `applicableMutators(shape, list)`.
  - _Requirements: 8.2, 8.3, 8.7_
- [x] 3.11 Write `skeleton/src/proof/runner/mutators.test.ts` examples: each Mutator on a sample value, the applicability table for each `outputKind`/`observes`/`argCount`/`orderSensitive` combination, the wrapper calls the real function and keeps `this`, deep-frozen arguments and results are not modified.
  - _Requirements: 8.2, 8.3, 8.7_
- [x] 3.12 Create `skeleton/src/proof/runner/sabotage.ts`: `runSabotage(shapeRuns, resolve, cfg, mutators)` returning `SabotageSummary` with survivors named `<shape id>:<mutator name>` in shape order then mutator order, an `error` mutant run counted as a survivor.
  - _Requirements: 8.1, 8.4, 8.5_
- [x] 3.13 Create `skeleton/src/proof/runner/run-proof.ts`: `runProof` with the gate order of Requirement 7.10, member resolution, per-shape runs, error collection, `counterexample`, `insufficient_coverage`, `proved`, the Sabotage_Check only for `proved`, the `weak` rule, the `recommendation`, and one outer `try` that turns an unexpected throw into `recipe_failure` with a generic message.
  - _Requirements: 5.7, 5.8, 6.11, 7.1, 7.2, 7.3, 7.4, 7.5, 7.7, 7.8, 7.9, 7.10, 8.1, 8.6_
- [x] 3.14 Write `skeleton/src/proof/runner/run-proof.test.ts` examples: one test per error code and per status with the expected order when several conditions hold, `invalid_runs` at 99, `oracle_version_mismatch`, `candidate_missing_member` with no candidate, shapes with no accepted site listed as `skipped` and never run, the recommendation for zero and non-zero import sites, an empty mutator list gives `weak` with `applied` 0, never throws on hostile input.
  - _Requirements: 5.7, 5.8, 6.2, 6.11, 7.1, 7.2, 7.3, 7.4, 7.5, 7.7, 7.8, 7.10, 8.6_
- [x] 3.15 Write the Property 3 test in `skeleton/src/proof/runner/run-proof.p3.test.ts` (exporting `build(impl)`): generated `ProofInput` with the defects listed in the design, a reference model of Requirement 7.10 in the test, and the independent check of every condition of Requirement 7.9 for `proved`.
  - **Property 3: No trivial passes**
  - **Validates: Requirements 5.7, 5.8, 7.1 to 7.10**
- [x] 3.16 Create the Sabotage_List `skeleton/src/proof/test-support/sabotage/proof-p3.ts` (return `proved` for zero call sites; ignore unaccepted call sites; skip the `guard` check; skip the coverage check; run shapes that accept nothing; treat `filesScanned` 0 as fine; always recommend `remove-dependency`; check the gates in a different order).
  - _Requirements: 18.2, 18.5_
- [x] 3.17 Write the Property 2 test in `skeleton/src/proof/runner/differential.p2.test.ts` (exporting `build(impl)`): the fault family against the synthetic oracles; when `counterexample`, re-run both sides on fresh clones of the reported arguments and assert the Projections differ (or exactly one throws), `input`, `oldOutput` and `newOutput` equal the re-run renderings, `args` passes `guard`; when the candidate is equivalent on a large independent sample, assert `proved`.
  - **Property 2: Counterexample reality**
  - **Validates: Requirements 6.6, 6.8, 7.9**
- [x] 3.18 Create the Sabotage_List `skeleton/src/proof/test-support/sabotage/proof-p2.ts` (report the pre-shrink arguments; swap old and new output; render the new output from a different call; pass the same argument object to both sides; report the arguments of the last passing run).
  - _Requirements: 18.2_
- [x] 3.19 Write the Property 5 test in `skeleton/src/proof/runner/report-determinism.p5.test.ts` (exporting `build(impl)`): three `runProof` plus `serializeProofReport` runs of a generated input with `Math.random` consumed and `Date.now` changed between them are byte-identical; the text has no ISO timestamp, no process path, no current-time digits.
  - **Property 5: Determinism**
  - **Validates: Requirements 6.3, 6.11, 9.4**
- [x] 3.20 Create the Sabotage_List `skeleton/src/proof/test-support/sabotage/proof-p5.ts` (current time in the report; `Math.random()` in an error message; fresh random seed when none is given; `process.cwd()` in the candidate name; coverage key order from a shuffled insertion).
  - _Requirements: 18.2, 18.5_
- [x] 3.21 Write the Property 7 test in `skeleton/src/proof/runner/sabotage.p7.test.ts` (exporting `build(impl)`): generated synthetic recipes (some mutants survive), mutator lists (built-ins, subset, empty), seeds; accounting, ordering, `weak` rule, zero sabotage for non-proved, and deep-frozen inputs showing no Mutator modified anything.
  - **Property 7: Sabotage accounting and the weak flag**
  - **Validates: Requirements 8.1, 8.5, 8.6, 8.7**
- [x] 3.22 Create the Sabotage_List `skeleton/src/proof/test-support/sabotage/proof-p7.ts` (`weak` ignores survivors; `weak` false when `applied` is 0; survivors include caught mutants; run the check for a `counterexample` status; count `applied` before filtering; survivors in reversed mutator order; a Mutator that writes into its argument).
  - _Requirements: 18.2_
- [x] 3.23 Fill `skeleton/src/proof/runner/index.ts` (`runProof`, `BUILT_IN_MUTATORS`, `applicableMutators`, `structuralEqual`, `deepClone` and the runner types) and `skeleton/src/proof/testing.ts` (synthetic recipes, report arbitrary, fault family).
  - _Requirements: 11.2_
- [x] 3.24 Create `skeleton/src/proof/sabotage.test.ts`: import the Sabotage_Lists for Properties 2, 3, 5, 7, 8 and 9, run each property against every entry with the fixed seed through `assertAllSabotagesCaught`, fail with `Sabotage "<name>" stayed green for "<property>"`, assert every list is non-empty, assert the required names exist in the right lists, and assert the real implementations pass every property under the same seed.
  - _Requirements: 18.2, 18.3, 18.4, 18.5_
- [x] 3.25 Checkpoint after Phase 3 - Ensure all tests pass, ask the user if questions arise.

### Phase 4: Usage surface (npm)

- [x] 4.1 Create `apps/exorcist-npm/src/exorcise/source-fs.ts`: `DirEntry`, `SourceFs`, and `createNodeSourceFs()` (`readdir` with file types, no symlink following, `undefined` for unreadable directories and files).
  - _Requirements: 2.8, 2.9_
- [x] 4.2 Write `source-fs.test.ts` against a temporary directory removed in `finally`: file and directory kinds, a symlink reported as `other`, a missing directory gives `undefined`, an unreadable file gives `undefined`.
  - _Requirements: 2.1, 2.5, 2.6_
- [x] 4.3 Create `apps/exorcist-npm/src/exorcise/test-support/memory-fs.ts`: a `SourceFs` over a generated map of path to text, with a `shuffle(seed)` option for listing order and an option to make chosen files unreadable or oversized.
  - _Requirements: 17.4_
- [x] 4.4 Create `apps/exorcist-npm/src/exorcise/classify-path.ts` with `enclosingOf(file)` per Requirement 2.7.
  - _Requirements: 2.7_
- [x] 4.5 Write `classify-path.test.ts`: `spec/a.js`, `src/test/x.ts`, `lib/__tests__/y.js`, `a.spec.js`, `b.test.tsx`, `__mocks__/z.js`, `src/contest/a.js` (not a test), `src/Controllers/DatabaseController.js`.
  - _Requirements: 2.7_
- [x] 4.6 Create `apps/exorcist-npm/src/exorcise/consumption.ts` with `detectConsumedAs(callNode)` per Requirement 4 (matcher chain with optional `.not`, `undefined` and `void 0`, `===` and `!==` either side, parentheses skipped, syntax tree only).
  - _Requirements: 4.1, 4.2, 4.3, 4.4_
- [x] 4.7 Write `consumption.test.ts` examples, parsing small snippets with `ts.createSourceFile`: `.toEqual(undefined)` single-line and multi-line, `.toStrictEqual`, `.toBe(undefined)`, `.toBeUndefined()`, `.not.toBeDefined()`, `x === undefined`, `undefined !== x`, `void 0`, and the negatives `== undefined`, `.toEqual(null)`, `.toEqual({})`, `if (x)`, an assignment, an argument of another function.
  - _Requirements: 4.1, 4.2, 4.3, 4.4_
- [x] 4.8 Create `apps/exorcist-npm/src/exorcise/bindings.ts`: from one `SourceFile` and the package name, collect the binding map (first binding in source order wins) and the Import_Sites for every form of Requirements 3.1, 3.6 and 3.7.
  - _Requirements: 3.1, 3.5, 3.6, 3.7, 3.8_
- [x] 4.9 Write `bindings.test.ts` examples: each import and require form with its `member` prefix, destructuring with rename, `require().a`, `import =`, `import type`, side-effect import, re-export, dynamic import, unbound `require`, a subpath specifier, a template literal without substitutions, `require(variable)` ignored, a repeated local name.
  - _Requirements: 3.1, 3.5, 3.6, 3.7_
- [x] 4.10 Create `apps/exorcist-npm/src/exorcise/calls.ts`: from one `SourceFile` and the bindings, collect Call_Sites (identifier, property chain, string-literal element access, optional chain, `new`, immediate `require()` callee roots, `<dynamic>`), with `argTexts` collapsed and cut to 200 code units, positions 1-based at the start of the callee, `consumedAs` from `detectConsumedAs`.
  - _Requirements: 1.2, 1.7, 3.2, 3.3, 3.4, 3.5, 3.6, 3.9, 4.1, 4.2_
- [x] 4.11 Write `calls.test.ts` examples: `x(a)`, `x.big(a)`, `x["big"](a)`, `x?.big(a)`, `x[k](a)` (`<dynamic>`), `new x(a)`, nested `x(x(a))`, a call inside an argument, `require("P")(a)`, `require("P").big(a)`, positions on multi-line calls, `argTexts` whitespace collapse and the 200 cut, spread arguments kept as text starting with `...`, a call of an unbound name ignored.
  - _Requirements: 1.2, 3.2, 3.3, 3.4, 3.9_
- [x] 4.12 Create `apps/exorcist-npm/src/exorcise/usage-surface.ts`: `createUsageSurface({ fs })` with the walk (skip list, extension filter, no declaration files, 2 MiB limit, 50000 file guard), `parseSource` with the script kind per extension, `syntaxDiagnosticCount` through one narrow cast of `parseDiagnostics`, warnings, `filesScanned`, sorting with `sortSites`, and `enclosing` from `enclosingOf`.
  - _Requirements: 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_
- [x] 4.13 Create the synthetic fixture tree `__fixtures__/trees/intersect-like/`: `src/Controllers/Db.js` (Flow-annotated `const allIds: Array<Array<string>> = [...]`, `import intersect from 'intersect'`, `intersect.big(allIds)` and `intersect(allIds)` in an if/else), a decoy `src/other.js` calling `other.big(x)`, and `package.json`. Written for this repository; not copied from the target.
  - _Requirements: 17.2_
- [x] 4.14 Create the fixture tree `__fixtures__/trees/deep-diff-like/`: `spec/Schema.spec.js` and `spec/schemas.spec.js` with `const dd = require('deep-diff')`, single-line and multi-line `expect(dd(a, b)).toEqual(undefined)`, plus one `dd` call consumed another way in `spec/Odd.spec.js` (to exercise `unsupported_call_shapes`).
  - _Requirements: 17.2_
- [x] 4.15 Create the fixture tree `__fixtures__/trees/declared-only/` (`package.json` listing `node-abort-controller`, `src/index.js` that never imports it) and `__fixtures__/trees/README.md` stating that every tree was written for this repository, which call shape each mimics, and that `node_modules` and `dist` are created in temporary directories by the tests because `.gitignore` excludes them.
  - _Requirements: 17.2, 17.3_
- [x] 4.16 Write `usage-surface.test.ts` examples: the three fixture trees (intersect: 2 call sites, 1 import, `src`; deep-diff: sites consumed and the odd one not; declared-only: zero sites and zero imports), Flow tolerance (warning with the diagnostic count, sites still found), `const x = ;` warning, an unreadable root, an oversized file skipped, a temporary directory with `node_modules` and `dist` ignored, the symlink case, and a rerun giving an identical result.
  - _Requirements: 1.6, 2.1, 2.3, 2.4, 2.5, 2.6, 17.2, 17.3_
- [x] 4.17 Create `apps/exorcist-npm/src/exorcise/test-support/tree-model.ts`: the Property 6 generator (files, statements with known lines and columns, decoys, wrappers, Flow annotations, skipped directories) and the function that derives the expected `UsageSurfaceResult` from the model, so no second parser is written.
  - _Requirements: 17.4_
- [x] 4.18 Write the Property 6 test in `usage-surface.p6.test.ts` (exporting `build(impl)` over a usage-surface factory): exact call sites and import sites, `filesScanned`, order, shuffled listing gives deep-equal results, rerun gives deep-equal results, `consumedAs` iff wrapped.
  - **Property 6: Usage-surface determinism and completeness**
  - **Validates: Requirements 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.7, 3.1 to 3.9, 4.1 to 4.3**
- [x] 4.19 Create the Sabotage_List `apps/exorcist-npm/src/exorcise/test-support/sabotage/proof-p6.ts` (skip `.js` files with a type annotation; count a nested call once; count the `expect(...)` call as a call of the bound name; ignore `new`; read `node_modules`; ignore optional chaining; ignore string-literal element access; treat `== undefined` as an undefined check; classify `enclosing` by directory only; sort with `localeCompare`; return files in listing order), each a small wrapper over the real implementation or a `SourceFs` filter.
  - _Requirements: 18.2, 18.5_
- [x] 4.20 Checkpoint after Phase 4 - Ensure all tests pass, ask the user if questions arise.

### Phase 5: Oracles, candidates and recipes

- [x] 5.1 Create `apps/exorcist-npm/src/exorcise/oracles.ts`: `loadOracle(pkg)` through `createRequire(import.meta.url)` for the pinned oracles `intersect` and `deep-diff` only, returning `{ module, version }` (version from the package's `package.json`), `undefined` for any other name, no network.
  - _Requirements: 11.5, 17.5_
- [x] 5.2 Write `oracles.test.ts`: versions are exactly `1.0.1` and `1.0.2`, `intersect([["a","b"],["b"]])` is `["b"]`, `intersect.big` exists, `dd({a:1},{a:1})` is `undefined` and `dd({a:1},{a:2})` is an array, `loadOracle("left-pad")` is `undefined`.
  - _Requirements: 11.1, 11.5_
- [x] 5.3 Create `apps/exorcist-npm/src/exorcise/recipes/types.ts`: `AppRecipe = Recipe & { loadOracle?(): { module: unknown; version: string } | undefined }`.
  - _Requirements: 5.2_
- [x] 5.4 Create `recipes/intersect.ts`: the two shapes (`intersect`, `intersect.big`), `accepts` per Requirement 5.3, the objectId-like arbitrary (pooled and independent lists, 0 to 6 lists of 0 to 8 ids of 10 to 24 characters, duplicates and a non-ASCII character in the alphabet), `guard`, `classify` and the five required labels, `expectedVersion` `1.0.1`.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 15.1, 15.2_
- [x] 5.5 Write `recipes/intersect.test.ts`: `accepts` true and false cases, `fc.sample` of 500 values shows every required label and all values pass `guard`, an example where a native `Set` de-duplicating function differs from the oracle on a last list with a repeated shared element, and an example where an order-preserving corrected function agrees.
  - _Requirements: 15.1, 15.2_
- [x] 5.6 Create `recipes/deep-diff.ts`: one shape (member `""`, two arguments, accepted only with `consumedAs` `undefined-check`), the `isUndefined` Projection that observes `definedness`, the pair arbitrary (reordered clone, clone with one change, independent), `guard`, `classify` (`equal-pair`, `unequal-pair`), `expectedVersion` `1.0.2`.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 15.3, 15.4_
- [x] 5.7 Write `recipes/deep-diff.test.ts`: `accepts` requires `consumedAs`, 500 samples show both labels and pass `guard`, key order is shuffled in the equal family, a one-change clone is never deep equal to its source, the arbitrary uses keys `*` and `_id`.
  - _Requirements: 15.3, 15.4_
- [x] 5.8 Create `recipes/node-abort-controller.ts` (`shapes: []`, no `loadOracle`) and `recipes/index.ts` exporting `RECIPES`.
  - _Requirements: 5.1, 15.5_
- [x] 5.9 Write `recipes/index.test.ts`: the registry holds exactly the three packages, shape ids are unique, every shape's `argCount` matches its arbitrary's value length, `node-abort-controller` has no shape.
  - _Requirements: 5.1, 15.5_
- [x] 5.10 Create `apps/exorcist-npm/src/exorcise/candidate.ts`: `loadCandidate(file)` reading the source text, `import(pathToFileURL(...))`, `default ?? namespace`, returning `{ module, name, source }`, rejecting with a clear message for a missing file or an import error.
  - _Requirements: 10.5_
- [x] 5.11 Write `candidate.test.ts` with temporary candidate files removed in `finally`: a default-exported function with a `big` member, a namespace without `default`, a missing file, a file that throws on import.
  - _Requirements: 10.5_
- [x] 5.12 Write the Property 1 test in `recipes.p1.test.ts` (exporting `build(impl)` over `runProof`): the real `intersect` and `deep-diff` recipes and the synthetic recipes, the oracle itself and a call-through wrapper as candidate, accepted call sites generated per shape, status `proved`.
  - **Property 1: Differential soundness**
  - **Validates: Requirements 6.1 to 6.5, 6.7, 7.9, 15.1 to 15.4**
- [x] 5.13 Create the Sabotage_List `test-support/sabotage/proof-p1.ts` (compare outputs with `===`; compare thrown messages; call without `this`; project only the oracle side; compare with `JSON.stringify`).
  - _Requirements: 18.2, 18.5_
- [x] 5.14 Write the Property 4 test in `recipes.p4.test.ts` (exporting `build(impl)` over `{ recipes, mutators }`): for every recipe, shape and applicable Mutator, the Mutator applied to the oracle is caught; for every non-applicable Mutator, the stated reason from the table holds (for example `swap-first-two-args` is not applicable to `deep-diff` because `orderSensitive` is false).
  - **Property 4: Sabotage completeness**
  - **Validates: Requirements 8.2, 8.3, 8.4, 8.8**
- [x] 5.15 Create the Sabotage_List `test-support/sabotage/proof-p4.ts` (a Mutator that returns the original output; an `intersect` arbitrary limited to lists of length 0 or 1; a `deep-diff` arbitrary that never makes equal pairs; a recipe claiming `orderSensitive` for a symmetric function; a recipe declaring `outputKind` `array` for an object output).
  - _Requirements: 18.2, 18.5_
- [x] 5.16 Checkpoint after Phase 5 - Ensure all tests pass, ask the user if questions arise.

### Phase 6: Proof CLI

- [x] 6.1 Create `apps/exorcist-npm/src/exorcise/cli-args.ts`: `parseCliArgs(argv)` per Requirements 10.1 to 10.3 (required flags, unknown flags, repeated flags, missing values, `--runs` 100 to 100000 integer digits only, `--seed` non-negative integer digits only, package a Proof_Name, `--out` parent a Proof_Name under `proofs`, defaults 200 and 20261113). Pure and total.
  - _Requirements: 10.1, 10.2_
- [x] 6.2 Write `cli-args.test.ts` examples: a full valid command, defaults, each rejection with its message, `--runs 99`, `--runs 1e3`, `--runs 100001`, `--seed -1`, `--out demo/proofs/parse-server/intersect.json` accepted, `--out x.json` rejected, `@babel/core` rejected.
  - _Requirements: 10.1, 10.2_
- [x] 6.3 Write the Property 11 test in `names-cli.p11.test.ts` (exporting `build(impl)` over `{ isProofName, proofReportPath, parseProofReportPath, parseCliArgs }`): name pattern equality, path form and inverse, `parseCliArgs` totality and the acceptance conditions.
  - **Property 11: Proof names, paths and CLI arguments**
  - **Validates: Requirements 9.8, 10.1, 10.2, 13.1, 13.6**
- [x] 6.4 Create the Sabotage_List `test-support/sabotage/proof-p11.ts` (pattern allows upper case; pattern allows a dot; length limit 65; path built without validation; accept `--runs 99`; accept `--runs 1e3`; accept a negative seed; accept an unknown flag; `--out` directory not validated).
  - _Requirements: 18.2_
- [x] 6.5 Create `apps/exorcist-npm/src/exorcise/report-store.ts`: `ReportFs`, `createNodeReportFs()` (read text or `undefined` for a missing file; `writeAtomic` creating the directory, writing `.<name>.<n>.tmp` in the same directory, renaming, removing the temp file on failure), following `scan/demo-snapshot.ts`.
  - _Requirements: 10.7_
- [x] 6.6 Write `report-store.test.ts` against a temporary directory removed in `finally`: write then read the same bytes, the directory is created, an injected rename failure removes the temp file and keeps the old file, a missing file reads as `undefined`.
  - _Requirements: 10.7_
- [x] 6.7 Create `apps/exorcist-npm/src/exorcise/run.ts`: `ExorciseDeps`, `ExorciseOutcome` and `exorcise(deps, args)` with the run flow of the design (usage scan, call sites without candidate gives exit 2, recipe and oracle lookup, candidate load, `runProof`, existing report read and validated, `--fresh`, header comparison, append, atomic write, exit codes, the summary lines and the warnings cap of 10), never throws.
  - _Requirements: 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10_
- [x] 6.8 Write `run.test.ts` in-process with an in-memory `ReportFs`, the memory file system over the fixture trees and the real recipes and oracles: no call sites gives `no-call-sites` with `remove-dependency` and needs no candidate, call sites without a candidate exit 2 and write nothing, a proved attempt (candidate is a call-through of the oracle) with a sabotage line, a counterexample attempt (a de-duplicating candidate) printing the shrunk input and both outputs, a second run appends attempt 2, `--fresh` restarts, a mismatching existing report exits 1 and writes nothing, an unparseable existing report exits 1, a load failure exits 1, a write failure exits 1, `unsupported_call_shapes` on the odd deep-diff tree recorded as an attempt with exit 0, and the same inputs give the same bytes.
  - _Requirements: 10.3, 10.4, 10.6, 10.7, 10.8, 10.9, 15.8_
- [x] 6.9 Create `apps/exorcist-npm/src/exorcise/cli.ts`: `main()` as the only reader of `process.argv`, wiring the node source file system, the node report file system, `RECIPES`, `loadOracle`, `loadCandidate`, `createUsageSurface`, the repository root (the `demo` directory is resolved relative to this file, like `api/config.ts`), printing to stdout/stderr and setting the exit code; runs only as the process entry point and when `VITEST` is unset.
  - _Requirements: 10.1, 10.9, 10.10_
- [x] 6.10 Verify by hand, offline and inside this repository: run `npm run exorcise -w @graveyard-kit/exorcist-npm -- --repo src/exorcise/__fixtures__/trees/declared-only --package node-abort-controller --label example/declared-only --out <temp dir>/proofs/declared-only/node-abort-controller.json` with a temporary output directory (outside the repository), read the file, run `parseProofReport` on it through a one-line `vite-node` script, then delete the temporary directory and the script. Record the outcome in the task notes.
  - _Requirements: 10.1, 10.7, 15.8_
- [x] 6.11 Create `apps/exorcist-npm/src/exorcise/sabotage.test.ts`: run Properties 1, 4, 6 and 11 against their Sabotage_Lists with the fixed seed, fail with `Sabotage "<name>" stayed green for "<property>"`, assert the lists are non-empty, the required names exist, and the real implementations pass under the same seed.
  - _Requirements: 18.2, 18.3, 18.4, 18.5_
- [x] 6.12 Checkpoint after Phase 6 - Ensure all tests pass, ask the user if questions arise.

### Phase 7: Proof view model and ProofState (skeleton/graveyard)

- [x] 7.1 Create `skeleton/src/graveyard/proof-view.ts`: `ProofBadge`, `AttemptView`, `ProofView`, `MAX_CALL_SITES_SHOWN` (50), the label and recommendation constants, and `buildProofView(report)` per Requirement 12 (pure, total, no markup, no mutation).
  - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_
- [x] 7.2 Write `proof-view.test.ts` examples: a proved report, a weak report, a counterexample report with the strings unchanged, a no-call-sites report with each recommendation, an error report, 51 call sites (cap and `moreCount`), the exact sabotage lines.
  - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6_
- [x] 7.3 Write the Property 10 test in `proof-view.p10.test.ts` (exporting `build(impl)`) over the Property 9 report arbitrary, deep-frozen before the call.
  - **Property 10: Proof_View faithfulness**
  - **Validates: Requirements 12.2 to 12.7**
- [x] 7.4 Create the Sabotage_List `skeleton/src/graveyard/test-support/sabotage/proof-p10.ts` (show `proved` for a weak attempt; headline from the first attempt; survivors counted as caught; call sites sorted; HTML-escaped strings; trimmed counterexample input; ignore the cap; mutate the input report).
  - _Requirements: 18.2_
- [x] 7.5 Edit `skeleton/src/graveyard/proof-slot.ts`: `ProofState` becomes `coming_soon | loading | report`, remove `ProofLeg`, `Counterexample`, `SabotageResult` and the old variants after a `grep` shows their only users are `proof-slot.test.ts` and `apps/exorcist-web/src/views/proof-slot.ts`; keep `proofSlotFor` unchanged.
  - _Requirements: 12.1, 12.8_
- [x] 7.6 Edit `skeleton/src/graveyard/proof-slot.test.ts` for the three states (exhaustive switch kept) and add `proofSlotFor` unchanged-behavior checks; export `buildProofView` and its types from `skeleton/src/graveyard/index.ts`.
  - _Requirements: 12.1, 12.8_
- [x] 7.7 Extend `skeleton/src/proof/sabotage.test.ts` with Property 10 and its list.
  - _Requirements: 18.2, 18.3_
- [x] 7.8 Checkpoint after Phase 7 - Ensure all tests pass, ask the user if questions arise.

### Phase 8: The page (apps/exorcist-web)

- [x] 8.1 Edit `apps/exorcist-web/src/constants.ts`: add the proof copy (badge labels are taken from `buildProofView`; add the loading line, the unreadable-report line and the heading of the three counterexample blocks), keeping `COPY.exorcismComing`.
  - _Requirements: 14.1, 14.3_
- [x] 8.2 Edit `apps/exorcist-web/vite.config.ts`: add `PROOF_NAME_PATTERN` (same source as the skeleton), `isProofName`, `proofNamesFromPath`, and the plugin `demoProofs()` (middleware serving or 404 for guarded names and `next()` otherwise; `generateBundle` emitting `demo/proofs/<repo>/<package>.json` for guarded pairs only), registered after `demoSnapshots()`.
  - _Requirements: 13.4, 13.5, 13.6_
- [x] 8.3 Extend `vite-config.test.ts`: the pattern equals the skeleton's, `proofNamesFromPath` accepts and rejects the listed forms (`..`, `a/b`, upper case, empty, 65 characters, extra segments), the plugin exposes both hooks, `demo/proofs/candidates/...` is never served or emitted, and the existing demo tests still pass.
  - _Requirements: 13.4, 13.5, 13.6_
- [x] 8.4 Edit `apps/exorcist-web/src/api/client.ts`: add `getProof(demo, pkg, signal)` and the `ProofLoad` type using the existing private `request` helper, the name guard, `parseProofReport` from `@graveyard-kit/skeleton/proof`, and the `absent`/`invalid`/`failed` mapping of Requirement 13.2.
  - _Requirements: 13.1, 13.2, 13.7_
- [x] 8.5 Extend `api/client.test.ts` with the fake fetch: a valid report, 404 is `absent`, an HTML body with status 200 is `absent`, valid JSON that fails `parseProofReport` is `invalid`, a network error and a timeout are `failed`, an invalid name makes no request, the URL is exactly `/demo/proofs/<demo>/<pkg>.json`, cancellation is propagated.
  - _Requirements: 13.1, 13.2_
- [x] 8.6 Create `apps/exorcist-web/src/test-support/build-proof-report.ts`: small builders for proved, weak, counterexample, no-call-sites and error reports (real `serializeProofReport`), with an option for a hostile string in every free-text field and for N call sites.
  - _Requirements: 17.2_
- [x] 8.7 Rewrite `apps/exorcist-web/src/views/proof-slot.ts`: exhaustive switch over `coming_soon` (the current placeholder), `loading` and `report` (badge text, runs and seed, sabotage line, recommendation, call-site `details` list with the `and <n> more` line, attempt list, three labelled `pre` blocks for a counterexample), all text through `h()`, no links.
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.7, 14.8_
- [x] 8.8 Edit `apps/exorcist-web/src/views/detail.ts`: `open(grave, { proof })` renders the given `ProofState`, and add `updateProof(key, state)` that replaces only the children of the open panel's `section.proof` when the open grave has that key, without moving focus or scroll.
  - _Requirements: 14.5_
- [x] 8.9 Edit `apps/exorcist-web/src/app/controller.ts`: on opening a dead or dying package from a demo source, start (once per demo and package) `api.getProof`, pass `loading` to `detail.open`, call `detail.updateProof` when it settles, show `coming_soon` for live scans, invalid names and graves without a slot, and abort pending proof requests on a route change.
  - _Requirements: 13.3, 14.1_
- [x] 8.10 Edit `apps/exorcist-web/src/styles/detail.css` and the `ClassName` type: add the proof classes (`proof-badge` and one modifier per badge, `proof-sites`, `proof-attempts`, `proof-pre`), using existing tokens only; the badge has a text label and a border so that colour is not the only signal.
  - _Requirements: 14.6, 14.7_
- [x] 8.11 Update `apps/exorcist-web/src/proof.dom.test.ts`: the existing "Exorcism coming" expectations stay true when no report exists; add DOM tests for each of the five badges with fixtures built by 8.6, the attempt history order, the counterexample blocks (shrunk input, old output, new output), the sabotage line text, the recommendation, 51 call sites showing 50 and `and 1 more`.
  - _Requirements: 14.2, 14.3, 14.7, 14.8_
- [x] 8.12 Write `apps/exorcist-web/src/proof.hostile.dom.test.ts`: every free-text field containing `<img src=x onerror=alert(1)>`, `javascript:alert(1)` and `&lt;b&gt;` renders as text, no element other than those the view creates exists, no `a` element is created from a report string, no `innerHTML` assignment (static check on `views/proof-slot.ts`).
  - _Requirements: 14.4_
- [x] 8.13 Write `apps/exorcist-web/src/proof.update.dom.test.ts`: the panel opens with the loading line, the proof arrives later, only the Proof_Section content changes, focus stays where it was, the panel stays open, `absent` and `failed` fall back to "Exorcism coming", `invalid` adds the muted unreadable line, a proof for another package that arrives late is ignored.
  - _Requirements: 14.1, 14.5_
- [x] 8.14 Write `apps/exorcist-web/src/proof.controller.dom.test.ts` with the fake fetch: one proof request per opened dead or dying package and none for alive or ailing, none for a live scan, none for a scoped name, a second open of the same package makes no new request, a route change aborts a pending request.
  - _Requirements: 13.1, 13.3_
- [x] 8.15 Run the existing guards that the new markup and CSS must satisfy (`dom/class-vocabulary.test.ts`, `polish.css.test.ts` with S1 to S7, `theme/theme.test.ts` contrast, `safety.test.ts`, `detail.dom.test.ts`, `keyboard.dom.test.ts`) and fix the new code until they pass; do not weaken a guard.
  - _Requirements: 14.6, 17.6_
- [x] 8.16 Checkpoint after Phase 8 - Ensure all tests pass, ask the user if questions arise.

### Phase 9: Integration, smoke tests and documentation

- [x] 9.1 Write static smoke tests in `apps/exorcist-npm/src/exorcise/smoke.test.ts`: `skeleton/src/proof/index.ts` does not reach `fast-check` or any `runner/` file through its import graph, `skeleton` imports nothing under `apps/`, no test file contains the string `lastrites-work`, `intersect`, `deep-diff` and `typescript` are exact in `apps/exorcist-npm/package.json`, `fast-check` is a skeleton dependency, no `package.json` declares an LLM client, `process.argv` and `process.env` are read only in `cli.ts`, `exorcise` is an npm script, `scan` exports are unchanged.
  - _Requirements: 10.10, 11.1, 11.2, 11.3, 11.4, 11.6, 17.1_
- [x] 9.2 Write `apps/exorcist-npm/src/exorcise/demo-proofs.test.ts`: parse every committed `demo/proofs/*/*.json` with `parseProofReport` and assert only the invariants of Requirement 9 and that `repo`-directory and `package` file names are Proof_Names matching the report's `package`; the test passes when the directory has no report; no hero outcome is asserted.
  - _Requirements: 16.7_
- [x] 9.3 Run `npm run typecheck` and `npm test`; fix strict-mode errors; confirm every property runs with `numRuns` 100, the fixed seed applies when `CI` is set, `FC_SEED` replays, every Sabotage_List entry fails its property, and the suite is green with `CI=1` and without.
  - _Requirements: 17.6, 18.1, 18.2, 18.3, 18.4_
- [ ] 9.4 Append a dated entry to `docs/kiro-log.md` for the build of the harness (tasks 1 to 9): the eleven properties (six from the brief plus seven to eleven), sabotage results and any shrunk counterexamples surfaced during development, the added dependencies and versions, the decisions worth recording (two entry points for proof code, the added `return-defined` Mutator, `orderSensitive`, unsupported call shapes are errors, lazy proof loading), and the test counts.
  - _Requirements: 16.5_
- [ ] 9.5 Final checkpoint for the build - Ensure all tests pass, ask the user if questions arise.

### Phase 10: Real run against the parse-server checkout (manual, outside `npm test`)

- [ ] 10.1 Preflight, read only: confirm `../lastrites-work/parse-server` exists and that `git -C ../lastrites-work/parse-server rev-parse --short HEAD` prints `3402ee6`; confirm `git -C ../lastrites-work/parse-server status --short` is empty. Stop and ask if either differs. Do not install, build or test in that checkout.
  - _Requirements: 16.6_
- [ ] 10.2 Write the first `intersect` Candidate, the naive native `Set` version, at `demo/proofs/candidates/parse-server/intersect.attempt1.js`: a default export function that takes the array of lists, returns the de-duplicated intersection in first-list order built from `Set`s, with a `big` member that is the same function. Written fresh in this repository, with a header comment saying it is the naive attempt.
  - _Requirements: 15.6, 15.7, 16.2_
- [ ] 10.3 Run `npm run exorcise -w @graveyard-kit/exorcist-npm -- --repo ../../../lastrites-work/parse-server --package intersect --candidate ../../demo/proofs/candidates/parse-server/intersect.attempt1.js --runs 1000 --label parse-community/parse-server --commit 3402ee6 --out ../../demo/proofs/parse-server/intersect.json` (npm runs workspace scripts with `apps/exorcist-npm` as the working directory, so the target checkout, a sibling of this repository, is three levels up; check the resolved path with `ls` first). Read the printed summary and the file. Record the call-site counts, the status, the seed, the shrunk counterexample if any, and the sabotage line in the task notes. Whatever the status is, it is the result.
  - _Requirements: 16.1, 16.2_
- [ ] 10.4 Only if attempt 1 is a `counterexample`: write the corrected Candidate `demo/proofs/candidates/parse-server/intersect.attempt2.js` that matches the behavior shown by the shrunk counterexample (result follows the order and duplicates of the last list, membership decided by `Set`s of the earlier lists, empty outer list gives an empty list), then run the same command with `--candidate` set to it, which appends attempt 2. If attempt 1 is `proved`, do nothing here and record "attempt 1 proved, no second candidate" in the task notes. If attempt 2 is also not proved, record it, do not weaken anything, and ask the user.
  - _Requirements: 16.2, 16.3_
- [ ] 10.5 Write the `deep-diff` Candidate at `demo/proofs/candidates/parse-server/deep-diff.attempt1.js`: a default export that returns `undefined` when `util.isDeepStrictEqual(a, b)` and otherwise a non-empty array describing that they differ (a single object is enough; only the `undefined` projection is consumed). Written fresh in this repository.
  - _Requirements: 15.6, 16.4_
- [ ] 10.6 Run the CLI for `deep-diff` with `--candidate ../../demo/proofs/candidates/parse-server/deep-diff.attempt1.js --runs 1000`, the same label and commit, and `--out ../../demo/proofs/parse-server/deep-diff.json`. Record the number of call sites (expected 23, `test`), how many are consumed as undefined checks, the status, the seed, the sabotage line, and any `unsupported_call_shapes` message.
  - _Requirements: 16.1, 16.4_
- [ ] 10.7 Only if `deep-diff` is a `counterexample`: record the shrunk pair as it is, decide with the user whether a corrected Candidate (an adapter shim, `migration-rules.md` rule 6) is warranted, and run it as attempt 2. If it is an `error` (for example `unsupported_call_shapes` because a site is not consumed as an undefined check), record the message and the listed sites; do not change the arbitrary, the Projection or `accepts` to get a pass. If it is `proved`, record whether it is weak and which mutants survived.
  - _Requirements: 16.4_
- [ ] 10.8 Run the CLI for `node-abort-controller` with no `--candidate`, `--runs 1000`, the same label and commit, and `--out ../../demo/proofs/parse-server/node-abort-controller.json`. Expect status `no-call-sites` with the recommendation `remove-dependency`; record what the run actually printed, including the import-site count.
  - _Requirements: 15.8, 16.1_
- [ ] 10.9 Verify the three written reports: run `parseProofReport` over each (the `demo-proofs.test.ts` of 9.2 now has real files to parse), confirm each file has no absolute path and no timestamp, and re-run the CLI for `node-abort-controller` into a temporary `--out` to confirm the bytes are identical to the committed file (determinism).
  - _Requirements: 9.4, 16.7_
- [ ] 10.10 Manual browser check of the Proof_Section, if a browser is available (as in the graveyard-ui-polish check): build `apps/exorcist-web`, serve `dist` from loopback, open the parse-server demo and the `intersect`, `deep-diff` panels, and read the screenshots for badge, runs and seed, call sites, attempt history and the sabotage line. If no browser is available, record "NOT RUN" with the reason. Do not claim a visual result that was not seen.
  - _Requirements: 14.2, 14.3, 14.7_
- [ ] 10.11 Append a dated entry to `docs/kiro-log.md` for the real run: for each package, the exact command, the call-site counts by `enclosing`, the status of every attempt in order, the seed, the shrunk counterexample if any, the sabotage line, which mutants survived, whether the outcome matched what the spec expected, and the result of the browser check (or NOT RUN). Record the outcomes exactly as they came out, including a proved attempt 1 or an unexpected counterexample.
  - _Requirements: 16.5_
- [ ] 10.12 Final checkpoint - Run `npm run typecheck` and `npm test` once more with the three reports committed to the working tree (no commit is made by this plan), confirm nothing under `../lastrites-work/parse-server` changed (`git status --short` there is still empty), and ask the user if questions arise.
  - _Requirements: 16.6, 17.6_

## Task Dependency Graph

Phases are sequential; each wave is one phase. Within a wave, tasks are mostly independent, except that a test task follows the file it tests and a Sabotage_List follows its property test.

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.12", "2.13", "2.14"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "3.11", "3.12", "3.13", "3.14", "3.15", "3.16", "3.17", "3.18", "3.19", "3.20", "3.21", "3.22", "3.23", "3.24", "3.25"] },
    { "id": 3, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10", "4.11", "4.12", "4.13", "4.14", "4.15", "4.16", "4.17", "4.18", "4.19", "4.20"] },
    { "id": 4, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "5.10", "5.11", "5.12", "5.13", "5.14", "5.15", "5.16"] },
    { "id": 5, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9", "6.10", "6.11", "6.12"] },
    { "id": 6, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "7.8"] },
    { "id": 7, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9", "8.10", "8.11", "8.12", "8.13", "8.14", "8.15", "8.16"] },
    { "id": 8, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5"] },
    { "id": 9, "tasks": ["10.1", "10.2", "10.3", "10.4", "10.5", "10.6", "10.7", "10.8", "10.9", "10.10", "10.11", "10.12"] }
  ]
}
```

## Notes

- The brief asked for six properties; the design adds Properties 7 to 11 (sabotage accounting, outcome equivalence, report codec, view faithfulness, names and CLI arguments) because the tech steering asks for at least one property on every pure module. Requirement 18.1 says so.
- Per `proof-rules.md`, every numbered property has a Sabotage_List in `test-support/sabotage/proof-pN.ts`, and the two central sabotage tests (3.24 with 7.7, and 6.11) run all of them. Each property test file exports a `build(...)` function so the central test can swap in a wrong implementation.
- Property 6 compares the real usage surface with a model built by the generator itself, so no second TypeScript parser is written.
- Task 1.2 is the only task that needs the network, and it runs once as a developer action. No test touches the network or any path outside this repository (Requirement 17.1). Phase 10 reads `../lastrites-work/parse-server` by hand, read only, and is never part of `npm test`.
- Phase 10 commits nothing. The generated `demo/proofs/**` files and the candidates stay in the working tree for the user to review; commits reference spec task numbers (for example, `proof-harness 3.13: ...`) per the structure steering file.
- The tasks in Phase 10 whose next step depends on a result (10.4, 10.7) are conditional on what the run prints. The plan fixes the rule, not the outcome: record what happened, never weaken the proof to get a green result.
- The visual check of the Proof_Section (10.10) needs a browser; jsdom cannot show layout. If none is available the log says NOT RUN.
- Test sub-tasks are not marked optional, matching the earlier plans: the product principle is proof over claims.
