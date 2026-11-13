# Implementation Plan: exorcist-actions

## Overview

This plan builds the second app per the exorcist-actions design: TypeScript (strict, ESM), Vitest + fast-check, zero network in tests. It adds `apps/exorcist-actions` (inventory of workflow `uses:`, evidence, a curated replacement map, two surgical rewrites, a pin proof and a swap contract proof with five Mutants, a scan CLI and an exorcise CLI), makes five small default-preserving changes to `apps/exorcist-npm`, writes thirteen correctness properties with Sabotage_Lists, and ends with one recorded live run that produces the fixtures, the demo snapshot and the two hero proof reports for `railwayapp/nixpacks`.

The plan stays thin: 64 tasks (the cap is 70). Scope is this app only: no change to scoring, the graveyard, the proof harness, the MCP server, the power or the web app (Requirement 18). Phases are sequential; within a phase, a test task follows the file it tests and a Sabotage_List follows its property test. Do not write more than a task asks. Nothing is committed by this plan.

Network: task 2.1 (installing `yaml`, the only dependency this app adds) and task 8.2 (the Recorder run, the only task that makes requests to GitHub, raw.githubusercontent.com and OSV) are the only tasks that touch the network, and both say so. Everything else, including every test, is offline.

Terminology: a *Mutant* belongs to the proof of this app (five of them, Requirement 14.1); a *Sabotage_List* is the test-suite list of deliberately wrong implementations that a property must catch (`proof-rules.md`).

## Tasks

### Phase 1: The package and the permitted changes to exorcist-npm

- [ ] 1.1 Create `apps/exorcist-actions/package.json` (`@graveyard-kit/exorcist-actions`, private, `type` module, `exports` `"."` to `./src/index.ts`, scripts `typecheck`, `scan`, `exorcise`, `record-fixtures` using `vite-node src/... --`; dependencies `@graveyard-kit/skeleton` and `@graveyard-kit/exorcist-npm` as `*`; dev dependencies with the exact versions the lockfile resolves for `exorcist-npm`: check with `npm ls fast-check vitest typescript @types/node`), `apps/exorcist-actions/tsconfig.json` (copy the shape of `apps/exorcist-npm/tsconfig.json`) and a stub `src/index.ts` containing `export {};`. The scripts may point at files that later tasks create. Run `npm install` offline (no new package), then `npm run typecheck -w @graveyard-kit/exorcist-actions`; confirm the root `package.json` and `vitest.config.ts` are unchanged.
  - _Requirements: 1.1, 1.2, 1.3, 1.8_
- [ ] 1.2 Edit `apps/exorcist-npm/src/scan/types.ts` and `scan/report.ts`: `ScanReport` gains `ecosystem?: "npm" | "github-actions"`; `serializeReport` writes the key right after `ref` only for `"github-actions"`; `parseReport` reads the key when present and accepts only `"github-actions"` (a value `"npm"` or any other fails: `wrong_type` for an unknown value, `not_canonical` for `"npm"` through the existing round-trip check). Nothing else in the file changes.
  - _Requirements: 1.5, 8.5_
- [ ] 1.3 Extend `apps/exorcist-npm/src/scan/report.test.ts` (or the existing report test file; add a new file if there is none): a `github-actions` report round-trips and the key follows `ref`; `"ecosystem":"npm"` and `"ecosystem":"x"` are rejected; for every `demo/*.json` that is a Scan_Report, `serializeReport(parseReport(text).report) === text` (existing files unchanged).
  - _Requirements: 1.5, 8.5_
- [ ] 1.4 Edit `apps/exorcist-npm/src/evidence/osv-count.ts` and `evidence/sources/osv.ts`: `countOpenVulnsNoFix(vulns, name, ecosystem = "npm")` compares the affected package ecosystem with the parameter; `osvRequestBody(name, version, pageToken?, ecosystem = "npm")` accepts `version: string | undefined` (key omitted when undefined, key order unchanged otherwise); `fetchOsv(ctx, name, version, ecosystem = "npm")` passes them through. No default call changes.
  - _Requirements: 1.5, 6.1_
- [ ] 1.5 Extend the OSV tests in `apps/exorcist-npm/src/evidence/sources/sources.test.ts` (and keep `osv-count.p8.test.ts` unchanged): the body for an npm call is byte-identical to the body the existing fixtures match; a `GitHub Actions` body without a version is `{"package":{"name":"o/r","ecosystem":"GitHub Actions"}}` (plus `page_token` when given); an advisory with a `fixed` event under ecosystem `GitHub Actions` is not counted and one without is, and the same advisory under another ecosystem is ignored.
  - _Requirements: 1.5, 6.1_
- [ ] 1.6 Edit `apps/exorcist-npm/src/evidence/sources/github.ts`: extract the local `get` closure of `fetchGithub` into an exported `createGithubGet(ctx: SourceContext): { get(url: string): Promise<FetchJsonResult>; warnings: string[] }` with the same token and 401-retry behavior, and make `fetchGithub` use it; export `reasonMessage` from `evidence/assemble.ts` (change `function` to `export function`, nothing else). Add one example test for `createGithubGet`: the token goes only to `api.github.com`, a 401 retries once without it and records the warning once. The existing github tests stay unchanged and green.
  - _Requirements: 1.5, 4.5_
- [ ] 1.7 Edit `apps/exorcist-npm/src/programmatic.ts`: add re-exports (no logic) of `fetchJson`, `classifyStatus`, `monthsSince`, `parseIsoTimestamp`, `countOpenVulnsNoFix`, `fetchOsv`, `OSV_QUERY_URL`, `osvListUrl`, `osvRequestBody`, `fetchGithub`, `createGithubGet`, `repoPageUrl`, `reasonMessage`, `isRecord`, `ok`, `fail`. Edit `programmatic-testing.ts`: add re-exports of `loadFixtureCase`, `FixtureEntry`, `UnmatchedFixtureRequest`. Update the pinned export list in `apps/exorcist-npm/src/programmatic.test.ts` and keep its "no function body" check green.
  - _Requirements: 1.4, 1.5_
- [ ] 1.8 Checkpoint after Phase 1 - Run `npm run typecheck` and `npm test -- apps/exorcist-npm`; confirm every pre-existing test file is unchanged except the ones named above and that all are green. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 1.5_

### Phase 2: Inventory and the Uses_String grammar

- [ ] 2.1 NETWORK (dependency install only; no request to GitHub, OSV or any data source): run `npm install --save-exact yaml -w @graveyard-kit/exorcist-actions` (resolves the current exact version; it updates `package-lock.json`). Confirm `package.json` lists an exact version without `^`, `npm ls yaml` shows one copy, and note the version in `docs/kiro-log.md` (task 9.3). Throw-away check: a script that calls `parseDocument(text, { lineCounter })` on a one-line `uses:` and prints `range` and `linePos`; delete the script afterwards.
  - _Requirements: 1.3_
- [ ] 2.2 Create `src/inventory/types.ts` (the types of the design) and `src/inventory/uses.ts` (`parseUses`, `formatUses`, `isSha`), pure and total, per Requirements 3.1 to 3.4.
  - _Requirements: 2.5, 3.1, 3.2, 3.3, 3.4_
- [ ] 2.3 Create `src/evidence/urls.ts`: one builder per request of the design (`releasesLatestUrl`, `tagsUrl`, `commitUrl`, `rawManifestUrl(name, ref, path, file)`, `manifestPageUrl`, `repoPageUrl` re-used, `releasesPageUrl`, `tagsPageUrl`), each taking an already validated owner, repo, path and ref and applying `encodeURIComponent` per segment.
  - _Requirements: 3.7, 4.3, 4.6, 5.1, 5.3_
- [ ] 2.4 Create `src/test-support/fc-runner.ts` (seed policy of the npm `fc-runner.ts`: fixed seed from an environment-free constant, 20261113, printed on failure; `numRuns` 100), the uses-string arbitrary and `src/inventory/uses.p2.test.ts` for Property 2 (including the URL builders of 2.3), exporting `build(impl)`. Add the Sabotage_List `src/test-support/sabotage/actions-p2.ts` with (a) to (g).
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 17.1, 17.2_
- [ ] 2.5 Create `src/test-support/arbitraries/workflow.ts`: arbitraries that build a workflow file text together with the model list of expected `ActionUse` and `SkippedUse` (shapes listed in the design's "Correctness Properties" introduction), a multi-file tree arbitrary, and `expectedOutputRefs`.
  - _Requirements: 17.4_
- [ ] 2.6 Create `src/inventory/inventory.ts` with the pure `inventoryText(file, text)` (YAML via `parseDocument` and `LineCounter`, jobs and steps, Source_Offset check, `stepId`, `withKeys`, `withLine`, `outputRefs`, skipped uses, sorting) and `src/inventory/output-refs.ts`; then `inventoryWorkflows(fs, root)` (listing, `.yml|.yaml` filter, 1 MiB cap, warnings, `no .github/workflows directory`). Add `src/inventory/index.ts`.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.3, 3.4, 3.5, 3.6_
- [ ] 2.7 Write `src/inventory/inventory.p1.test.ts` for Property 1 over `inventoryText` and `inventoryWorkflows` (in-memory `SourceFs`, shuffled listing), exporting `build(impl)`, and the Sabotage_List `actions-p1.ts` with (a) to (i).
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.3, 3.5, 3.6, 17.1, 17.2_
- [ ] 2.8 Write example tests `src/inventory/inventory.test.ts` over small hand-written files in `src/inventory/__fixtures__/`: quoted values, CRLF, no final newline, flow-style step, anchor and alias, block scalar, escaped quoted scalar, `docker://`, `./`, no `@ref`, `${{ }}`, a reusable-workflow `uses`, a symlink entry ignored, an unreadable directory, a 2 MiB file, two documents in one file, a `uses` under `with:`.
  - _Requirements: 2.1, 2.2, 2.7, 3.3, 3.4, 3.5_
- [ ] 2.9 Copy the seven files of `../lastrites-work/nixpacks/.github/workflows/` (at `144b4f9`, read locally, no request) to `src/__fixtures__/nixpacks/repo/.github/workflows/` byte for byte, and write `src/inventory/nixpacks.test.ts`: six `actions-rs/toolchain` and seven `actions-rs/cargo` uses, every other Action_Name count equal to a line-based counter written in the test, `ci.yml` positions of the first toolchain use (line and column from the file), and no skipped uses.
  - _Requirements: 16.4_
- [ ] 2.10 Checkpoint after Phase 2 - Run `npm run typecheck` and `npm test -- apps/exorcist-actions`; ensure all tests pass, ask the user if questions arise.
  - _Requirements: 17.1_

### Phase 3: The Replacement_Map and the rewrites

- [ ] 3.1 Create `src/replacements.ts`: the types, `REPLACEMENTS` with the four seed entries (`from`, `kind`, `to` and `toRef` or `command`, `sourceUrl`, `replacementUrl`, and `inputs: {}` for the two kinds that have inputs; `toRef` provisional until 8.3), and `findReplacement` (case-insensitive, total). Add a comment above `inputs` saying 8.3 fills them from the recorded manifests.
  - _Requirements: 7.1, 7.2, 7.3, 7.5_
- [ ] 3.2 Create `src/rewrite/lines.ts` (`lineOf`, `tailOk`) and `src/rewrite/pin.ts` (`pinUse`, `pinAll`) per the design; add `src/rewrite/index.ts`.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
- [ ] 3.3 Write `src/rewrite/pin.p3.test.ts` for Property 3 over the workflow arbitrary (re-inventory of the result included), exporting `build(impl)`, and the Sabotage_List `actions-p3.ts` with (a) to (h).
  - _Requirements: 10.1, 10.2, 10.6, 17.1, 17.2_
- [ ] 3.4 Write `src/rewrite/pin.p4.test.ts` for Property 4 (idempotence, refusals, `pinAll`), exporting `build(impl)`, and the Sabotage_List `actions-p4.ts` with (a) to (f). Add examples for each refusal reason on small hand-written text.
  - _Requirements: 10.1, 10.3, 10.4, 10.5, 17.1, 17.2_
- [ ] 3.5 Create `src/rewrite/swap.ts` (`swapUse`) per the design: refusals first, then one edit list applied from the last offset to the first; export it from `src/rewrite/index.ts`.
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
- [ ] 3.6 Create `src/test-support/arbitraries/replacement.ts` (generated `ActionReplacement` with renamed, kept and dropped entries, and a matching `with` map generator) and write `src/rewrite/swap.p5.test.ts` for Property 5 (including `findReplacement`), exporting `build(impl)`, and the Sabotage_List `actions-p5.ts` with (a) to (i). Add examples with the `actions-rs/toolchain` shape of the nixpacks `ci.yml` (`profile`, `toolchain`, `override` lines) against a test-local replacement.
  - _Requirements: 7.1, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 17.1, 17.2_
- [ ] 3.7 Checkpoint after Phase 3 - Run `npm run typecheck` and `npm test -- apps/exorcist-actions`; ensure all tests pass, ask the user if questions arise.
  - _Requirements: 17.1_

### Phase 4: Evidence

- [ ] 4.1 Create `src/evidence/manifest.ts`: `parseActionManifest` and `runtimeSignal` per Requirements 5.2 and 5.6 and the design (`required` for `true` or `"true"`, `hasDefault` for a non-null `default`).
  - _Requirements: 5.2, 5.4, 5.6_
- [ ] 4.2 Create `src/test-support/arbitraries/manifest.ts` and write `src/evidence/manifest.p6.test.ts` for Property 6, exporting `build(impl)`, and the Sabotage_List `actions-p6.ts` with (a) to (g).
  - _Requirements: 5.2, 5.4, 5.6, 17.1, 17.2_
- [ ] 4.3 Create `src/evidence/sources.ts`: `fetchPublish` (release, tag fallback, `not_found`), `fetchManifest` (`action.yml` then `action.yaml` on 404, no token, uses `cache.get` directly with `classifyStatus`), `resolveCommit` (through `createGithubGet`, `sha` must be 40 hexadecimal characters) and `fetchActionsOsv` (a call of `fetchOsv` with ecosystem `GitHub Actions` and no version). All return `Outcome<T>` and never throw.
  - _Requirements: 4.3, 4.5, 5.1, 5.4, 6.1, 12.1_
- [ ] 4.4 Write `src/evidence/sources.test.ts` with tiny hand-written `FixtureEntry` lists and the fake clock and sleep: release found; release 404 then tag then commit date; no release and no tag; 403 rate limit; 401 with a token retried without it; malformed JSON; `action.yml` 404 then `action.yaml`; both 404; the token is never sent to `raw.githubusercontent.com`; `resolveCommit` rejects a 39-character sha; a temporary cache folder removed in `finally`.
  - _Requirements: 4.3, 4.5, 5.1, 5.4, 12.5_
- [ ] 4.5 Create `src/evidence/assemble.ts`: `assembleActionEvidence` (pure; structure of the npm `assembleResult`, shared `reasonMessage`, `SIGNAL_NAMES` iteration), including the Site `job` rule, the `maintainerCount` rule and the replacement info.
  - _Requirements: 4.4, 4.6, 5.3, 5.5, 6.2, 6.3, 6.4, 6.5, 6.7_
- [ ] 4.6 Write `src/evidence/assemble.p7.test.ts` for Property 7 (including the score check with `scoreDeath`), exporting `build(impl)`, and the Sabotage_List `actions-p7.ts` with (a) to (i).
  - _Requirements: 4.3, 4.4, 4.6, 5.3, 5.4, 5.5, 6.3, 6.4, 6.5, 6.7, 17.1, 17.2_
- [ ] 4.7 Create `src/evidence/stage.ts` (`createActionEvidenceStage`: one `CacheLayer` over a `ResilientClient`, `Promise.all` over the sources, last-resort catch giving the all-unknown result with the warning `evidence failed for {owner}/{repo}`) and `src/evidence/index.ts`; write `src/evidence/stage.test.ts` with `FakeHttp` fixtures: all sources succeed; each source fails in turn (only its signals unknown); a stage whose source throws; two calls with the same inputs give equal results; a Site `job` use makes no manifest request.
  - _Requirements: 4.1, 4.2, 4.5, 6.5, 6.6, 6.7_
- [ ] 4.8 Checkpoint after Phase 4 - Run `npm run typecheck` and `npm test -- apps/exorcist-actions`; ensure all tests pass, ask the user if questions arise.
  - _Requirements: 17.1_

### Phase 5: The scan and its CLI

- [ ] 5.1 Create `src/scan/report.ts`: `buildScanReport` (pure; per-Action_Name dependencies, `declaredRange`, skipped mapping and warnings, `assembleReport`, `ecosystem: "github-actions"`).
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_
- [ ] 5.2 Write `src/scan/report.p11.test.ts` for Property 11 (with `reportArb` from `@graveyard-kit/exorcist-npm/programmatic/testing` for the npm byte-identity check and a generated evidence arbitrary), exporting `build(impl)`, and the Sabotage_List `actions-p11.ts` with (a) to (h).
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7, 17.1, 17.2_
- [ ] 5.3 Create `src/scan/scan.ts` (`runScan`: one Clock reading, inventory, grouping, `Promise.all` over the Evidence_Stage, `scoreDeath`, `buildScanReport`; a rejecting stage becomes the all-unknown result) and `src/scan/index.ts`; write `src/scan/scan.test.ts` with a fake stage and an in-memory `SourceFs`: two uses of one repository with different refs give one dependency with `declaredRange` `v1, v2`; a repository with no uses gives a valid empty report; skipped uses appear; a rejecting stage keeps the other dependencies.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6, 8.7_
- [ ] 5.4 Create `src/scan/cli-args.ts` (`parseScanArgs`, pure and total, usage line) and `src/scan/cli.ts` (the entry: reads `process.argv` and `process.env`, builds `configFromEnv`, `createFetchClient`, the real clock and sleep, `createNodeSourceFs`, `createNodeReportFs`; writes through `ReportFs` or prints; exit codes 0, 1, 2); write `src/scan/cli-args.test.ts` with examples for each rejection and each default.
  - _Requirements: 1.7, 1.9, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
- [ ] 5.5 Checkpoint after Phase 5 - Run `npm run typecheck` and `npm test -- apps/exorcist-actions`; ensure all tests pass, ask the user if questions arise.
  - _Requirements: 17.1_

### Phase 6: The proofs

- [ ] 6.1 Create `src/proof/pin-check.ts`: `checkPin` written independently of `pinUse` (line table comparison, expected pinned line from the pieces, re-inventory, deterministic first violation).
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6_
- [ ] 6.2 Write `src/proof/pin-check.p8.test.ts` for Property 8 (real `pinAll` for the passing side, the tamper list for the failing side, the reference model), exporting `build(impl)`, and the Sabotage_List `actions-p8.ts` with (a) to (g).
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 17.1, 17.2_
- [ ] 6.3 Create `src/proof/contract-check.ts`: `checkContract` per the design, with the fixed violation order and the `dropped`, `renamed` and `required` lists.
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_
- [ ] 6.4 Write `src/proof/contract-check.p9.test.ts` for Property 9 with the reference implementation, exporting `build(impl)`, and the Sabotage_List `actions-p9.ts` with (a) to (h).
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 17.1, 17.2_
- [ ] 6.5 Create `src/proof/mutants.ts`: the five Mutants and `runSabotage`, producing the skeleton `SabotageSummary`.
  - _Requirements: 14.1, 14.2, 14.3_
- [ ] 6.6 Write `src/proof/mutants.p10.test.ts` for Property 10 (real checks on passing cases; a lax check for the survivor case), exporting `build(impl)`, and the Sabotage_List `actions-p10.ts` with (a) to (g).
  - _Requirements: 14.1, 14.2, 14.3, 17.1, 17.2_
- [ ] 6.7 Create `src/proof/names.ts` (`actionProofName`, `repoProofName`) and `src/proof/attempt.ts` (`buildPinAttempt`, `buildContractAttempt`, `callSitesOf`, `buildProofReport`) per the mapping tables of the design; add `src/proof/index.ts`.
  - _Requirements: 14.4, 14.5, 14.6, 14.7, 14.8, 12.5, 13.6_
- [ ] 6.8 Create `src/test-support/arbitraries/attempt.ts` and write `src/proof/attempt.p12.test.ts` for Property 12 (every outcome through `appendAttempt`, `serializeProofReport` and `parseProofReport`), exporting `build(impl)`, and the Sabotage_List `actions-p12.ts` with (a) to (h).
  - _Requirements: 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 17.1, 17.2_
- [ ] 6.9 Checkpoint after Phase 6 - Run `npm run typecheck` and `npm test -- apps/exorcist-actions`; ensure all tests pass, ask the user if questions arise.
  - _Requirements: 17.1_

### Phase 7: The exorcise command

- [ ] 7.1 Create `src/exorcise/cli-args.ts`: `parseExorciseArgs` (pure and total; `--fix` exactly `pin` or `swap`; `--out` checked with `isProofOutPath`; same flag rules as the scan parser; `--write` and `--fresh` are switches).
  - _Requirements: 15.1, 15.6_
- [ ] 7.2 Create `src/exorcise/run.ts`: `runExorcise` per Requirement 15 (selection, resolution or manifest fetch, rewrite, proof, sabotage, attempt, report append with the callSites check and `--fresh`, `--write` gate, printed diff and status), never rejecting, the only writes being `reports.writeAtomic`.
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8_
- [ ] 7.3 Create `src/exorcise/cli.ts` (the entry that wires `createNodeSourceFs`, `createNodeReportFs`, the cache stack and the evidence functions of 4.3 into `ExorciseDeps`, reads `process.argv` and `process.env`, sets the exit code) and `src/exorcise/index.ts`.
  - _Requirements: 1.9, 15.1, 15.8_
- [ ] 7.4 Write `src/exorcise/run.p13.test.ts` for Property 13 (both parsers over random `argv`; the write-confinement part over an in-memory file system and a recording `ReportFs`, with fake evidence functions that produce proved, counterexample, weak and error outcomes), exporting `build(impl)`, and the Sabotage_List `actions-p13.ts` with (a) to (h).
  - _Requirements: 9.2, 15.1, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 17.1, 17.2_
- [ ] 7.5 Write `src/exorcise/run.test.ts` examples: pin dry run prints `- old` / `+ new` and writes nothing; `--write` on a proved attempt writes the files and no other; `--write` on a counterexample prints `not written: counterexample` and exits 1; `no uses of`, `nothing to pin`, `no swap available` (the `run` entry) exits; a Rewrite_Refusal exits 1 with nothing written; `--out` appends attempt 2 to an existing report; a report with other call sites exits 1 and `--fresh` replaces it; a resolution failure is an `error` attempt with `recipe_failure`.
  - _Requirements: 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 12.5, 13.6_
- [ ] 7.6 Checkpoint after Phase 7 - Run `npm run typecheck` and `npm test -- apps/exorcist-actions`; ensure all tests pass, ask the user if questions arise.
  - _Requirements: 17.1_

### Phase 8: Recording, the demo snapshot and the hero proofs

- [ ] 8.1 Create `src/test-support/harness.ts` (builds `FakeHttp` from `src/__fixtures__/nixpacks/http/*.json` with `loadFixtureCase(caseName, root)`, a temporary cache folder, the fake clock and sleep, and the real `runScan` and `runExorcise` over them) and `src/test-support/record-fixtures.ts` (the Recorder: an `HttpClient` decorator that writes each exchange as a `FixtureEntry` without request headers and keeping only the response headers the npm recorder keeps; it runs the real `runScan` on `../lastrites-work/nixpacks` with `--label railwayapp/nixpacks --ref 144b4f9`, writes `demo/nixpacks-actions.json`, then runs the real `runExorcise` for `--fix swap --action actions-rs/toolchain` and `--fix pin --action actions/checkout` writing `demo/proofs/nixpacks-actions/<Action_Proof_Name>.json`, and fetches the `action.yml` of every Replacement `from` and `to` and the repository metadata of each; it reads `GITHUB_TOKEN` only to send it to `api.github.com` and never records it; it never writes into the clone, and runs `--write` only on a temporary copy that it removes). Fixtures not recorded yet make the replay tests fail, so write the tests of 8.4 to 8.6 after 8.2.
  - _Requirements: 16.1, 16.2, 16.3, 16.8_
- [ ] 8.2 NETWORK (the only task with requests to GitHub, raw.githubusercontent.com and OSV): run `npm run record-fixtures -w @graveyard-kit/exorcist-actions` once, with a GitHub token in the environment if the user supplied one (about 60 to 80 API calls; unauthenticated runs may hit the limit). Then check, without editing anything by hand: no fixture contains `rate_limited` or a 403 for a repository the report depends on (if one does, re-run after the limit resets and say so in the log), no fixture or demo file contains the token, `git status` shows only new files under `apps/exorcist-actions/src/__fixtures__/nixpacks/http/`, `demo/nixpacks-actions.json` and `demo/proofs/nixpacks-actions/`, and the clone's `git status` is clean. Record in `docs/kiro-log.md` (9.3) the date, token yes or no, the number of requests, and the status of each hero proof as it came out.
  - _Requirements: 16.2, 16.3, 16.5, 16.6, 16.8_
- [ ] 8.3 Write `src/__fixtures__/README.md` (how the fixtures were recorded, on what date, with or without a token, the tag-ordering note of the design's Risks) and fill the `inputs` and `toRef` of the seed entries in `src/replacements.ts` from the recorded manifests of 8.2 (`actions-rs/toolchain` with `override` and `profile` dropped as the old manifest declares them; the other entries per their manifests). Write `src/replacements.data.test.ts`: over the recorded fixtures every `from` is archived, every `to` exists, every old input name declared by the old manifest is mapped or dropped, every new input name is declared by the new manifest, every `sourceUrl` is `https://`. An entry that fails is removed from `REPLACEMENTS` (never adjusted to pass) and the removal is noted in the log; re-run the scan replay of 8.5 if an entry changes.
  - _Requirements: 7.2, 7.3, 7.4, 16.1_
- [ ] 8.4 Write `src/demo.test.ts`: `demo/nixpacks-actions.json` passes `parseReport` and is canonical, has `ecosystem` `github-actions`, `repo` `railwayapp/nixpacks`, `ref` `144b4f9`, is accepted by `buildGraveyard` from `@graveyard-kit/skeleton/graveyard`, lists `actions-rs/toolchain` and `actions-rs/cargo` with `repoArchived` known and true, and has a known source URL for every known signal.
  - _Requirements: 16.5, 8.4_
- [ ] 8.5 Write `src/replay.test.ts`: with the harness of 8.1 and a fake clock set to the `scannedAt` of the committed snapshot, `runScan` over the fixture workflow tree and the two exorcise runs produce texts equal byte for byte to `demo/nixpacks-actions.json` and the two files under `demo/proofs/nixpacks-actions/`.
  - _Requirements: 16.7_
- [ ] 8.6 Write `src/hero-proofs.test.ts`: both hero proof reports pass `parseProofReport` and are canonical, `package` equals the file name and `isProofName` holds for the folder and file names (the existing `exorcise/demo-proofs.test.ts` also covers them and must stay green), the swap report's coverage shows `dropped.override` and `dropped.profile` (or the keys the manifest dictates), the statuses are asserted to equal the committed ones (recorded as they came out), and a copy of the fixture workflow tree in a temporary folder is exorcised with `--write` through the real node `ReportFs` only when the committed attempt is `proved` and not `weak` (otherwise the test asserts nothing is written); other files are byte-identical; the temporary folder is removed in `finally`.
  - _Requirements: 14.5, 14.7, 15.5, 16.6, 16.8_
- [ ] 8.7 Checkpoint after Phase 8 - Run `npm run typecheck` and `npm test`; ensure all tests pass (including the existing `demo-proofs.test.ts` over the new proof folder), ask the user if questions arise.
  - _Requirements: 16.7, 17.1_

### Phase 9: Wrap-up

- [ ] 9.1 Write the central `src/sabotage.test.ts`: for each of the thirteen properties, run the real `build` with the seed 20261113 and assert it passes, then run every entry of its Sabotage_List and assert at least one assertion fails; print the survivor if one does not fail.
  - _Requirements: 17.1, 17.2_
- [ ] 9.2 Write `src/smoke.test.ts`: the pinned export list of the Programmatic_Entry covers every symbol this app imports from it (static scan of the app's imports); `skeleton` contains no import of `apps`, `mcp` or `power`; no dependency name of the app matches an LLM client list; `process.env`, `process.argv` and `process.exit` appear only in `scan/cli.ts`, `exorcise/cli.ts` and `test-support/record-fixtures.ts`; no file of the app imports `child_process` or `node:child_process`; no test file contains `lastrites-work`; the app's `src` has no write to `skeleton`.
  - _Requirements: 1.4, 1.6, 1.8, 1.9, 17.5, 17.6_
- [ ] 9.3 Read-only check of what `apps/exorcist-web` assumes about npm (package links, `npmjs.com` URLs, labels, the demo list `model/demo-repos.ts`, `ecosystem`), without editing it. Append a dated entry to `docs/kiro-log.md` with: the `yaml` version installed (2.1); the Recorder run (8.2): date, token yes or no, request count, anything rate-limited, the status of both hero proofs exactly as they came out (counterexample or weak included) and the sabotage lines; any seed entry removed in 8.3 and why; the five existing-code changes made in Phase 1; the follow-up list for the web app and the limits of the design (npm package links for action names, `kinds` and `declaredRange` meaning, `skipped` reason `other`, output references in other spellings, one tombstone per repository, tag ordering); and everything that differed from the spec.
  - _Requirements: 18.2, 18.4_
- [ ] 9.4 Final checkpoint - Run `npm run typecheck` and `npm test` once more; confirm `git status --short` shows only the intended new and changed files (this app, the five changes in `apps/exorcist-npm`, `demo/nixpacks-actions.json`, `demo/proofs/nixpacks-actions/`, `docs/kiro-log.md`, `package-lock.json`) and that no commit was made by this plan; confirm the plan has at most 70 tasks and the clone `../lastrites-work/nixpacks` is unchanged; ask the user if questions arise.
  - _Requirements: 17.1, 18.1, 18.5_

## Task Dependency Graph

Phases are sequential; each wave is one phase. Within a wave, a test task follows the file it tests and a Sabotage_List follows its property test.

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7"] },
    { "id": 3, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8"] },
    { "id": 4, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5"] },
    { "id": 5, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9"] },
    { "id": 6, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6"] },
    { "id": 7, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7"] },
    { "id": 8, "tasks": ["9.1", "9.2", "9.3", "9.4"] }
  ]
}
```

## Notes

- Thirteen properties are written, one per subject of the design; each has a Sabotage_List in `src/test-support/sabotage/actions-pN.ts`, and `src/sabotage.test.ts` (9.1) runs them all. Each property test file exports `build(impl)` so the central test can swap the implementation. The properties and their tasks: P1 2.7, P2 2.4, P3 3.3, P4 3.4, P5 3.6, P6 4.2, P7 4.6, P8 6.2, P9 6.4, P10 6.6, P11 5.2, P12 6.8, P13 7.4.
- Tasks 2.1 and 8.2 are the only tasks that need the network: the first installs one pinned package, the second is the Recorder run. No test makes a request; the existing no-network setup file covers this app's tests too.
- Task 8.2 may produce unknown signals (rate limits) or a hero proof that is a counterexample or weak. The plan does not adjust either: the result is committed as recorded and reported in the log (Design, Decision 14). If rate limiting makes the scan unusable, the task is re-run after the limit resets, not edited by hand.
- The seed entries of the Replacement_Map start with empty `inputs` (3.1), so a swap refuses with `unmapped_input` until 8.3 fills them from the recorded manifests; an entry that does not hold against the fixtures is removed.
- The clone `../lastrites-work/nixpacks` is only read (copying workflow files in 2.9, the scan in 8.2). Every `--write` check runs on a temporary copy that is removed afterwards.
- Commits in this repository, when the user makes them, reference spec task numbers (for example, `exorcist-actions 3.2: ...`) per the structure steering file.
- Test sub-tasks are not marked optional, matching the earlier plans: the product principle is proof over claims.
