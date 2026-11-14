# Requirements Document

## Introduction

Exorcist_Actions (`apps/exorcist-actions`, package `@last-rites/exorcist-actions`) is the second, deliberately thin app on the kit. It has a different input, different evidence, a different fix and a different proof from Exorcist for npm, and it uses the same death-score engine, the same report format and the same graveyard. It scans the third-party GitHub Actions a repository uses, scores how dead each one is, and for a dead or risky action produces a fix and a proof:

1. **Inventory**: every `uses:` in `.github/workflows/*.yml|yaml` (steps and reusable workflows), with exact source positions.
2. **Evidence**: the seven skeleton signals per `owner/repo`, from GitHub, the action's own `action.yml`, OSV (ecosystem `GitHub Actions`) and a curated replacement map.
3. **Scan report**: the existing Scan_Report format (`parseReport`-compatible) with `ecosystem: "github-actions"`, so the existing graveyard shows it unchanged.
4. **Fix A, swap**: a dead action with a curated replacement is swapped, with its `with:` inputs renamed or dropped per the map.
5. **Fix B, pin**: a mutable ref (`@v3`, `@main`) is pinned to the 40-character commit SHA it resolves to today, with the old ref kept as a trailing comment.
6. **Proof**: a pin proof and a swap contract proof, each a Proof_Report attempt in the existing proof report format, each followed by a mandatory sabotage check.
7. **CLI**: `scan` and `exorcise` (`--write` edits the local checkout only).

The brief is `docs/briefs/2026-11-14-exorcist-actions.md`. This spec follows it, and says so where it adds to it or narrows it (listed in `design.md`, "Decisions and Requirement Clarifications"). The brief's hard cap applies: the plan stays under 70 tasks, and anything that needs more than a label change in the web app is a follow-up, not work here (Requirement 18).

The app makes no LLM call. Tests make no network request and read nothing outside this repository. Exactly one task makes live requests (the fixture-recording task of Requirement 16), and it is marked as such; one more task installs the `yaml` dependency.

Behavioral decisions fixed here, so design does not have to guess:

- The app reuses; it does not copy. HTTP, the disk cache, the GitHub client with its token handling, the OSV client, month arithmetic, report assembly, the report codecs, the proof report codec, the file seams and the test fakes all come from `exorcist-npm` (through its programmatic entry) and `skeleton`. Where a reused function is npm-specific, it gets a small default-preserving parameter (Requirement 1.5), not a copy.
- The inventory never re-serializes YAML. Rewrites are text edits at source offsets, so every byte outside the edit is untouched.
- A signal whose source failed is unknown, never alive. This is the same rule as the npm scanner.
- A rewrite function refuses (returns a reason, changes nothing) rather than guess when a line has a layout it does not understand.
- A proof never weakens itself: a pin or contract that fails is a counterexample, an unavailable source is an error, a sabotage mutant that survives makes the proof weak.
- `--write` is the only way a workflow file changes, and only for a proof that is `proved` and not `weak`. Nothing is committed, pushed or spawned.

## Glossary

- **Exorcist_Actions**: the app `apps/exorcist-actions`.
- **Workflow_File**: a file directly inside `.github/workflows/` whose name ends with `.yml` or `.yaml`.
- **Uses_String**: the string value of a `uses:` key, `owner/repo[/path]@ref`.
- **Action_Use** (`ActionUse`): one parsed Uses_String with its position and context (fields in Requirement 2.5).
- **Skipped_Use** (`SkippedUse`): a `uses:` that is not scanned, with a reason (Requirement 3).
- **Ref_Kind**: `sha` when the ref is exactly 40 hexadecimal characters, else `mutable`.
- **Action_Name**: `owner/repo` of an Action_Use, without `path` and without `ref`.
- **Source_Offset**: the UTF-16 offset in the file text of the first character of the Uses_String content (after an opening quote, if any), with the length of that content.
- **Action_Manifest**: the parsed `action.yml` or `action.yaml` of an action: its `inputs`, `outputs` and `runs.using`.
- **Runtime_Rule**: the mapping from `runs.using` to the signal `deprecated` (Requirement 5.2).
- **Replacement_Map**: the curated list in `src/replacements.ts` (Requirement 7).
- **Replacement**: one entry of the Replacement_Map.
- **Input_Mapping**: the `inputs` field of a Replacement: old input name to new input name, or `null` for dropped.
- **Evidence_Stage**: the per-Action_Name function that returns the seven signals, the unknown reasons and the replacement info (same result type as the npm `EvidenceResult`).
- **Scan_Report**: the canonical JSON of `serializeReport`, valid for `parseReport` (`apps/exorcist-npm/src/scan/report.ts`).
- **Ecosystem**: the optional `ecosystem` field of the Scan_Report: `"npm"` (the default when absent) or `"github-actions"`.
- **Proof_Report**: the canonical JSON of `serializeProofReport`, valid for `parseProofReport` (`skeleton/src/proof/report.ts`).
- **Proof_Name**: a string matching `^[a-z0-9][a-z0-9-]{0,63}$` (`PROOF_NAME_PATTERN`).
- **Action_Proof_Name**: the Proof_Name derived from an Action_Name by `actionProofName` (Requirement 14.7).
- **Pin_Rewrite**: the text edit that turns a mutable Uses_String into `owner/repo[/path]@<sha>` and appends ` # <old ref>` after it (Requirement 10).
- **Swap_Rewrite**: the text edit of Requirement 11.
- **Rewrite_Refusal**: a result `{ ok: false, reason }` with the text unchanged; reasons are `unsupported_layout`, `not_mutable`, `invalid_sha`, `no_replacement`, `unsupported_replacement_kind`, `unmapped_input`.
- **Pin_Proof**: the proof of Requirement 12. **Contract_Proof**: the proof of Requirement 13.
- **Mutant**: a deliberately wrong candidate used by the sabotage check (Requirement 14.1).
- **Sabotage_List**: the test-suite convention of `proof-rules.md`: deliberately wrong implementations of the code under test, one list per property.
- **Fixture_Case**: a folder `apps/exorcist-actions/src/__fixtures__/<case>/` of recorded HTTP exchanges (format of `FixtureEntry` in the npm test support) and, for `nixpacks`, the recorded workflow files.
- **Recorder**: the manual script of Requirement 16.2.
- **Hero_Repo**: `railwayapp/nixpacks` at commit `144b4f9ab1c3943af4dfe76d3c79d91263f5b465`, cloned at `../lastrites-work/nixpacks`.
- **Demo_Snapshot**: `demo/nixpacks-actions.json`.
- **Programmatic_Entry**: `@last-rites/exorcist-npm/programmatic` (`apps/exorcist-npm/src/programmatic.ts`), re-exports only.

## Requirements

### Requirement 1: Package, dependencies and the reuse boundary

**User Story:** As a maintainer, I want the second app to sit on the kit the way the first one does, so that `npm test` and `npm run typecheck` cover it and nothing is duplicated.

#### Acceptance Criteria

1. THE package SHALL be `@last-rites/exorcist-actions` in `apps/exorcist-actions` (private, `type` module, TypeScript strict, ESM), covered by the existing root `workspaces` entry `apps/*` and the existing root `vitest.config.ts` pattern `apps/*/src/**/*.test.ts`; THE root `package.json` and `vitest.config.ts` SHALL NOT change.
2. THE `package.json` SHALL declare the scripts `typecheck` (`tsc --noEmit`), `scan`, `exorcise` and `record-fixtures` (the last three through `vite-node`, as in `exorcist-npm`).
3. THE dependencies SHALL be `@last-rites/skeleton` and `@last-rites/exorcist-npm` (both `*`) and `yaml` as an exact version; THE dev dependencies (`fast-check`, `vitest`, `typescript`, `@types/node`) SHALL be written as the exact versions that the lockfile already resolves for the sibling packages, so that no second copy is installed; no dependency SHALL be an LLM client.
4. THE app SHALL import from `exorcist-npm` only through `@last-rites/exorcist-npm/programmatic`, `@last-rites/exorcist-npm/programmatic/testing` and `@last-rites/exorcist-npm/report`, and from `skeleton` only through its package exports; THE `skeleton` package SHALL NOT import anything from an app.
5. THE only changes to existing code SHALL be these five, each leaving every npm behavior byte-identical (the existing tests stay unchanged and green, and each change has a new test):
   1. `scan/types.ts` and `scan/report.ts`: the optional `ecosystem` field (Requirement 8.5);
   2. `evidence/osv-count.ts` and `evidence/sources/osv.ts`: an `ecosystem` parameter defaulting to `"npm"`, and an optional version (Requirement 6.1);
   3. `evidence/sources/github.ts`: the request helper with the token handling extracted as an exported `createGithubGet`, used by `fetchGithub` unchanged;
   4. `evidence/assemble.ts`: `reasonMessage` exported;
   5. `programmatic.ts` and `programmatic-testing.ts`: new re-exports only.
6. NO code SHALL move into `skeleton` in this spec; THE app SHALL NOT change `skeleton`.
7. EVERY external request SHALL go through the `CacheLayer` over a `ResilientClient` (disk cache with TTL, retries, concurrency limit), configured by `configFromEnv`; the optional `GITHUB_TOKEN` SHALL be read only there.
8. THE app SHALL make no LLM call; THE tests SHALL make no network request (the existing no-network setup file applies).
9. `process.env`, `process.argv`, standard input and the process exit code SHALL be touched only in the two CLI entry files and the Recorder; every other module SHALL receive what it needs as arguments.

### Requirement 2: Inventory

**User Story:** As a maintainer, I want every third-party action a repository uses, with the exact place of each use, so that a rewrite can touch one value and nothing else.

#### Acceptance Criteria

1. WHEN given a repository root, THE Inventory SHALL read through the injected `SourceFs` the entries directly inside `<root>/.github/workflows` whose kind is `file` and whose name ends with `.yml` or `.yaml` (case-sensitive), SHALL NOT follow symbolic links, SHALL NOT descend into subfolders, and SHALL ignore every other entry.
2. IF the directory does not exist or cannot be read, THEN THE Inventory SHALL return no uses, no skipped uses and the warning `no .github/workflows directory`; it SHALL NOT fail.
3. THE Inventory SHALL parse each file with the `yaml` package (`parseDocument` with a `LineCounter`) and SHALL NEVER re-serialize a document.
4. THE Inventory SHALL collect the `uses` value of every mapping in `jobs.<id>.steps[]` (a step) and the `uses` value of `jobs.<id>` itself (a reusable workflow call, Site `job`); a `uses` key anywhere else SHALL be ignored.
5. EACH Action_Use SHALL have: `file` (repository-relative, `/` separators), `line` and `column` (1-based, of the first character of the Uses_String content), `offset` and `length` (the Source_Offset), `owner`, `repo`, `path` (absent when there is none), `ref`, `refKind`, `with` (`Record<string,string>`), `jobId`, `site` (`step` or `job`), `stepIndex` (the 0-based index in `steps`; absent for site `job`), `stepId` (the step's `id` when it is a string; absent otherwise), `withKeys` (for each `with` entry in source order: `name`, the Source_Offset of the key text, and the whole-line range when the entry is a single-line `key: value` line) and `outputRefs` (Requirement 2.9).
6. THE output SHALL be sorted by `file` (UTF-16 code-unit order), then `line`, then `column`, and SHALL NOT depend on the order of the directory listing.
7. IF a file cannot be parsed (a YAML error, more than one document, or a size above 1 MiB), THEN THE Inventory SHALL return no uses from that file, SHALL add the warning `<file>: invalid YAML (<first error code>)` or `<file>: file too large`, and SHALL still process the other files.
8. THE Inventory SHALL be total and deterministic: it never throws, performs no I/O except `readDir` and `readText`, and returns equal output for equal input.
9. THE `with` record SHALL map each key to its value as a string (a string scalar as is, any other scalar as its YAML string form, a non-scalar as its compact JSON text); WHEN a use has no `with`, it SHALL be `{}`; THE `outputRefs` SHALL be the sorted, unique `<name>` of every `steps.<stepId>.outputs.<name>` occurrence in the source text of the steps that follow that step in the same job (empty when the use has no `stepId` or is a job-level use).

### Requirement 3: The Uses_String grammar, the guards and the skipped uses

**User Story:** As a maintainer, I want a hostile or odd `uses:` value to be skipped with a reason, not to reach a URL or crash the scan.

#### Acceptance Criteria

1. THE `parseUses(text)` function SHALL be pure and total and SHALL accept exactly `owner/repo[/path]@ref` where `owner` matches `^[A-Za-z0-9][A-Za-z0-9-]{0,38}$`, `repo` matches `^[A-Za-z0-9._-]{1,100}$` and is not `.` or `..`, `path` is one or more `/`-separated segments each matching `^[A-Za-z0-9._-]+$` and not `.` or `..`, and `ref` matches `^[A-Za-z0-9._/-]{1,255}$`.
2. THE Ref_Kind SHALL be `sha` exactly when `ref` matches `^[0-9a-fA-F]{40}$`, else `mutable`.
3. A Uses_String starting with `docker://` SHALL be a Skipped_Use with reason `docker`; one starting with `./` or `../` SHALL be a Skipped_Use with reason `local`.
4. A Uses_String with no `@ref` SHALL be a Skipped_Use with reason `no_ref`; a string that contains `${{`, or that fails 3.1 for any other reason, SHALL be a Skipped_Use with reason `malformed`.
5. A `uses` value that is not a plain or quoted single-line scalar whose source text equals its value (a block scalar, an alias, an escaped or multi-line quoted scalar, a non-string) SHALL be a Skipped_Use with reason `unsupported_value`.
6. A Skipped_Use SHALL carry `file`, `line`, `column` (of its value when it has one), `specifier` (the raw value, cut at 200 UTF-16 code units) and `reason`, and SHALL be sorted like the uses.
7. NO string taken from a workflow SHALL be used in a request URL unless `parseUses` accepted it; every URL builder SHALL percent-encode each segment.

### Requirement 4: Evidence from GitHub

**User Story:** As a maintainer, I want to know whether the action's repository is archived and when it last moved, from the same source and with the same rules as the npm scanner.

#### Acceptance Criteria

1. THE Evidence_Stage SHALL run once per unique Action_Name, in a deterministic order, and SHALL take the `ref` and `path` of the first Action_Use of that name in inventory order for every per-ref request.
2. THE signals `repoArchived` and `monthsSinceLastCommit` SHALL come from the existing `fetchGithub` (repository metadata, then the latest commit on the default branch), unchanged.
3. THE signal `monthsSinceLastPublish` SHALL be the months since the `published_at` of the latest release (`GET /repos/{owner}/{repo}/releases/latest`); WHEN there is no release (HTTP 404), it SHALL be the months since the commit date of the first tag that `GET /repos/{owner}/{repo}/tags?per_page=1` lists (the commit is read with `GET /repos/{owner}/{repo}/commits/{sha}`); WHEN there is neither, it SHALL be unknown with category `not_found`.
4. THE months SHALL be computed by the existing `monthsSince` with the one Clock reading of the scan, SHALL be whole and never negative, and an unparseable timestamp SHALL make the signal unknown with category `malformed_response`.
5. THE token SHALL be sent only to `api.github.com`, SHALL never be part of a cache key, a fixture, a report or a message, and a 401 with a token SHALL be retried once without it with the existing warning (all by `createGithubGet`).
6. THE source URLs SHALL be: `repoArchived` and `monthsSinceLastCommit` the repository page (`https://github.com/{owner}/{repo}`); `monthsSinceLastPublish` the releases page (`https://github.com/{owner}/{repo}/releases`), or the tags page (`.../tags`) when the tag fallback was used.

### Requirement 5: Evidence from the action's own manifest

**User Story:** As a maintainer, I want the runtime an action declares, because GitHub deprecates old ones.

#### Acceptance Criteria

1. FOR a Site `step` use, THE Evidence_Stage SHALL fetch `https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path/}action.yml` and, only when that returns HTTP 404, the same URL with `action.yaml`; no token SHALL be sent to that host.
2. THE Runtime_Rule SHALL be: `runs.using` `node<N>` with N at most 16 is deprecated (known true); `node<N>` with N at least 20, `composite` and `docker` are not deprecated (known false); `node17`, `node18`, `node19`, a missing `runs.using` and any other value make the signal unknown with category `malformed_response`.
3. THE source URL of `deprecated` SHALL be `https://github.com/{owner}/{repo}/blob/{ref}/{path/}{action.yml|action.yaml}`, whichever file was read.
4. WHEN neither file exists, THE signal SHALL be unknown with category `not_found`; WHEN the file is not valid YAML or is not a mapping, unknown with category `malformed_response`; a transport failure keeps its category.
5. FOR a Site `job` use (a reusable workflow), THE signal `deprecated` SHALL be unknown with category `not_applicable` and SHALL cause no request.
6. THE Action_Manifest parser SHALL be pure and total, SHALL return the sets of input names (with `required` and `default` presence) and output names, SHALL ignore everything else, and SHALL treat a missing `inputs` or `outputs` as empty.

### Requirement 6: Evidence from OSV, maintainers and the replacement map

**User Story:** As a maintainer, I want vulnerabilities and known replacements counted the same way as for npm packages, and unknowns kept honest.

#### Acceptance Criteria

1. THE signal `openVulnsNoFix` SHALL come from the existing OSV client with ecosystem `GitHub Actions` and package name `{owner}/{repo}` and no version, following pages as the npm path does, counting advisories that have no `fixed` event for that ecosystem and name; THE request body for ecosystem `npm` SHALL stay byte-identical to today's.
2. THE source URL of `openVulnsNoFix` SHALL be the existing `osvListUrl({owner}/{repo})`.
3. THE signal `maintainerCount` SHALL always be unknown with source `github`, category `not_applicable` and the message `github: not_applicable (GitHub exposes no maintainer count for an action)`; no request SHALL be made for it.
4. THE signal `knownReplacementExists` SHALL be known true when the Replacement_Map has an entry for the Action_Name (case-insensitive) and known false otherwise; its source URL SHALL be the entry's `sourceUrl` when true, and `ReplacementInfo` SHALL be `{ type: "<kind>", replacement: "<to>", replacements: ["<to>"] }` (`type` is `action` or `run`).
5. THE result SHALL contain one unknown reason for every unknown signal and none for a known signal; a failed source SHALL make exactly the signals that depend on it unknown, with the source and category of the failure and the message built by `reasonMessage`; NO signal SHALL be known because another source failed.
6. THE Evidence_Stage SHALL never throw; an unexpected failure SHALL give all seven signals unknown with category `network_error` and the warning `evidence failed for {owner}/{repo}`, as the npm scanner does.
7. THE result SHALL not depend on the order in which the independent requests complete.

### Requirement 7: The curated Replacement_Map

**User Story:** As a maintainer, I want replacement claims I can check, with the input mapping the contract proof needs.

#### Acceptance Criteria

1. THE module `src/replacements.ts` SHALL export `REPLACEMENTS` (a readonly list) and `findReplacement(name)`, which SHALL be total, case-insensitive on the Action_Name, and return `undefined` for no entry.
2. EACH Replacement SHALL have `from` (an Action_Name, no path), `kind` (`action` or `run`), `sourceUrl` (an `https://` URL that supports the claim), and, for `action`, `to` (an Action_Name), `toRef` (the ref to write), `replacementUrl` and `inputs` (the Input_Mapping); for `run`, `command` (the shell command the step becomes) and no `inputs`.
3. THE seed entries SHALL be exactly: `actions/create-release` to `softprops/action-gh-release`, `actions/upload-release-asset` to `softprops/action-gh-release`, `actions-rs/toolchain` to `dtolnay/rust-toolchain`, `actions-rs/cargo` to the `run` command `cargo`; the Input_Mapping of `actions-rs/toolchain` SHALL declare `override` and `profile` as dropped.
4. THE entries SHALL be real and verifiable: THE recorded fixtures SHALL show every `from` repository as archived and every `to` repository as existing, and, for each `action` entry, every old input name that the old `action.yml` declares SHALL be mapped or dropped, and every new input name SHALL be declared by the new `action.yml`; an entry that fails this offline check SHALL be removed, not weakened.
5. THE `kind: "run"` entries SHALL feed the evidence only; Requirement 11 refuses to swap them.

### Requirement 8: Scan report, scoring and the ecosystem field

**User Story:** As a user of the web app, I want a scan of actions to be an ordinary report, so that the graveyard shows it unchanged.

#### Acceptance Criteria

1. THE scan SHALL produce one `ScannedDependency` per unique Action_Name with: `name` the Action_Name, `kinds` `["dependencies"]`, `declaredRange` the sorted unique refs of its uses joined with `, `, `versionSource` `range`, no `resolvedVersion`, the seven signals, the unknown reasons, the replacement info, the evidence warnings and the `death` result of the unchanged `scoreDeath` with the default weights.
2. THE report SHALL be built by the existing `assembleReport`, so that its order is score descending then name ascending, and its summary counts every grade.
3. EACH Skipped_Use SHALL become a report `skipped` entry with `name` and `specifier` the cut specifier, `kind` `dependencies` and reason `other`, in inventory order, and a warning `<file>:<line>: skipped <reason>: <specifier>`; every inventory warning SHALL also be a report warning.
4. THE report SHALL be valid for `parseReport` and canonical, and a repository with no uses SHALL give a valid report with no dependencies.
5. THE `ScanReport` type SHALL gain `ecosystem?: "npm" | "github-actions"`; `serializeReport` SHALL write the key `ecosystem` (after `ref`) only when the value is `"github-actions"`; `parseReport` SHALL accept the key with value `"github-actions"` and SHALL reject any other value; a report without the key SHALL parse as before, and every existing report SHALL serialize to the same bytes as today.
6. THE report `repo` SHALL be the `--label` (Requirement 9.3), `ref` the `--ref`, and `scannedAt` the ISO time of the one Clock reading.
7. TWO uses of one `owner/repo` with different `path` values SHALL give one dependency scored from the first use's path; THE limit SHALL be listed in `design.md`.

### Requirement 9: The scan CLI

**User Story:** As a user, I want one command that scans a local checkout and writes the report.

#### Acceptance Criteria

1. THE command `npm run scan -w @last-rites/exorcist-actions -- --repo <path> [--out <file>] [--label <owner/name>] [--ref <text>] [--cache <dir>]` SHALL scan the checkout at `<path>`.
2. THE argument parser SHALL be pure and total: it SHALL reject a missing `--repo`, an unknown flag, a repeated flag, a flag without a value and any positional argument, with exit code 2 and a usage line, and SHALL never throw.
3. THE `--label` SHALL match `^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]{1,100}$` and default to `local/<basename of the path>`; THE `--ref` SHALL match `^[A-Za-z0-9._/-]{1,255}$` and default to `local`; THE `--cache` SHALL default to `.cache/actions` under the working directory.
4. WHEN `--out` is given, THE report SHALL be written there atomically through the existing `ReportFs` and one summary line (`<n> actions, <d> dead, <u> skipped`) printed; otherwise the canonical report SHALL be printed to standard output and nothing else.
5. THE exit code SHALL be 0 when a report was produced (including one full of unknown signals), 1 when the path is not a readable directory, and 2 for a usage error.
6. THE command SHALL print no environment value and no token, and SHALL write no file other than `--out` and the cache files.

### Requirement 10: The pin rewrite

**User Story:** As a maintainer, I want a mutable ref pinned to the commit it points to, changing one value and one comment and nothing else.

#### Acceptance Criteria

1. THE `pinUse(text, use, sha)` function SHALL be pure and total, and SHALL return `{ ok: true, text, changed }` or a Rewrite_Refusal; IF `sha` is not 40 lower-case hexadecimal characters, THEN it SHALL refuse with `invalid_sha`.
2. WHEN the use is `mutable` and the line is supported, THE result SHALL replace exactly the `ref` characters inside the Uses_String content by `sha` and SHALL insert ` # <old ref>` immediately after the end of the scalar (after the closing quote when quoted); every other byte of the text, including line endings, quoting, indentation, comments and blank lines, SHALL be unchanged.
3. WHEN the use is already `sha`, THE function SHALL return `{ ok: true, text, changed: false }` with `text` equal to the input (idempotence); pinning twice SHALL equal pinning once.
4. IF the text after the end of the scalar on its line is not empty, whitespace, or whitespace followed by `#` and a comment (a flow mapping `}`, a `,`, a continuation), THEN THE function SHALL refuse with `unsupported_layout` and return the text unchanged.
5. THE `pinAll(text, uses, shas)` function SHALL apply `pinUse` to several uses of one file from the last offset to the first, so that earlier offsets stay valid, and SHALL return the first refusal unchanged.
6. THE inventory of the rewritten text SHALL list the same uses in the same order, with only the pinned uses changed (`ref` is the sha, `refKind` is `sha`, position and every other field equal, the `with` of the use equal).

### Requirement 11: The swap rewrite

**User Story:** As a maintainer, I want a dead action swapped for its replacement with its inputs renamed or dropped as declared, and a refusal when the inputs do not map.

#### Acceptance Criteria

1. THE `swapUse(text, use, replacement)` function SHALL be pure and total and SHALL return `{ ok: true, text }` or a Rewrite_Refusal.
2. IF the Replacement has `kind` `run`, THEN THE function SHALL refuse with `unsupported_replacement_kind`; IF the use has a `path` or its Action_Name differs from `replacement.from`, THEN it SHALL refuse with `no_replacement`.
3. THE result SHALL replace the whole Uses_String content by `<to>@<toRef>` and insert ` # was <old Uses_String>` after the scalar; for each `with` key that the Input_Mapping renames, only the key text SHALL change; for each dropped key, its whole line (and its line ending) SHALL be removed; WHEN every `with` entry is dropped, the `with:` line SHALL be removed too.
4. IF a `with` key of the use has no entry in the Input_Mapping, THEN THE function SHALL refuse with `unmapped_input` naming the key.
5. IF a dropped key's entry is not a single-line `key: value` line, or the `with` map is in flow style, or the line after the scalar is unsupported (Requirement 10.4), THEN THE function SHALL refuse with `unsupported_layout`.
6. EVERY byte of the text outside those edits SHALL be unchanged, and the number of lines SHALL change only by the removed lines.

### Requirement 12: The pin proof

**User Story:** As a maintainer, I want proof that a pin is the commit the ref pointed to, and that the rewrite touched nothing else.

#### Acceptance Criteria

1. THE `checkPin` function SHALL be pure and total, SHALL take the original file texts, the rewritten file texts, the pinned uses and the resolved commit SHA of each distinct `owner/repo@ref` (a result per ref, resolved by `GET /repos/{owner}/{repo}/commits/{ref}` and the `sha` field of the response), and SHALL return `pass` or the first violation in a fixed order (file, line, column).
2. THE check SHALL fail with a `sha` violation when the sha written for a use differs from the resolved sha of its `owner/repo@ref`.
3. THE check SHALL fail with a `bytes` violation when the rewritten text differs from the original anywhere except (a) the `ref` characters of a pinned use and (b) the inserted ` # <old ref>` after it; the comparison SHALL be on the line split of both texts with their line endings, so that an extra changed line, a lost line ending or a reordered line fails.
4. THE check SHALL fail with a `parse` violation when the inventory of a rewritten file does not list the same uses with only the pinned ones changed (Requirement 10.6).
5. A resolution that failed (a transport failure, HTTP 404, a `sha` that is not 40 hexadecimal characters) SHALL make the attempt status `error` with code `recipe_failure` and a message naming the `owner/repo@ref` and the category, never `proved`.
6. THE attempt SHALL be `proved` only when every pinned use passed every check; its `callSites` SHALL be the pinned uses (Requirement 14.6) and SHALL NOT be empty.

### Requirement 13: The swap contract proof

**User Story:** As a maintainer, I want proof that the replacement accepts every input the workflow passes, gets every input it requires, and offers every output the workflow reads.

#### Acceptance Criteria

1. THE `checkContract` function SHALL be pure and total and SHALL take the old `with` map, the Replacement (with its Input_Mapping), the Action_Manifest of the replacement at `toRef`, and the `outputRefs` of the use.
2. THE check SHALL fail with an `input_unmapped` violation naming the input for every old `with` key absent from the Input_Mapping; with an `input_undeclared` violation naming the new input when a mapped (not dropped) name is not declared by the replacement manifest; with an `input_required` violation naming the input for every replacement input that is `required: true` with no `default` and is not supplied by the mapped `with`; with an `output_missing` violation naming the output for every `outputRefs` entry that the replacement manifest does not declare.
3. THE check SHALL pass if and only if none of those four violations exists (the model-based property compares it with a reference implementation written as four set comprehensions).
4. THE first violation SHALL be chosen in the order `input_unmapped`, `input_undeclared`, `input_required`, `output_missing`, then by name in UTF-16 order, so the counterexample is deterministic.
5. THE shape coverage of a contract attempt SHALL list every dropped input that the workflow passes (`dropped.<name>`), every renamed one (`renamed.<name>`), and every supplied required input (`required.<name>`), each with the number of uses, so that the report shows what the swap discarded.
6. WHEN the replacement manifest cannot be fetched or parsed, THE attempt SHALL be `error` with code `recipe_failure` and a message naming the URL category, never `proved`.

### Requirement 14: Sabotage and the proof report

**User Story:** As a maintainer, I want to know the proof could have failed, and I want it in the format the graveyard already reads.

#### Acceptance Criteria

1. THE sabotage check SHALL run these Mutants, each as a wrong candidate fed to the same check that produced `proved`: Pin_Proof `wrong-sha` (one hexadecimal digit of one written sha changed) and `extra-line` (one more line of the rewritten text changed); Contract_Proof `drop-required-input` (a required input removed from the mapped `with`), `rename-output` (one referenced output renamed in `outputRefs`) and `add-unmapped-input` (a `with` key with no mapping added). (`add-unmapped-input` is added to the brief's four so that a contract proof is never weak only because the replacement has no required input or no referenced output.)
2. A Mutant SHALL be applied only when it is applicable (`drop-required-input` needs a required input without default; `rename-output` needs a referenced output; `extra-line` needs a rewritten line that holds no pinned use; `wrong-sha` needs something pinned; `add-unmapped-input` is always applicable); WHEN a Mutant is applicable, it SHALL be counted in `applied`, and it SHALL be caught only if the check rejects it.
3. THE sabotage summary SHALL be `{ applied, caught, survivors }` with survivors named `<shape>:<mutant>`; the attempt SHALL be `weak` exactly when it is `proved` and (`applied` is 0 or a Mutant survived), the rule that `parseProofReport` enforces; a failed or errored attempt SHALL have `applied` 0.
4. EACH attempt SHALL be a `ProofAttempt` with: `status`, `weak`, `numRuns` and `runs` equal to the number of checks evaluated, `seed` 0 (the proofs are deterministic, with no random input), `shapes` (`pin` or `contract`, `status` `passed` or `failed`, `runs`, `coverage`), `candidate` `{ name, source }` (`pin-<Action_Proof_Name>` or `swap-<Action_Proof_Name>`, and the changed lines as `- old` and `+ new` lines), and for a counterexample a `CounterexampleRecord` with `shape`, `input` (the `file:line` and the input or output name), `shrinks` 0, `path` (the violation kind), `oldOutput` and `newOutput` (the original and rewritten text of the line, or `-` for none), `oldProjected` and `newProjected` (the expected and the found value).
5. THE Proof_Report SHALL be built with the existing `appendAttempt` and written by the existing `serializeProofReport`; it SHALL pass `parseProofReport` (canonical and consistent).
6. THE Proof_Report `callSites` SHALL be one `CallSite` per affected Action_Use: `file`, `line`, `column`, `callee` the Uses_String, `member` empty, `argCount` the number of `with` keys, `argTexts` the `key: value` pairs (whitespace collapsed, cut at 200 code units plus `…`), `enclosing` `src`; `importSites` SHALL be empty; `filesScanned` SHALL be the number of Workflow_Files read.
7. THE `actionProofName(actionName)` function SHALL be pure and total and SHALL return a Proof_Name: the lower-cased `owner/repo` with every character outside `[a-z0-9]` turned into `-`, runs of `-` collapsed, leading and trailing `-` removed, cut to 55 characters, then `-` and the first 8 hexadecimal characters of the SHA-256 of the lower-cased `owner/repo`; equal inputs (up to case) SHALL give equal names, and the report `package` SHALL equal the file name, as the existing `demo-proofs.test.ts` requires.
8. THE `repoProofName(label)` function SHALL return the Proof_Name `<repo part, lower-cased, same sanitizing, cut to 54>-actions`, used for the proof folder and the Demo_Snapshot name.

### Requirement 15: The exorcise CLI

**User Story:** As a maintainer, I want one command that produces a fix and its proof for one action, and only writes my files when the proof is solid.

#### Acceptance Criteria

1. THE command `npm run exorcise -w @last-rites/exorcist-actions -- --repo <path> --action <owner/repo> --fix pin|swap [--write] [--out <file>] [--label <owner/name>] [--commit <text>] [--cache <dir>] [--fresh]` SHALL run the inventory, select the uses whose Action_Name equals `--action` (case-insensitive), build the rewrite, prove it, record the attempt and, with `--write`, edit the files; the parser SHALL follow Requirement 9.2, and `--fix` SHALL be exactly `pin` or `swap`.
2. WHEN no use of the action exists, THE command SHALL print `no uses of <action>` and exit 1; WHEN `--fix pin` finds no mutable use, it SHALL print `nothing to pin` and exit 1; WHEN `--fix swap` finds no Replacement of kind `action`, it SHALL print `no swap available for <action>` and exit 1.
3. FOR `--fix pin`, THE command SHALL resolve every distinct `owner/repo@ref` through the cache, apply `pinAll` per file and run the Pin_Proof; FOR `--fix swap`, it SHALL fetch the replacement manifest at `toRef`, apply `swapUse` to every use of the action and run the Contract_Proof; a Rewrite_Refusal SHALL print its reason and exit 1 with nothing written.
4. THE command SHALL print the changed lines as `- old` and `+ new`, the status line (`status`, `weak`, sabotage `caught of applied`) and the counterexample when there is one; without `--write` it SHALL write no workflow file.
5. WHEN `--write` is given and the attempt is `proved` and not `weak`, THE command SHALL write each changed Workflow_File atomically and nothing else in the checkout; OTHERWISE it SHALL write nothing, print `not written: <status>` (with `weak` when the proof is weak) and exit 1.
6. WHEN `--out` is given, THE path SHALL satisfy the existing `isProofOutPath`; THE attempt SHALL be appended to the report at that path (or a new report created); IF an existing report's `callSites` differ from the current uses and `--fresh` is not given, THEN the command SHALL exit 1 with a message and write nothing; WITH `--fresh` it SHALL start a new report.
7. THE exit code SHALL be 0 when an attempt was produced and, with `--write`, the files were written; 1 for every refusal above and for an unreadable path; 2 for a usage error.
8. THE command SHALL NOT commit, push, spawn a process, or write outside the changed Workflow_Files, `--out` and the cache.

### Requirement 16: Fixtures, the recording task, the demo snapshot and the hero proofs

**User Story:** As a judge, I want the demo to load instantly from committed files, and I want to see the hero fixes proved on a real repository.

#### Acceptance Criteria

1. THE fixtures SHALL live next to the tests that use them under `apps/exorcist-actions/src/__fixtures__/` (format of the existing `FixtureEntry`; request headers never recorded; recording unauthenticated); a `README.md` there SHALL say how they were recorded and on what date.
2. THE Recorder (`npm run record-fixtures -w @last-rites/exorcist-actions`) SHALL be a manual script, never run by `npm test`, that runs the real scan and the real exorcise runs through an `HttpClient` decorator which writes every exchange; THE URLs it requests SHALL come from the same builders as production code, so that the fixtures cannot drift from the code.
3. THE Recorder run SHALL be the only task that makes requests to GitHub, raw.githubusercontent.com and OSV, and SHALL, in that one run, record the Hero_Repo scan exchanges, the pin resolutions for the hero pins, the manifests of every Replacement `from` and `to`, and write the Demo_Snapshot and the hero proof reports from those same responses.
4. THE recorded workflow files of the Hero_Repo (all files of `.github/workflows` at the pinned commit, copied from the local clone, no request) SHALL be committed as a fixture tree; THE tests SHALL assert, from that tree, six uses of `actions-rs/toolchain` and seven of `actions-rs/cargo` (checked on the clone on 2026-11-14), and a count of every other Action_Name that equals the count measured by an independent line-based counter in the test.
5. THE Demo_Snapshot `demo/nixpacks-actions.json` SHALL be a Scan_Report with `ecosystem` `github-actions`, `repo` `railwayapp/nixpacks`, `ref` `144b4f9`, valid, canonical and accepted by the skeleton `buildGraveyard`, and it SHALL list `actions-rs/toolchain` and `actions-rs/cargo` with `repoArchived` known and true.
6. THE hero proof reports SHALL be `demo/proofs/nixpacks-actions/<Action_Proof_Name>.json` for the swap of `actions-rs/toolchain` (a Contract_Proof, with `override` and `profile` visible as `dropped.*` coverage) and the pin of `actions/checkout` (a Pin_Proof); their status SHALL be recorded as it came out, a counterexample or a weak result included, and SHALL NOT be adjusted.
7. A replay test SHALL run the same scan and the same two exorcise runs offline over the fixtures with a fake clock set to the Demo_Snapshot `scannedAt`, and SHALL assert the produced texts equal the three committed files byte for byte.
8. THE Recorder run SHALL NOT edit the Hero_Repo clone; every `--write` check SHALL run on a copy in a temporary folder that is removed afterwards.

### Requirement 17: Offline tests, properties and sabotage

**User Story:** As a maintainer, I want the tests to prove they can fail.

#### Acceptance Criteria

1. THE tests SHALL use Vitest and fast-check; the 13 properties of `design.md` SHALL each run with `numRuns` 100, the seed policy of the npm `fc-runner.ts` (a fixed seed in CI, printed with the shrunk counterexample on failure) and SHALL be written as `build(impl)` so that the central sabotage test can swap the implementation.
2. EACH property SHALL have a Sabotage_List in `apps/exorcist-actions/src/test-support/sabotage/actions-pN.ts`; ONE central test (`src/sabotage.test.ts`) SHALL run every list with the seed 20261113 and assert that the real implementation passes under the same seed and that every sabotage fails at least one property.
3. EVERY pure module SHALL have at least one property, not only examples.
4. THE generators SHALL be shaped by the real workflows (plain and quoted `uses`, `with` maps, comments, CRLF, flow-style steps, paths, SHA and tag refs) and SHALL include edge cases (empty `with`, unicode comments, a `uses` as the last line without a line ending).
5. THE tests SHALL use `FakeHttp`, the fake clock and the fake sleep of the npm test support and a temporary cache folder removed in `finally`; they SHALL not read `../lastrites-work`.
6. THE smoke tests SHALL assert: the Programmatic_Entry export list (pinned) contains everything this app imports; `skeleton` imports nothing from an app; no dependency is an LLM client; `process.env` and `process.argv` are read only in the files of Requirement 1.9; the app contains no `child_process` import.

### Requirement 18: Scope and follow-ups

**User Story:** As the owner of the schedule, I want this app to stay thin and not leak into the others.

#### Acceptance Criteria

1. THE plan SHALL have at most 70 tasks.
2. THE spec SHALL NOT change scoring, the graveyard, the proof harness, the MCP server, the power or the web app.
3. THE spec SHALL NOT include: running workflows, `actionlint`, Docker actions, GitLab or other CI systems, automatic pull requests, composite actions inside the scanned repository, a `run:` swap, and UI work.
4. THE graveyard SHALL show the Demo_Snapshot through the existing demo path (`demo/<name>.json`); a read-only check of what the web app assumes about npm (package links, labels) SHALL be recorded in `docs/kiro-log.md` as a list of follow-ups, and nothing in `apps/exorcist-web` SHALL change.
5. THE plan SHALL commit nothing; commits made by the user reference spec task numbers (for example, `exorcist-actions 3.2: ...`).
