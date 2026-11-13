# Implementation Plan: kiro-integration

## Overview

This plan builds the Kiro integration per the kiro-integration design: TypeScript (strict, ESM), Vitest + fast-check, zero network in tests. It adds the `/mcp` and `/power` workspaces, the stdio MCP server with five thin tools, the workspace MCP settings, four hooks and their scripts, two custom agents, the Kiro power, Config_Validators for every Kiro file it adds, thirteen correctness properties with Sabotage_Lists, and a final manual group that uses the result on `../lastrites-work/parse-server` and records the outcomes truthfully in `docs/kiro-log.md`.

Scope is integration only. No change to scoring, evidence, scanning behavior, proof logic, recipes or the web app (Requirement 19). Phases are sequential; within a phase, tasks are mostly independent. Do not write more than a task asks. Nothing is committed by this plan.

Order note: the pure pieces (validators, hook helpers) and the two hooks that need no server come first (Phases 2 and 3), so those hooks fire while the later phases are built. The scan and candidate hooks follow the tools (Phase 7).

Terminology: a *Mutator* belongs to the proof harness; a *Sabotage_List* is the test-suite list of deliberately wrong implementations that a property must catch (`proof-rules.md`).

## Tasks

### Phase 1: Workspaces, dependencies and the programmatic entry

- [x] 1.1 Edit the root `package.json`: `workspaces` becomes `["skeleton", "apps/*", "mcp", "power"]`. Change nothing else in it. (Done while writing this spec, as the request asked; `npm run typecheck` still passes with the two folders not yet created.)
  - _Requirements: 1.1_
- [x] 1.2 Create `mcp/package.json` (`@graveyard-kit/exorcist-mcp`, private, `type` module, dependencies `@graveyard-kit/skeleton` and `@graveyard-kit/exorcist-npm` as `*`, scripts `typecheck` (`tsc --noEmit`), `build`, `power:sync`, `hook:scan-deps`, `hook:monotonic`, `hook:stop-check`, `hook:candidate-proof` using `vite-node src/... --` style; the scripts may point at files that later tasks create), `mcp/tsconfig.json` (copy the shape of `skeleton/tsconfig.json`, extends `../tsconfig.base.json`), a stub `mcp/src/index.ts` containing `export {};`, and `power/package.json` (`@graveyard-kit/exorcist-power`, private, no dependencies, no scripts).
  - _Requirements: 1.2, 1.5_
- [x] 1.3 Run `npm install --save-exact @modelcontextprotocol/sdk@1.32.2 zod@4.6.7 intersect@1.0.1 deep-diff@1.0.2 -w @graveyard-kit/exorcist-mcp` and `npm install --save-dev --save-exact esbuild@0.28.2 -w @graveyard-kit/exorcist-mcp` (the only task that needs the network; it updates `package-lock.json`). Confirm `mcp/package.json` lists exact versions, `npm ls zod @modelcontextprotocol/sdk` shows one hoisted copy each, and that `intersect` and `deep-diff` are the same versions as in `apps/exorcist-npm`. Write a throwaway script that registers one tool with a zod 4 raw shape on `McpServer`, confirm it type-checks and starts, then delete the script.
  - _Requirements: 1.3_
- [x] 1.4 Edit `vitest.config.ts`: add `"mcp/src/**/*.test.ts"` to `include`, keeping every existing pattern and the `setupFiles` entry. Add the line `power/server/` to `.gitignore`.
  - _Requirements: 1.4, 1.9_
- [x] 1.5 Edit `apps/exorcist-npm/src/scan/api/handler.ts`: export `REPO_PATTERN` (change `const` to `export const`, nothing else). Run the scan API tests to confirm no change.
  - _Requirements: 3.2, 19.1_
- [x] 1.6 Edit `apps/exorcist-npm/src/exorcise/candidate.ts`: `loadCandidate(file, cacheBust?)`; when `cacheBust` is a non-empty string the import URL gets `?v=<cacheBust>`; when absent the behavior is byte-for-byte what it is now.
  - _Requirements: 8.8, 19.1_
- [x] 1.7 Extend `apps/exorcist-npm/src/exorcise/candidate.test.ts` with temporary files removed in `finally`: without `cacheBust` an edited file is not re-evaluated (documents the Node cache), with a different `cacheBust` it is, the returned `name` and `source` are unchanged by the bust.
  - _Requirements: 8.8_
- [x] 1.8 Create `apps/exorcist-npm/src/programmatic.ts`: re-exports only (no functions) of everything listed in the design, "The programmatic entry". Add the exports `"./programmatic": "./src/programmatic.ts"` and `"./programmatic/testing": "./src/programmatic-testing.ts"` to `apps/exorcist-npm/package.json`, keeping `./report`.
  - _Requirements: 1.6, 1.7_
- [x] 1.9 Create `apps/exorcist-npm/src/programmatic-testing.ts`: re-exports of `reportArb`, `FakeHttp`, the fake clock and sleep, `memoryFiles` and the in-memory `SourceFs` from the existing test support, nothing else.
  - _Requirements: 1.6_
- [x] 1.10 Write `apps/exorcist-npm/src/programmatic.test.ts`: the sorted export names of both entry files equal a pinned list; neither file contains a function body (static check on the source text); `scan/index.ts` and `evidence/index.ts` export lists are unchanged (the existing smoke tests keep passing).
  - _Requirements: 1.6, 1.7, 19.1_
- [x] 1.11 Run `npm install` (offline, no new packages), `npm run typecheck` and `npm test`; confirm green with the new workspaces.
  - _Requirements: 1.1, 1.4, 18.7_
- [x] 1.12 Checkpoint after Phase 1 - Ensure all tests pass, ask the user if questions arise.

### Phase 2: Kiro config validators and agent privilege (pure)

- [x] 2.1 Create `mcp/src/kiro-config/helpers.ts`: `Check = { ok: true } | { ok: false; error: { path: string; message: string } }`, `parseJson(text)`, `objectWith(value, path, { required, optional })` (rejects unknown keys), `stringField`, `boolField`, `arrayOf`, `isKebab`, `isSemver`. Pure, total.
  - _Requirements: 16.1, 16.2_
- [x] 2.2 Create `mcp/src/kiro-config/hook.ts`: `validateHookFile(text)` per the hook field list and trigger list of the design (compiling `matcher`, command/agent action rules, `version` v1, `timeout` number).
  - _Requirements: 16.1, 16.2, 12.7_
- [x] 2.3 Create `mcp/src/kiro-config/mcp-settings.ts`: `validateMcpSettings(text)` (`mcpServers` of `{ command, args?, env?, disabled?, autoApprove?, disabledTools? }`, `type` rejected).
  - _Requirements: 16.1, 11.3_
- [x] 2.4 Create `mcp/src/kiro-config/plugin.ts` (`validatePluginManifest`: `$schema`, kebab `name`, semver `version`, `description`, `author.name`, `keywords`, optional `homepage`/`repository`/`license`) and `power-mcp.ts` (`validatePowerMcp`: `$schema`, `mcpServers` with `type` `stdio`, `command`, `args`, `env`).
  - _Requirements: 16.1, 15.2, 15.3_
- [x] 2.5 Create `mcp/src/kiro-config/skill.ts`: `validateSkill(text, folderName)` (frontmatter of exactly `name` and `description`, `name` equal to the folder, non-empty body).
  - _Requirements: 16.1, 15.4_
- [x] 2.6 Create `mcp/src/kiro-config/agent.ts`: `validateAgentFile(text, ctx: { exists(path): boolean })` per the agent field list (rejects `allowedTools`, `toolsSettings`, `toolAliases`; `prompt` `file://` and `resources` `file://` targets must exist through `ctx.exists`; `permissions.rules` shape; every `mcpServers` entry has `command`).
  - _Requirements: 16.1, 14.8_
- [x] 2.7 Create `mcp/src/kiro-config/privilege.ts`: `writeCapabilities(agent)`, `pushCapabilities(agent)` and the small glob matcher they use, per the design.
  - _Requirements: 14.2, 14.4, 14.5, 14.7_
- [x] 2.8 Create `mcp/src/kiro-config/index.ts` re-exporting the validators and privilege functions.
  - _Requirements: 16.1_
- [x] 2.9 Create `mcp/src/test-support/arbitraries/kiro-files.ts`: arbitraries for valid hook files, agent files, MCP settings, plugin manifests, Power `mcp.json` and skills (as objects and as canonical text), and `injectFault(kind, value)` returning the faulted value with the expected failing path, for each fault listed in Property 8.
  - _Requirements: 16.2_
- [x] 2.10 Write `mcp/src/kiro-config/validators.test.ts` examples: for each validator one valid sample, and each documented fault with its exact `path` and message text; non-JSON text, empty text, arrays, `null` and huge nesting never throw; an agent using `allowedTools` is rejected.
  - _Requirements: 16.2_
- [x] 2.11 Write the Property 8 test in `mcp/src/kiro-config/validators.p8.test.ts` (exporting `build(impl)` over the six validators).
  - **Property 8: Config validators**
  - **Validates: Requirements 16.1, 16.2, 16.3, 11.3, 12.7, 15.2, 15.3, 15.4**
- [x] 2.12 Create the Sabotage_List `mcp/src/test-support/sabotage/kiro-p8.ts` (accept an unknown trigger; skip the matcher compile check; accept an unknown field; report the wrong path; throw on non-JSON text; accept an `agent` action with no `prompt`; accept plugin version `1.0`).
  - _Requirements: 18.3_
- [x] 2.13 Write `mcp/src/kiro-config/privilege.test.ts` examples: a read-only agent has `[]`; each grant of Property 9 alone gives its reason; `exorcist/*` and `exorcist/generate_pin_tests` allow rules; a push deny before and after the `git *` allow; the glob matcher on `git push origin x`, `git pushx`, `npm *`.
  - _Requirements: 14.4, 14.5_
- [x] 2.14 Write the Property 9 test in `mcp/src/kiro-config/privilege.p9.test.ts` (exporting `build(impl)` over `{ writeCapabilities, pushCapabilities }`), using sample base agents written inline in `__fixtures__/agents/` (a read-only base shaped like the design's `coroner.json`, and an `exorcist` base shaped like the design's), not the real files (those are checked in Phase 8).
  - **Property 9: Agent privilege**
  - **Validates: Requirements 14.2, 14.4, 14.5, 14.7**
- [x] 2.15 Create the Sabotage_List `kiro-p9.ts` (ignore an `@exorcist` selector without a tool name; ignore `ask` rules; ignore `shell`; treat `exorcist/*` as one tool; accept a push deny placed after the `git *` allow; inspect only `tools`).
  - _Requirements: 18.3, 18.5_
- [x] 2.16 Checkpoint after Phase 2 - Ensure all tests pass, ask the user if questions arise.

### Phase 3: Hook helpers, hook scripts and the first two hooks

- [x] 3.1 Create `mcp/src/hooks/fired-line.ts` (`formatFiredLine(now, hookId, outcome)`, `parseFiredLine`; invalid date or id rejected without throwing) and `mcp/src/hooks/stop-summary.ts` (`formatStopSummary(tc, tests)` with the tail, line and total caps of Requirement 13.5).
  - _Requirements: 13.5, 13.6_
- [x] 3.2 Write the Property 12 test in `mcp/src/hooks/format.p12.test.ts` (exporting `build(impl)` over `{ formatStopSummary, formatFiredLine, parseFiredLine }`).
  - **Property 12: Hook output formatting**
  - **Validates: Requirements 13.5, 13.6**
- [x] 3.3 Create the Sabotage_List `kiro-p12.ts` (PASS when only tests passed; head instead of tail; no length cap; local-time date; a section for a passing step).
  - _Requirements: 18.3_
- [x] 3.4 Create `mcp/src/hooks/new-dead.ts`: `deadNames(report)` and `newDeadPackages(baseline, report)` (sorted by UTF-16 code unit, no duplicates, `dead` only).
  - _Requirements: 13.1_
- [x] 3.5 Write the Property 10 test in `mcp/src/hooks/new-dead.p10.test.ts` (exporting `build(impl)`), over `reportArb` from the app's testing entry.
  - **Property 10: New dead packages**
  - **Validates: Requirements 13.1**
- [x] 3.6 Create the Sabotage_List `kiro-p10.ts` (include `dying`; report packages already in the baseline; score order; duplicates; case-insensitive compare).
  - _Requirements: 18.3_
- [x] 3.7 Create `mcp/src/hooks/candidate-target.ts`: `candidateTarget(path)` per Requirement 13.3, using `isProofName` from the skeleton.
  - _Requirements: 13.3_
- [x] 3.8 Write the Property 11 test in `mcp/src/hooks/candidate-target.p11.test.ts` (exporting `build(impl)`), including `proofReportPath` compatibility.
  - **Property 11: Candidate path mapping**
  - **Validates: Requirements 13.3, 12.5**
- [x] 3.9 Create the Sabotage_List `kiro-p11.ts` (accept `..`; package is everything before the last dot; accept upper case; accept extra depth; accept `.ts`; accept a path without `candidates`).
  - _Requirements: 18.3, 18.5_
- [x] 3.10 Read `skeleton/src/death-score/properties.test.ts` and write down the exact title of the monotonicity test as a constant in `mcp/src/hooks/run-monotonic.ts`; implement `runMonotonic(deps)` (injected process runner and clock): runs `npx vitest --run skeleton/src/death-score/properties.test.ts -t "<title>"`, returns the last 15 output lines plus `monotonic: PASS` or `monotonic: FAIL`, outcome `ok` or `fail`, never throws.
  - _Requirements: 12.3, 12.6_
- [x] 3.11 Create `mcp/src/hooks/run-stop-check.ts`: `runStopCheck(deps)` runs `npm run typecheck` then `npx vitest --run --changed` through the injected runner, returns `formatStopSummary(...)` lines and outcome `ok` or `fail`; never throws; a runner rejection counts as a failed step with the message `could not run <cmd>`.
  - _Requirements: 12.4, 12.6, 13.5_
- [x] 3.12 Create `mcp/src/hooks/entry.ts` (the shared wrapper the four entry files use: reads argv/env/stdin, saves the first 2000 characters of stdin to `.cache/hooks/last-input-<id>.json`, calls the runner, prints the lines, appends the fired line to `.cache/hooks/fired.log` best effort, logs `fail` on an uncaught runner error, always sets exit code 0) and the entry files `monotonic.ts` and `stop-check.ts`. These and the other two entry files are the only readers of argv, env and stdin.
  - _Requirements: 12.6, 13.7_
- [x] 3.13 Write `mcp/src/hooks/runners.test.ts` examples with a fake process runner, clock and file writer: PASS and FAIL paths of monotonic and stop-check, a runner that rejects, the fired line text, exit code 0 always, the stdin copy is capped at 2000 characters.
  - _Requirements: 12.3, 12.4, 12.6_
- [x] 3.14 Create the Hook_File `.kiro/hooks/death-score-monotonic-on-save.json` and `.kiro/hooks/check-on-stop.json` exactly as in the design table (use the Kiro hook tool or write the JSON; remove `.kiro/hooks/.gitkeep` only when the fourth hook exists, in 7.7).
  - _Requirements: 12.1, 12.3, 12.4_
- [x] 3.15 Write `mcp/src/hooks/hook-files.test.ts` for these two files: each passes `validateHookFile`; the `matcher` of the monotonic hook matches `skeleton/src/death-score/weights.ts`, `severity.ts`, `grade.ts` and an absolute path ending in them, and does not match `weights.test.ts`, `score.ts`, `skeleton/src/graveyard/grade.ts`; the Stop hook has no `matcher`; each `description` is non-empty and at most 120 characters.
  - _Requirements: 12.1, 12.7_
- [x] 3.16 Run both hooks' scripts by hand once from the repository root (`npm run hook:monotonic -w @graveyard-kit/exorcist-mcp --silent`, `npm run hook:stop-check -w @graveyard-kit/exorcist-mcp --silent`), read the output and `.cache/hooks/fired.log`, and note in the task notes what each printed. From this point the two hooks are expected to fire on saves and when an agent turn stops; Phase 11 reads the log.
  - _Requirements: 12.6, 17.8_
- [x] 3.17 Checkpoint after Phase 3 - Ensure all tests pass, ask the user if questions arise.

### Phase 4: MCP core (errors, guards, local files, static oracles, scan source)

- [x] 4.1 Create `mcp/src/errors.ts` (`ErrorCode`, `ToolErrorValue`, `toolError`) and `mcp/src/result.ts` (`textResult`, `errorResult`, `safely`) as in the design; `safely` catches everything and returns `internal_error` / `unexpected error`.
  - _Requirements: 9.1, 9.2, 9.3, 9.4_
- [x] 4.2 Write `mcp/src/result.test.ts` examples: success shape, error shape, `safely` on a throw, on a rejection, on a thrown non-Error, error text never contains the thrown message.
  - _Requirements: 9.2, 9.3, 9.4_
- [x] 4.3 Create `mcp/src/guards.ts` part 1: `classifyRepoArgument`, `NPM_NAME_PATTERN`, `isNpmName`, `checkRuns`, `checkOut` (using `REPO_PATTERN`, `parseRepoTarget`, `DEMO_REPOS`, `isProofOutPath` from the programmatic entry).
  - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.7_
- [x] 4.4 Extend `guards.ts` part 2: the `FsProbe` type, `checkPath` and `checkCandidate` (resolve against `cwd`, 4096 limit, NUL, existence, directory or regular file, extension), returning `ToolErrorValue` with the codes of Requirement 3.6 and 3.7.
  - _Requirements: 3.6, 3.7, 3.8_
- [x] 4.5 Write `mcp/src/guards.test.ts` examples: `/a/b`, `./x`, `../x`, `owner/name`, `./owner/name`, `parse-server`, `pump`, `Parse-Server`, `owner/name/extra`, empty, NUL, 4097 characters; `@scope/pkg`, `Pkg`, `a`, 214 and 215 characters; `runs` 99, 100, 100000, 100001, `1e3`, `200.5`; `out` forms; a missing path, a file given as a path, a directory given as a candidate, `candidate.ts`.
  - _Requirements: 3.1 to 3.7_
- [x] 4.6 Create `mcp/src/test-support/fakes.ts`: an in-memory `FsProbe` over a generated map, a recording `ReportFs`, a fake `DemoStore`, counting wrappers for every Dep (call counter and argument log), and `makeDeps(overrides)` with defaults built from the app's fake clock, `FakeHttp` and `memoryFiles`.
  - _Requirements: 18.1_
- [x] 4.7 Write the Property 1 test in `mcp/src/guards.p1.test.ts` (exporting `build(impl)` over the guard functions and a tool-call harness stub that records Dep calls for rejected inputs).
  - **Property 1: Argument guards and routing**
  - **Validates: Requirements 3.1 to 3.8, 2.5**
- [x] 4.8 Create the Sabotage_List `kiro-p1.ts` (leading `./` as `github`; demo before local; upper case Npm_Name; `runs` 99; skip `parseRepoTarget`; pipeline before path guard; `ref` with a local path).
  - _Requirements: 18.3_
- [x] 4.9 Create `mcp/src/deps.ts`: `ExorcistDeps` and the supporting types exactly as in the design.
  - _Requirements: 2.4_
- [x] 4.10 Create `mcp/src/local-files.ts` (`createLocalRepoFiles(probe, dir)`) and `local-files.test.ts`: both files present, lockfile absent, manifest absent (`not_found`), the `target` argument ignored.
  - _Requirements: 4.5_
- [x] 4.11 Create `mcp/src/oracles-static.ts`: `loadOracle(pkg)` with static imports of `intersect`, `deep-diff` and their `package.json` versions; `undefined` for any other name. Write `oracles-static.test.ts`: versions are `1.0.1` and `1.0.2`; for both packages and 50 fixed sample inputs each, the static module and the app's `loadOracle` module return structurally equal results.
  - _Requirements: 8.2, 19.1_
- [x] 4.12 Create `mcp/src/scan-source.ts`: `obtainScanReport(deps, input)` per the design flow (classification, demo store with `parseReport`, GitHub pipeline, local pipeline, deadline and watchdog race exactly as `handler.ts`, `ref` rules, error mapping to `scan_failed`).
  - _Requirements: 4.2 to 4.7, 3.3_
- [x] 4.13 Create the fixtures `mcp/src/__fixtures__/demo/sample.json` (a small valid snapshot produced by `serializeReport` of a `reportArb` sample with fixed content), `__fixtures__/checkout/package.json` and `package-lock.json` (three dependencies), written for this repository.
  - _Requirements: 18.1_
- [x] 4.14 Write `mcp/src/scan-source.test.ts` examples: demo name, demo `owner/repo`, demo with `ref` goes live, invalid and missing snapshot, GitHub success and each pipeline error code, local success over the fixture checkout, local missing `package.json`, timeout, `ref` rules, zero HTTP requests for demos and rejected inputs.
  - _Requirements: 4.2 to 4.7_
- [x] 4.15 Write the Property 7 test in `mcp/src/scan-source.p7.test.ts` (exporting `build(impl)` over `obtainScanReport`), plus an example that every committed `demo/*.json` is accepted by `parseReport`.
  - **Property 7: Demo routing**
  - **Validates: Requirements 4.2, 4.3, 3.3**
- [x] 4.16 Create the Sabotage_List `kiro-p7.ts` (fall back to a live scan on an invalid snapshot; serve unvalidated; route `owner/repo` with a `ref` to the demo; call pipeline and store; treat a missing snapshot as empty).
  - _Requirements: 18.3_
- [x] 4.17 Checkpoint after Phase 4 - Ensure all tests pass, ask the user if questions arise.

### Phase 5: The five tools

- [x] 5.1 Create `mcp/src/tools/scan-repo.ts` (zod shape, `impl(deps, args)`, description, annotations) and `scan-repo.test.ts` examples: demo, GitHub, local, each error code, output accepted by `parseReport`.
  - _Requirements: 4.1 to 4.8, 2.2_
- [x] 5.2 Create `mcp/src/tools/death-report.ts` and `death-report.test.ts`: package found, `package_not_found`, `package_skipped` with the reason, `summary.total` 1, the dependency deep-equals the original, grade count correct, sources present.
  - _Requirements: 5.1 to 5.5_
- [x] 5.3 Create `mcp/src/tools/usage-surface.ts` and `usage-surface.test.ts` over the `intersect-like` and `declared-only` trees copied into `mcp/src/__fixtures__/trees/` (written for this repository, with a README stating they mimic call shapes): call sites and import sites present, `attempts: []`, warnings as a second item and capped at 50, `filesScanned` 0 is a success, no absolute path.
  - _Requirements: 6.1 to 6.6_
- [x] 5.4 Create `mcp/src/tools/find-replacement.ts` and `find-replacement.test.ts` with a fake `e18e`: match with `ReplacementInfo` (including an empty `replacements` list), `none`, a failure gives `evidence_unavailable` and never `none`, key order.
  - _Requirements: 7.1 to 7.6_
- [x] 5.5 Create `mcp/src/tools/generate-pin-tests.ts` part 1 (no `out`): builds `CliArgs`, the in-memory `ReportFs` at `memory/proofs/dry-run/<package>.json`, calls `exorcise`, returns the report text and the summary item, maps exit 1 and 2.
  - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6, 8.7_
- [x] 5.6 Write `generate-pin-tests.test.ts` part 1 with the real harness over the `intersect-like` tree: an oracle-equivalent candidate gives `proved` with a sabotage line, a de-duplicating candidate gives a successful result with `counterexample` and the shrunk input, the `declared-only` tree gives `no-call-sites` with no candidate, call sites without a candidate give `usage_error`, a missing candidate file gives `invalid_candidate`, nothing is written anywhere.
  - _Requirements: 8.1 to 8.7_
- [x] 5.7 Extend `generate-pin-tests.ts` part 2 (with `out`): the node `ReportFs`, `isProofOutPath` guard, only `out` and its temporary sibling touched; write `generate-pin-tests.out.test.ts` with the recording `ReportFs`: first run creates attempt 1, second appends attempt 2, a report for a different usage surface gives `proof_failed` and writes nothing, an invalid existing report gives `proof_failed`, a bad `out` gives `invalid_out`.
  - _Requirements: 8.4, 8.9, 3.7_
- [x] 5.8 Write `generate-pin-tests.reload.test.ts` with a real temporary candidate file (removed in `finally`) and the real candidate loader of `wire.ts`' candidate wrapper (`loadCandidateBusted`, a small exported function in `mcp/src/candidate-loader.ts` that hashes the source and calls the app's `loadCandidate(file, hash16)`): the first call proves, the file is edited to de-duplicate, the second call in the same process gives a counterexample.
  - _Requirements: 8.8_
- [x] 5.9 Create `mcp/src/tools/index.ts`: `registerTools(server, deps)` registering the five tools with name, title, description, zod shape, annotations and the `safely`-wrapped handler; export `TOOL_NAMES`.
  - _Requirements: 2.1, 2.2_
- [x] 5.10 Create `mcp/src/test-support/arbitraries/tool-outcomes.ts`: generators of fake pipeline outcomes (success from `reportArb`, each error code), Usage_Surface results, e18e outcomes, and `exorcise` outcomes through the real `runProof` on the synthetic recipes of `@graveyard-kit/skeleton/proof/testing`.
  - _Requirements: 18.1_
- [x] 5.11 Write the Property 2 test in `mcp/src/tools/output.p2.test.ts` (exporting `build(impl)` over the five tool `impl` functions).
  - **Property 2: Output contract with the existing validators**
  - **Validates: Requirements 4.8, 5.3, 5.5, 6.3, 7.3, 7.4, 7.6, 8.5, 9.1, 9.2**
- [x] 5.12 Create the Sabotage_List `kiro-p2.ts` (non-canonical JSON; `death_report` returning the dependency object; `usage_surface` without `attempts`; `replacement: null`; error without `isError`; whole summary kept).
  - _Requirements: 18.3, 18.5_
- [x] 5.13 Write the Property 3 test in `mcp/src/tools/wrapper.p3.test.ts` (exporting `build(impl)`): each tool against the direct call of the wrapped function with counting Deps.
  - **Property 3: Thin-wrapper equivalence**
  - **Validates: Requirements 4.4, 4.5, 5.2, 5.3, 6.2, 7.2, 8.2, 8.3, 8.4**
- [x] 5.14 Create the Sabotage_List `kiro-p3.ts` (extra field `source: "mcp"`; different dependency order; pipeline called twice; different default seed; `ref` ignored; `importSites` dropped; evidence stage instead of `fetchE18e`).
  - _Requirements: 18.3, 18.5_
- [x] 5.15 Write the Property 4 test in `mcp/src/tools/total.p4.test.ts` (exporting `build(impl)`): hostile arguments and misbehaving Deps, including a hung pipeline released by a fake watchdog.
  - **Property 4: Tool totality**
  - **Validates: Requirements 2.5, 2.6, 9.2, 9.3, 9.4**
- [x] 5.16 Create the Sabotage_List `kiro-p4.ts` (forward `err.message`; rethrow; stack in message; `undefined` as success; no timeout; empty message).
  - _Requirements: 18.3_
- [x] 5.17 Write the Property 5 test in `mcp/src/tools/writes.p5.test.ts` (exporting `build(impl)`): sequences of calls against recording file systems.
  - **Property 5: Write confinement**
  - **Validates: Requirements 3.8, 8.3, 8.4, 8.9, 10.4**
- [x] 5.18 Create the Sabotage_List `kiro-p5.ts` (write next to `out`; write without `out`; write into the candidate's directory; cache under the target; accept an `out` outside `proofs/<name>/`; write before the guards).
  - _Requirements: 18.3, 18.5_
- [x] 5.19 Write the Property 6 test in `mcp/src/tools/determinism.p6.test.ts` (exporting `build(impl)`): three runs with `Math.random` consumed and `Date.now` changed between them.
  - **Property 6: Determinism**
  - **Validates: Requirements 6.5, 9.5**
- [x] 5.20 Create the Sabotage_List `kiro-p6.ts` (`Date.now()` in the report; absolute path in the label; random seed; set-order warnings; random request id).
  - _Requirements: 18.3_
- [x] 5.21 Checkpoint after Phase 5 - Ensure all tests pass, ask the user if questions arise.

### Phase 6: Server, wiring, build and the stdio test

- [x] 6.1 Create `mcp/src/create-server.ts`: `createExorcistServer(deps)` returning an `McpServer` named `exorcist` (version from `mcp/package.json`) with `registerTools`. No I/O at construction.
  - _Requirements: 2.1, 2.4_
- [x] 6.2 Write `create-server.test.ts` with the SDK's in-memory transport and client: `tools/list` returns exactly the five names with non-empty descriptions and the annotations of Requirement 2.2; a call with a wrong argument type gives `invalid_input` and the counting Deps record no call; each tool answers a valid call through the protocol.
  - _Requirements: 2.1, 2.2, 2.5_
- [x] 6.3 Create `mcp/src/candidate-loader.ts` if not yet created in 5.8 (hash the source with `node:crypto`, call the app's `loadCandidate(file, hash16)`), and `mcp/src/wire.ts`: `wireRealDeps(env, bundleDir)` per the design (`EXORCIST_CACHE_DIR` or `<tmpdir>/exorcist-mcp`, `configFromEnv`, one fetch client, demo store at `<bundleDir>/demo`, GitHub runtime, local pipeline factory, `fetchE18e` over a cache layer, usage surface, `RECIPES`, static oracles, busted candidate loader, node `ReportFs`).
  - _Requirements: 10.3, 10.4_
- [x] 6.4 Write `wire.test.ts`: with a fake `env` (empty, with `EXORCIST_CACHE_DIR`, with `GITHUB_TOKEN`) and a temporary bundle dir, `wireRealDeps` returns Deps without making any request and without creating any file; the cache root rule; the token reaches only the evidence config (not any Tool_Error text).
  - _Requirements: 10.3, 10.4, 9.3_
- [x] 6.5 Create `mcp/src/server.ts`: `main()` redirects `console.log`, `console.info` and `console.debug` to stderr, wires the Deps with `process.env` and the directory of the running file, connects `StdioServerTransport`, and exits 0 when stdin closes; guarded so it runs only as the entry point.
  - _Requirements: 2.3, 2.4, 10.5_
- [x] 6.6 Create `mcp/src/build/build.ts`: `BUNDLE_REL`, `POWER_SERVER_REL`, `buildServer({ outFile, demoOut, root })` with the esbuild options and the banner shim of the design, and the demo copy of the top-level `demo/*.json` files only.
  - _Requirements: 10.1, 10.6_
- [x] 6.7 Create `mcp/src/build/run-build.ts` (the script entry) and wire the `build` script of `mcp/package.json`: builds `mcp/dist/server.mjs` and `mcp/dist/demo/`, then copies both to `power/server/exorcist-mcp.mjs` and `power/server/demo/`. Run `npm run build -w @graveyard-kit/exorcist-mcp` and note the file size.
  - _Requirements: 10.1_
- [x] 6.8 Write `mcp/src/stdio.test.ts` part 1: build the bundle into a temporary directory (outside the repository) with the demo snapshots, spawn `node <tmp>/server.mjs` with an empty environment, send `initialize` and `tools/list`, call `scan_repo` for a demo name and `usage_surface` over the `intersect-like` fixture, assert the five tools, valid results, and that every stdout line is JSON-RPC. Remove the temporary directory in `finally`. Timeout 60 s.
  - _Requirements: 10.2, 18.6_
- [x] 6.9 Extend `stdio.test.ts` part 2: `generate_pin_tests` over the bundle with an oracle-equivalent candidate (`proved`, sabotage line present) and a de-duplicating candidate (`counterexample`), proving the static oracles, `typescript` and `fast-check` work from a bundle outside the repository.
  - _Requirements: 10.2, 8.2_
- [x] 6.10 Extend `stdio.test.ts` part 3: a candidate that calls `console.log("noise")` while being exercised; every stdout line remains a JSON-RPC message and the noise appears on stderr; the server exits 0 when stdin is closed.
  - _Requirements: 2.3, 10.5, 18.6_
- [x] 6.11 If 6.8 or 6.9 fails because the bundle cannot start or cannot run `typescript` or the oracles, STOP and decide per the Risks section (mark `typescript` external and document the install step, or fix the shim). Record what failed and what was decided in the task notes and in the README task (9.7). Do not weaken the stdio test.
  - _Requirements: 10.2_
- [x] 6.12 Create `mcp/src/sabotage.test.ts`: import Properties 1 to 12 and their Sabotage_Lists, run each property against every entry with the fixed seed 20261113 through the repository's `assertAllSabotagesCaught`-style runner, fail with `Sabotage "<name>" stayed green for "<property>"`, assert every list is non-empty, the required names of Requirement 18.5 exist, and the real implementations pass under the same seed. (Property 13 is added in 9.9.)
  - _Requirements: 18.3, 18.4, 18.5_
- [x] 6.13 Write `mcp/src/smoke.test.ts` static checks: `process.env`, `process.argv` and `process.stdin` are read only in `server.ts`, `wire.ts` (env passed in, not read), and the four hook entry files; `skeleton/` imports nothing from `mcp`, `power` or `apps`; `mcp/package.json` pins exact versions and declares no LLM client; no test file contains `lastrites-work`; `createExorcistServer` has no import of `node:fs`.
  - _Requirements: 1.8, 1.3, 2.4, 13.7, 18.1_
- [x] 6.14 Checkpoint after Phase 6 - Ensure all tests pass, ask the user if questions arise.

### Phase 7: Workspace settings and the remaining hooks

- [x] 7.1 Create `.kiro/settings/mcp.json` exactly as in the design (server `exorcist`, `command` `node`, `args` `["mcp/dist/server.mjs"]`, `env` `GITHUB_TOKEN` reference, `disabled` false, `autoApprove` the four read tools).
  - _Requirements: 11.1, 11.2_
- [x] 7.2 Write `mcp/src/kiro-files.test.ts` part 1: the real settings file passes `validateMcpSettings`; `args[0]` equals `BUNDLE_REL`; `autoApprove` is exactly the four read tools and does not contain `generate_pin_tests`; no secret-looking value (a long token-like string) appears in the file.
  - _Requirements: 11.1, 11.2, 11.3_
- [x] 7.3 Create `mcp/src/hooks/run-scan-deps.ts` (`runScanDeps(deps)`: `obtainScanReport` for the repository root as a Local_Path, `deadNames`/`newDeadPackages`, baseline read and write through the injected file system, the output lines of Requirement 13.2, outcome `warn` when there is a new dead package, `ok` when none, `fail` when the scan fails) and the entry file `scan-deps.ts` using `entry.ts`.
  - _Requirements: 12.2, 13.2_
- [x] 7.4 Create `mcp/src/hooks/run-candidate-proof.ts` (`runCandidateProof(deps, stdinText)`: extract the path from the hook JSON accepting the field names listed in the design, `candidateTarget`, the sibling checkout directory from an injected constant, `skipped: no checkout at <path>` when absent, else the `generate_pin_tests` `impl` with no `out`, the status line and the shrunk input for a counterexample) and the entry file `candidate-proof.ts` with the constant `SIBLING_DIR`.
  - _Requirements: 12.5, 13.4_
- [x] 7.5 Write `mcp/src/hooks/runners.scan-candidate.test.ts` examples with fakes: no new dead, one new dead (warning line text, baseline rewritten sorted), absent and corrupt baseline, scan failure keeps the baseline and prints `scan failed`, candidate saved for each field name variant, a non-candidate path, a missing checkout, a proved result line, a counterexample line with the shrunk input, exit code 0 always.
  - _Requirements: 12.2, 12.5, 12.6, 13.2, 13.4_
- [x] 7.6 Confirm the four `hook:*` scripts in `mcp/package.json` point at existing entry files; run `npm run hook:scan-deps -w @graveyard-kit/exorcist-mcp --silent` once by hand (needs the network; if offline, record that it printed `scan failed` and exited 0) and note the output and `.cache/hooks/dead-baseline.json` in the task notes.
  - _Requirements: 12.2, 12.6_
- [x] 7.7 Create the Hook_Files `.kiro/hooks/scan-deps-on-save.json` and `.kiro/hooks/candidate-proof-on-save.json` as in the design table, then delete `.kiro/hooks/.gitkeep`.
  - _Requirements: 12.1, 12.2, 12.5_
- [x] 7.8 Extend `hook-files.test.ts` to all four files: exactly four `.json` files exist in `.kiro/hooks/`; each passes `validateHookFile`; the matchers match and reject the path lists of Requirement 12.7 (`package.json`, `apps/exorcist-npm/package.json`, `package-lock.json`, an absolute path to them; not `node_modules/x/package.json`, `package.json.bak`, `my-package.json`; candidate `demo/proofs/candidates/parse-server/intersect.agent.js`; not `.../README.md`, `demo/proofs/candidates/x.js`, `demo/proofs/parse-server/intersect.json`); each command is an `npm run hook:*` of an existing script; each `description` is non-empty.
  - _Requirements: 12.1, 12.7_
- [x] 7.9 Checkpoint after Phase 7 - Ensure all tests pass, ask the user if questions arise.

### Phase 8: Custom agents

- [x] 8.1 Create `.kiro/agents/prompts/coroner.md`: plain text, no secrets; read only; gather the death report (`death_report`, `scan_repo`), the call sites (`usage_surface`) and the replacement (`find_replacement`); cite the source URLs the tools return; say plainly when a tool failed or a signal is unknown; end with a short report (score, parts, call sites by `src`/`test`, replacement or none, what is not known); never edit, never run commands.
  - _Requirements: 14.3_
- [x] 8.2 Create `.kiro/agents/coroner.json` as in the design (keep `.gitkeep`).
  - _Requirements: 14.1, 14.2, 14.8_
- [x] 8.3 Create `.kiro/agents/prompts/exorcist.md`: follows `migration-rules.md` and `proof-rules.md`; works on the new local branch it is told to use; never pushes, never changes git config or remotes; the order: `usage_surface`, write the candidate to `demo/proofs/candidates/<repo>/<package>.agent.js`, `generate_pin_tests` with the `out` it is given BEFORE editing the target, apply the migration only when the status is `proved`, report the status, the `weak` flag, the seed and the sabotage line exactly as returned; a counterexample or error means not done; never weaken a test, a recipe or a Projection; say what it could not verify (for example, that the target's own tests were not run).
  - _Requirements: 14.6_
- [x] 8.4 Create `.kiro/agents/exorcist.json` as in the design (tools, inline server entry, resources, deny rules before allow rules).
  - _Requirements: 14.1, 14.5, 14.8_
- [x] 8.5 Extend `kiro-files.test.ts` part 2: both agent files pass `validateAgentFile` with a real `exists`; the `coroner` has `writeCapabilities` `[]` and exactly the tools of Requirement 14.2; the `exorcist` has `pushCapabilities` false, `fs_write` match exactly the two roots, `generate_pin_tests` reachable through `@exorcist`; both inline `mcpServers.exorcist` entries deep-equal the Workspace_Settings entry; no legacy field; both prompt files exist, are non-empty, and the coroner prompt contains no word granting edits (`edit`, `write` only in a negative sentence checked by a fixed phrase list).
  - _Requirements: 14.2, 14.4, 14.5, 14.7, 14.8_
- [x] 8.6 Checkpoint after Phase 8 - Ensure all tests pass, ask the user if questions arise.

### Phase 9: The Power

- [x] 9.1 Create `mcp/src/power/skill-from-steering.ts`: `skillFromSteering(steering, meta)` per the design (steering frontmatter removed, LF or CRLF, a leading blank line normalized once, body otherwise unchanged).
  - _Requirements: 15.5_
- [x] 9.2 Write the Property 13 test in `mcp/src/power/skill.p13.test.ts` (exporting `build(impl)`).
  - **Property 13: Skill generation**
  - **Validates: Requirements 15.4, 15.5**
- [x] 9.3 Create the Sabotage_List `kiro-p13.ts` (keep the steering frontmatter; drop a body line equal to `---`; `description` before `name`; CRLF output; truncate at 4000 characters).
  - _Requirements: 18.3_
- [x] 9.4 Create `mcp/src/power/sync.ts` and wire `power:sync`: reads `.kiro/steering/migration-rules.md` and `proof-rules.md`, writes `power/skills/migration-rules/SKILL.md` and `power/skills/proof-rules/SKILL.md` with the descriptions of the design. Run `npm run power:sync -w @graveyard-kit/exorcist-mcp` and check the two files.
  - _Requirements: 15.4, 15.5_
- [x] 9.5 Create `power/plugin.json` as in the design; read the repository `LICENSE` and set `license` to its SPDX id (drop the field if the file has none).
  - _Requirements: 15.2_
- [x] 9.6 Create `power/mcp.json` as in the design.
  - _Requirements: 15.3_
- [x] 9.7 Create `power/README.md` with the sections of Requirement 15.6 (build, IDE and CLI install, the five tools, what `generate_pin_tests` executes, `GITHUB_TOKEN`, `EXORCIST_CACHE_DIR`, limits) and the outcome recorded in 6.11 if any; state plainly that how Kiro resolves `args` of a power `mcp.json` was assumed to be relative to the power folder and is checked in the final group.
  - _Requirements: 15.6, 15.7_
- [x] 9.8 Create `mcp/src/power/power-files.test.ts`: `plugin.json`, `mcp.json` and both skills pass their validators; the power `mcp.json` `args[0]` equals `POWER_SERVER_REL`; each committed skill equals `skillFromSteering` of the current steering file (the drift guard); the README contains the install commands (`kiro-cli powers install`, "Add Custom Power") and the word `generate_pin_tests`; `power/` contains no `POWER.md`; the folder contains only the listed files (ignoring `server/`).
  - _Requirements: 15.1 to 15.7_
- [x] 9.9 Extend `mcp/src/sabotage.test.ts` with Property 13 and its list.
  - _Requirements: 18.3_
- [x] 9.10 Checkpoint after Phase 9 - Ensure all tests pass, ask the user if questions arise.

### Phase 10: Verification and documentation

- [x] 10.1 Extend `mcp/src/smoke.test.ts`: the power `server/` directory is ignored by git (`git check-ignore power/server/x`); `.kiro/hooks` has exactly the four files; `.kiro/agents` has exactly the two agent files plus `prompts/`; the root `package.json` `workspaces` equal the required array; the root `vitest.config.ts` includes `mcp/src/**/*.test.ts`.
  - _Requirements: 1.1, 1.4, 1.9, 12.1, 14.1_
- [x] 10.2 Run `npm run typecheck` and `npm test` plain and with `CI=1`; fix strict-mode errors; confirm every property runs with `numRuns` 100, `FC_SEED` replays, every Sabotage_List entry fails its property, and the stdio test passes offline.
  - _Requirements: 18.2, 18.3, 18.4, 18.7_
- [x] 10.3 Run `npm run build -w @graveyard-kit/exorcist-mcp`, confirm `mcp/dist/server.mjs`, `mcp/dist/demo/`, `power/server/exorcist-mcp.mjs` and `power/server/demo/` exist, and `git status --short` shows none of them (ignored).
  - _Requirements: 10.1, 1.9_
- [x] 10.4 Append a dated entry to `docs/kiro-log.md` for the build of tasks 1 to 10: the thirteen properties, sabotage results and any shrunk counterexample found during development, the added dependencies and versions, the decisions worth recording (Kiro format divergences from the brief, static oracles, cache busting, dry-run by default, hook scripts always exit 0, `death_report` as a one-dependency Scan_Report), the bundle size and the 6.11 outcome, and the test counts.
  - _Requirements: 17.9_
- [x] 10.5 Final checkpoint for the build - Ensure all tests pass, ask the user if questions arise.

### Phase 11: Real use against `../lastrites-work/parse-server` (manual, outside `npm test`)

- [x] 11.1 Preflight, read only: `git -C ../lastrites-work/parse-server rev-parse --short HEAD`, `branch --show-current`, `status --short` (must be empty), `remote -v`, `branch -vv`. Stop and ask if the checkout is dirty or missing. Record the values (they are the "before" state).
  - _Requirements: 17.1_
- [x] 11.2 Check prerequisites: `kiro-cli --version`; `KIRO_API_KEY` is set in the environment (check only that it is non-empty; never print it); the bundle is built (10.3). If `KIRO_API_KEY` is missing, STOP, record in the log that the real use is NOT RUN and why, and ask the user. Do not fake a transcript.
  - _Requirements: 17.2_
- [ ] 11.3 Start-up check: run `kiro-cli chat --v3 --agent coroner --no-interactive --require-mcp-startup "List the tools you can call, one per line, and nothing else."` from the repository root; save the raw output to `.cache/kiro-runs/coroner-tools.txt`; record the exit code (3 means the MCP server did not start, 4 that the agent was not found) and whether the tool list is exactly the four read tools of the coroner plus file reading. This also checks the unconfirmed `@exorcist/<tool>` entries in `tools`; record what the CLI did with them.
  - _Requirements: 17.2, 17.9_
- [ ] 11.4 Snapshot both repositories before the coroner run: `git status --short` here and in the target, saved in the task notes.
  - _Requirements: 17.3_
- [ ] 11.5 Run the coroner on `deep-diff`: `kiro-cli chat --v3 --agent coroner --no-interactive --require-mcp-startup --trust-tools=<ids the CLI reported in 11.3 for the read tools and the four MCP tools> "Investigate the dependency deep-diff in ../lastrites-work/parse-server. Use death_report for parse-community/parse-server, usage_surface on ../lastrites-work/parse-server, and find_replacement. Report the score, the parts with their sources, the call sites by src and test, and the replacement. Do not edit anything."`; save the raw output to `.cache/kiro-runs/coroner-deep-diff.txt`. If the CLI refuses a flag, record the exact message and use the documented alternative; do not use `--trust-all-tools`.
  - _Requirements: 17.2, 17.3_
- [ ] 11.6 After the coroner run: `git status --short` in both repositories again and compare with 11.4 (only `.cache/` may change here; nothing in the target); extract which tools the agent called and what it reported. Append the coroner summary to `docs/kiro-log.md` (command, exit code, tools called, evidence reported, read-only check result, problems). The raw transcript stays in `.cache/kiro-runs/`.
  - _Requirements: 17.3, 17.9_
- [ ] 11.7 Create the local branch in the target: `git -C ../lastrites-work/parse-server switch -c lastrites/exorcist-intersect` (record the base branch and HEAD first). Do not set an upstream.
  - _Requirements: 17.4_
- [ ] 11.8 Run the Exorcist_Agent: `kiro-cli chat --v3 --agent exorcist --no-interactive --require-mcp-startup --trust-tools=<ids for read, write, shell and the five MCP tools as reported in 11.3> "Migrate the dependency intersect in ../lastrites-work/parse-server, which is on the local branch lastrites/exorcist-intersect. Write your candidate to demo/proofs/candidates/parse-server/intersect.agent.js. Call generate_pin_tests with path ../lastrites-work/parse-server, package intersect, your candidate, runs 1000 and out demo/proofs/parse-server/intersect.json BEFORE you edit the target. Edit the target only if the status is proved. Never push. Commit once on the local branch only if the status is proved and report the result exactly as returned."`; save the raw output to `.cache/kiro-runs/exorcist-intersect.txt`. If the permission rules (`fs_write` or `shell` `match` syntax) are refused, record the exact message, adjust only the agent file's `match` entries to what the CLI accepts, re-run the validator tests, and note the change in the log.
  - _Requirements: 17.4, 17.9_
- [ ] 11.9 Read the result without trusting the agent's summary: `demo/proofs/parse-server/intersect.json` (run `parseProofReport` on it through a one-line `vite-node` script, then delete the script), count the attempts, and for each new attempt record number, status, `weak`, seed, the shrunk counterexample if any, the sabotage line and survivors; check whether the agent's candidate is the file recorded in the attempt; check whether the attempt was appended or the harness refused it (`proof_failed` in the transcript) and why.
  - _Requirements: 17.5_
- [ ] 11.10 Check the target: `git -C ... status -sb`, `git -C ... diff --stat <base>..HEAD`, `git log --oneline <base>..HEAD`. If the last attempt is a counterexample or an error and the target contains a migration, record the migration as NOT DONE and ask the user before discarding anything; do not run `git reset` or `git checkout` on the target without that answer. If the last attempt is proved, record whether it is weak and which mutants survived, and what the diff changes; record that the target's own tests and typecheck were not run (no install, MongoDB needed).
  - _Requirements: 17.5, 17.6_
- [ ] 11.11 Verify nothing was pushed: the branch has no upstream (`git -C ... rev-parse --abbrev-ref @{u}` fails), `git -C ... branch -vv` shows no remote branch for it, `git -C ... log origin/<base>..<base>` is empty, and the base branch HEAD equals the value from 11.1. Record the results.
  - _Requirements: 17.7_
- [ ] 11.12 Read `.cache/hooks/fired.log` and the session record: for each of the four hooks, whether it fired during the build (Phases 1 to 10) and during the real use, with the dates and outcomes; write `did not fire` for any hook with no line, and say what could explain it (for example, a save made by an agent tool). Use `.cache/hooks/last-input-*.json` to record the real stdin field that carried the saved path, or `NOT SEEN`.
  - _Requirements: 17.8_
- [ ] 11.13 Optional, only if the user agrees (it changes the user's global Kiro configuration): install the Power with `kiro-cli powers install ./power`, confirm the server starts and `scan_repo` answers for a demo name, then `kiro-cli powers uninstall exorcist`. Record the outcome, including how `args` of the power `mcp.json` were resolved. If not done, record `NOT RUN` and why.
  - _Requirements: 17.9, 19.3_
- [ ] 11.14 Append a dated entry to `docs/kiro-log.md` for the exorcist run and the hooks: the exact commands, every attempt in order (status, `weak`, seed, shrunk counterexample, sabotage line), whether `intersect.json` was appended or the harness refused, the target diff or "no migration kept", the push checks, which hooks fired with dates, and everything that differed from the spec's expectations (agent or hook fields Kiro rejected or ignored, permission syntax, unconfirmed items from the design). Record outcomes exactly as they came out, including failures and NOT RUN items.
  - _Requirements: 17.5, 17.6, 17.8, 17.9_
- [ ] 11.15 Final checkpoint - Run `npm run typecheck` and `npm test` once more; confirm `git status --short` here shows only the intended new and changed files and that no commit was made by this plan; confirm the target repository is on its local branch (or back on its base branch if the user asked) with no push; ask the user if questions arise.
  - _Requirements: 17.10, 18.7_

## Task Dependency Graph

Phases are sequential; each wave is one phase. Within a wave, a test task follows the file it tests and a Sabotage_List follows its property test.

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9", "1.10", "1.11", "1.12"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.12", "2.13", "2.14", "2.15", "2.16"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "3.11", "3.12", "3.13", "3.14", "3.15", "3.16", "3.17"] },
    { "id": 3, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10", "4.11", "4.12", "4.13", "4.14", "4.15", "4.16", "4.17"] },
    { "id": 4, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "5.10", "5.11", "5.12", "5.13", "5.14", "5.15", "5.16", "5.17", "5.18", "5.19", "5.20", "5.21"] },
    { "id": 5, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9", "6.10", "6.11", "6.12", "6.13", "6.14"] },
    { "id": 6, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "7.8", "7.9"] },
    { "id": 7, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6"] },
    { "id": 8, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7", "9.8", "9.9", "9.10"] },
    { "id": 9, "tasks": ["10.1", "10.2", "10.3", "10.4", "10.5"] },
    { "id": 10, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7", "11.8", "11.9", "11.10", "11.11", "11.12", "11.13", "11.14", "11.15"] }
  ]
}
```

## Notes

- Thirteen properties are written, one per subject of Requirement 18.2; each has a Sabotage_List in `mcp/src/test-support/sabotage/kiro-pN.ts`, and `mcp/src/sabotage.test.ts` runs them all (Property 13 is added in 9.9). Each property test file exports `build(impl)` so the central test can swap the implementation.
- Task 1.3 is the only task that needs the network (installing four pinned packages and one dev dependency). Task 7.6 and Phase 11 use the network when run by hand; no test does.
- The two hooks created in Phase 3 are meant to fire during Phases 4 to 10. The Fired_Log (`.cache/hooks/fired.log`) is the evidence recorded in 11.12. A hook that did not fire is reported as such.
- Unconfirmed Kiro details are listed in the design (Research Findings). Phase 11 is where they meet the real tools; a mismatch is recorded, and the affected file and its validator are corrected, never hidden.
- The proof-run order in 11.8 matters: `exorcise` refuses to append to `demo/proofs/parse-server/intersect.json` when the target's usage surface no longer matches the report, so the proof must run before the target is edited.
- Phase 11 commits nothing in this repository. The only commit the plan allows is the single local commit on the target's own branch (11.8), and only when the proof is `proved`. Commits in this repository, when the user makes them, reference spec task numbers (for example, `kiro-integration 5.5: ...`) per the structure steering file.
- The visual or IDE-only checks (the Power install through the IDE panel) are not part of `npm test`; they are recorded as done or NOT RUN.
- Test sub-tasks are not marked optional, matching the earlier plans: the product principle is proof over claims.
