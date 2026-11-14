# Requirements Document

## Introduction

Kiro_Integration makes Last Rites usable from inside Kiro, and uses it that way on this repository during the build, so that the `.kiro/` folder shows real use. It adds five things on top of the finished scanner and proof harness, and changes none of their logic:

1. The Exorcist_Mcp (`/mcp`, new workspace package): a stdio MCP server with five tools, each a thin wrapper over code that already exists: `scan_repo`, `death_report`, `usage_surface`, `find_replacement`, `generate_pin_tests`.
2. The Workspace_Settings (`.kiro/settings/mcp.json`): registers the server so Kiro in this repository can call it.
3. The Power (`/power`): the server plus the migration rules, packaged in Kiro's documented power format, with a README for installing it into another workspace.
4. Four Hooks (`.kiro/hooks/`) that fire during the build, and the small scripts behind them.
5. Two Custom_Agents (`.kiro/agents/`): `coroner` (read only) and `exorcist` (may edit and must prove).

The brief (`docs/briefs/2026-11-13-kiro-integration.md`) says that where its file names disagree with Kiro's current documented format, Kiro's format wins and the spec says so. Three places disagree and are fixed here (details and sources in `design.md`, "Kiro formats used"):

- A power in Kiro's current format is `plugin.json` + `mcp.json` + `skills/<name>/SKILL.md`. It has no `steering/` folder. The two migration rule files therefore ship as two skills, generated from `.kiro/steering/migration-rules.md` and `.kiro/steering/proof-rules.md` so they cannot drift.
- Custom agents in Kiro CLI 3.x use `tools` and `permissions.rules`. The CLI 2.x fields `allowedTools` and `toolsSettings` are not used.
- Hooks are JSON v1 files (`version`, `hooks[]` with `name`, `description`, `trigger`, `matcher`, `action`, `timeout`). The legacy `*.kiro.hook` format is not used.

The hosted app, the MCP server and every test make no LLM call. Tests make no network request and read nothing outside this repository.

Behavioral decisions fixed here, so design does not have to guess:

- A tool is a wrapper: it validates its input with the guards below, calls existing code, and returns that code's canonical output. It adds no scoring, no parsing of source and no proof logic. Where no existing function fits, the adapter is a few lines and is named in `design.md`.
- A tool never throws and never returns a stack trace. A failure is a Tool_Result with `isError` true and the body `{"error":{"code","message"}}`, the same shape as the Scan_Api error body.
- `generate_pin_tests` writes nothing unless the caller passes `out`. With `out` it writes only that file (and its temporary sibling in the same directory). It loads and runs the Candidate file in the server process, so it is the only tool that is not auto-approved.
- Hook scripts exit 0 whatever they find. They report; they never block an agent turn or start another one.
- The real-use group (Requirement 17) records what happened, including a tool that failed, a hook that did not fire, or a counterexample. Nothing in it is weakened to get a green result.

## Glossary

- **Exorcist_Mcp**: the MCP server in `/mcp`, workspace `@last-rites/exorcist-mcp`, server name `exorcist`.
- **Tool**: one MCP tool of the server.
- **Tool_Result**: the MCP result of a tool call: `content` (text items) and `isError`.
- **Tool_Error**: a Tool_Result with `isError` true whose single text item is `{"error":{"code":"<code>","message":"<text>"}}`.
- **Repo_Argument**: the `repo` string of `scan_repo` and `death_report`.
- **Demo_Name**: a `name` of `DEMO_REPOS` (`jest`, `prettier`, `parse-server`, `pump`).
- **Local_Path**: a Repo_Argument that starts with `/`, `./` or `../`.
- **Github_Repo**: a Repo_Argument that is `owner/name` and passes the Scan_Api guards.
- **Scan_Report**: the canonical JSON of `serializeReport`, valid for `parseReport` (`apps/exorcist-npm/src/scan/report.ts`).
- **Proof_Report**: the canonical JSON of `serializeProofReport`, valid for `parseProofReport` (`skeleton/src/proof/report.ts`).
- **Proof_Name**: a string matching `^[a-z0-9][a-z0-9-]{0,63}$` (`PROOF_NAME_PATTERN`).
- **Npm_Name**: a string matching the npm package-name guard defined in `design.md` (lower case, optional `@scope/`, at most 214 characters).
- **Programmatic_Entry**: the new file `apps/exorcist-npm/src/programmatic.ts`, exported as `@last-rites/exorcist-npm/programmatic`; it only re-exports existing functions, types and constants.
- **Deps**: the injected seams of the server: HTTP client, clock, sleep, file system probes, the demo store, the pipelines, the usage surface, the proof runner, the e18e source.
- **Workspace_Settings**: the file `.kiro/settings/mcp.json`.
- **Hook_File**: one JSON v1 file in `.kiro/hooks/`.
- **Hook_Script**: a script in `mcp/src/hooks/` run by a Hook_File through an npm script.
- **Fired_Log**: `.cache/hooks/fired.log`, one line per Hook_Script run: `<ISO time> <hook id> <outcome>`.
- **Dead_Baseline**: `.cache/hooks/dead-baseline.json`, the sorted names of the packages graded `dead` at the last dependency scan of this repository.
- **Agent_File**: one JSON file in `.kiro/agents/` (V3 format), with its prompt file in `.kiro/agents/prompts/`.
- **Coroner**: the agent `coroner`. **Exorcist_Agent**: the agent `exorcist`.
- **Power**: the folder `/power` in Kiro's Agent Plugins format: `plugin.json`, `mcp.json`, `skills/`, `server/`, `README.md`.
- **Skill**: a `skills/<name>/SKILL.md` with frontmatter `name` and `description`.
- **Config_Validator**: a pure function in `mcp/src/kiro-config/` that checks the shape of one kind of Kiro file and returns `{ ok: true }` or `{ ok: false, error: { path, message } }`.
- **Sabotage_List**: the test-suite convention of `proof-rules.md`: deliberately wrong implementations of the code under test, one list per property.
- **Real_Use**: the final task group, run by hand against `../lastrites-work/parse-server`, outside `npm test`.

## Requirements

### Requirement 1: Workspaces, dependencies and the programmatic entry

**User Story:** As a maintainer, I want the new packages wired into the repository the way the existing ones are, so that `npm test` and `npm run typecheck` cover them.

#### Acceptance Criteria

1. THE root `package.json` `workspaces` array SHALL be `["skeleton", "apps/*", "mcp", "power"]`, and no other field of it SHALL change except what Requirement 1.4 adds.
2. THE `mcp/package.json` SHALL declare the package `@last-rites/exorcist-mcp` (private, `type` module) with the scripts `typecheck`, `build`, `power:sync` and the four Hook_Script scripts of Requirement 12, and SHALL depend on `@last-rites/skeleton` and `@last-rites/exorcist-npm`.
3. THE `mcp/package.json` SHALL pin, as exact versions, `@modelcontextprotocol/sdk` `1.32.2`, `zod` `4.6.7` and (dev) `esbuild` `0.28.2`; no dependency of the new packages SHALL be an LLM client; any later dependency SHALL be an exact version.
4. THE root `vitest.config.ts` `include` SHALL gain `mcp/src/**/*.test.ts` and keep every existing pattern and its `setupFiles` entry, so the no-network guard also covers the new tests.
5. THE `power/package.json` SHALL declare the private package `@last-rites/exorcist-power` with no dependency and no script that is required by `npm run typecheck`.
6. THE `apps/exorcist-npm/package.json` `exports` SHALL gain `./programmatic` (the Programmatic_Entry) and `./programmatic/testing`, and SHALL keep `./report`; THE `scan/index.ts` and `evidence/index.ts` exports SHALL stay unchanged.
7. THE Programmatic_Entry SHALL only re-export existing symbols and add no logic, and SHALL include everything the Exorcist_Mcp imports from the app.
8. THE `skeleton` package SHALL NOT import anything from `mcp`, `power` or `apps`.
9. THE `.gitignore` SHALL gain the line `power/server/` (the built copy of the server); `mcp/dist/` is already covered by the existing `dist/` line.

### Requirement 2: Server, transport and tool registry

**User Story:** As a Kiro user, I want a standard MCP server, so that any MCP client can list and call the tools.

#### Acceptance Criteria

1. THE Exorcist_Mcp SHALL use the official MCP TypeScript SDK (`McpServer` and `StdioServerTransport`), SHALL declare the server name `exorcist` and a version taken from `mcp/package.json`, and SHALL expose exactly these tools: `scan_repo`, `death_report`, `usage_surface`, `find_replacement`, `generate_pin_tests`.
2. EACH Tool SHALL have a non-empty description, a `zod` input schema, and annotations: `readOnlyHint` true for the first four tools and false for `generate_pin_tests`; `destructiveHint` false for all; `openWorldHint` true for `scan_repo`, `death_report` and `find_replacement` and false for `usage_surface` and `generate_pin_tests`.
3. THE Exorcist_Mcp SHALL write to stdout only MCP protocol messages; WHILE it runs, `console.log`, `console.info` and `console.debug` SHALL write to stderr.
4. THE server construction SHALL take all Deps as one argument, `createExorcistServer(deps)`, SHALL read no environment variable and no `process.argv`, and SHALL do no I/O until a tool is called; ONLY `mcp/src/server.ts` (`main`) SHALL read the environment and wire the real Deps.
5. WHEN a tool call has arguments that the input schema rejects, THE Exorcist_Mcp SHALL return a Tool_Error with code `invalid_input` and SHALL NOT call any Dep.
6. THE Exorcist_Mcp SHALL handle each tool call independently, hold no state between calls beyond the injected caches, and SHALL NOT crash the process on any tool input.

### Requirement 3: Argument guards

**User Story:** As a maintainer, I want the tools to refuse bad input the way the Scan_Api does, so that a tool is not a way around a guard.

#### Acceptance Criteria

1. THE `classifyRepoArgument(input)` function SHALL be pure and total, SHALL return exactly one of `local`, `github`, `demo` or `invalid`, and SHALL classify as follows, in this order: a string starting with `/`, `./` or `../` is `local` (when non-empty after the prefix, at most 4096 UTF-16 code units, and without a NUL character); a string that is `owner/name` accepted by the Scan_Api repo pattern is `github`; a string equal to a Demo_Name is `demo`; anything else is `invalid` with code `invalid_repo`.
2. THE repo pattern SHALL be the Scan_Api's own: `REPO_PATTERN` of `scan/api/handler.ts` made an exported constant (no behavior change), and `parseRepoTarget` SHALL still validate owner, name and ref.
3. WHEN a `ref` is given, THE tool SHALL accept it only for a `github` argument and only if `parseRepoTarget` accepts it; for a `local` or `demo` argument a `ref` SHALL be a Tool_Error with code `invalid_ref`.
4. THE Npm_Name guard SHALL accept a name only if it matches `^(?:@[a-z0-9][a-z0-9._~-]*/)?[a-z0-9][a-z0-9._~-]*$` and has at most 214 characters; a violation SHALL be a Tool_Error with code `invalid_package`.
5. FOR `generate_pin_tests`, THE package SHALL additionally be a Proof_Name; a scoped name SHALL be a Tool_Error with code `invalid_package` and a message saying scoped packages are not supported by the proof harness.
6. WHEN a tool takes a `path`, THE path SHALL be a non-empty string of at most 4096 code units without a NUL; the tool SHALL resolve it against the server's working directory and SHALL require that it exists and is a directory, else a Tool_Error with code `invalid_path` (not a string, bad shape), `path_not_found` or `not_a_directory`.
7. FOR `generate_pin_tests`, THE `candidate` SHALL exist, be a regular file and have the extension `.js`, `.mjs` or `.cjs`, else a Tool_Error with code `invalid_candidate`; THE `runs` SHALL be an integer from 100 to 100000 (default 200), else `invalid_runs`; THE `out` SHALL pass `isProofOutPath` of the Proof_Cli, else `invalid_out`.
8. THE guards SHALL be decided before any Dep is called; a rejected input SHALL cause no network request, no file read other than the existence probes of 3.6 and 3.7, and no write.

### Requirement 4: `scan_repo`

**User Story:** As an agent, I want the scan of a repository as the same JSON the web app shows, so that I can reason about it without a second format.

#### Acceptance Criteria

1. THE `scan_repo` input SHALL be `{ repo: string, ref?: string }`.
2. WHEN the Repo_Argument is a Demo_Name, or is the `owner/name` of a `DEMO_REPOS` entry and no `ref` is given, THE tool SHALL read the snapshot with `createFsDemoStore`, SHALL accept it only if `parseReport` accepts it, and SHALL return the snapshot text; it SHALL make no network request and SHALL NOT call the scan pipeline.
3. IF the snapshot is missing or `parseReport` rejects it, THEN THE tool SHALL return a Tool_Error with code `demo_not_found` or `demo_invalid` and SHALL NOT fall back to a live scan.
4. WHEN the Repo_Argument is a Github_Repo (and not served by 4.2), THE tool SHALL run the same pipeline as the Scan_Api (`createScanRuntime`) with the validated `owner`, `repo` and `ref`, and SHALL return `serializeReport` of the report.
5. WHEN the Repo_Argument is a Local_Path, THE tool SHALL run `createScanPipeline` with the same evidence stage and a `RepoFileSource` that reads `package.json` and `package-lock.json` from that directory, and SHALL return `serializeReport` of the report.
6. WHEN the pipeline returns an error, THE tool SHALL return a Tool_Error whose `code` is `scan_failed` and whose message starts with the pipeline error code (`no_package_json`, `repo_fetch_failed`, `too_many_dependencies`, `scan_timeout`, and so on).
7. THE tool SHALL apply the Scan_Api's time limit (`DEFAULT_SCAN_API_CONFIG.timeoutSeconds`) and dependency limit (`maxDependencies`) to live and local scans.
8. THE success text SHALL be the Scan_Report as a single text item, and SHALL be accepted by `parseReport`.

### Requirement 5: `death_report`

**User Story:** As an agent, I want one package's score with all its parts and sources, so that I can explain a verdict without reading a whole report.

#### Acceptance Criteria

1. THE `death_report` input SHALL be `{ repo: string, package: string, ref?: string }` with the guards of Requirement 3.
2. THE tool SHALL obtain the Scan_Report exactly as `scan_repo` does (same routing, same limits) and SHALL select the dependency whose `name` equals `package`.
3. THE tool SHALL return a Scan_Report with that one dependency: `assembleReport` over the original `repo`, `ref`, `scannedAt` and warnings, with `scanned` set to the selected dependency and `skipped` empty, serialized with `serializeReport`; so the score, grade, parts, calibration, `signals`, `unknownReasons`, `replacement` and every source URL are the scanner's own values.
4. IF no dependency has that name, THEN THE tool SHALL return a Tool_Error with code `package_not_found`; IF the name is in `skipped`, THEN it SHALL return `package_skipped` and the skip reason.
5. THE success text SHALL be accepted by `parseReport`, and its `summary.total` SHALL be 1.

### Requirement 6: `usage_surface`

**User Story:** As an agent, I want every import and call of a package in a checkout, so that I know what a migration has to keep.

#### Acceptance Criteria

1. THE `usage_surface` input SHALL be `{ path: string, package: string }` with the guards of Requirement 3.
2. THE tool SHALL call `createUsageSurface({ fs: createNodeSourceFs() })` with the resolved path and the package, and SHALL NOT parse source itself.
3. THE success text SHALL be a Proof_Report with zero attempts, built only from the Usage_Surface result: `repo` the base name of the resolved path, `package`, `filesScanned`, `callSites`, `importSites` and `attempts` empty, serialized with `serializeProofReport`, and SHALL be accepted by `parseProofReport`.
4. WHEN the Usage_Surface result has warnings, THE tool SHALL add a second text item `{"warnings":[...]}` with the warnings in order, at most 50, and a final string `... and <n> more` when there are more.
5. THE output SHALL contain no absolute path and no timestamp.
6. WHEN `filesScanned` is 0, THE tool SHALL still succeed (the result says so); it SHALL NOT turn this into an error.

### Requirement 7: `find_replacement`

**User Story:** As an agent, I want to know whether the ecosystem has a known replacement, so that I do not invent one.

#### Acceptance Criteria

1. THE `find_replacement` input SHALL be `{ package: string }` with the Npm_Name guard.
2. THE tool SHALL call `fetchE18e` (the evidence source for e18e `module-replacements`) through the same disk cache and resilient client as the evidence stage, and SHALL NOT call any other source.
3. WHEN the source reports a match, THE success text SHALL be `{"package":"<name>","replacement":{ReplacementInfo},"sourceUrl":"<url>"}`, with `ReplacementInfo` exactly as the source returned it (`type`, optional `replacement`, `replacements`).
4. WHEN the source reports every manifest retrieved and no match, THE success text SHALL be `{"package":"<name>","replacement":"none","sourceUrl":"<url>"}`.
5. IF the source reports a failure (a manifest could not be retrieved), THEN THE tool SHALL return a Tool_Error with code `evidence_unavailable`, and SHALL NOT report `none`.
6. THE output SHALL be a single text item of JSON with keys in that order.

### Requirement 8: `generate_pin_tests`

**User Story:** As an agent, I want to run the proof harness on my candidate and read the honest result, so that "done" always means proved.

#### Acceptance Criteria

1. THE `generate_pin_tests` input SHALL be `{ path: string, package: string, candidate?: string, runs?: number, out?: string }` with the guards of Requirement 3; `candidate` is required when the package has call sites.
2. THE tool SHALL call `exorcise` of the Proof_Cli (`apps/exorcist-npm/src/exorcise/run.ts`) with the real `createUsageSurface`, `RECIPES`, an oracle loader with static imports of the same two pinned packages (so it works inside the bundle) whose modules and versions a test compares with the app's `loadOracle`, and `loadCandidate`, `runs` (default 200), the fixed default seed 20261113, the label equal to the base name of the resolved path, and no commit; the recipe, differential run and sabotage check are therefore the harness's own.
3. WHEN `out` is absent, THE tool SHALL use an in-memory `ReportFs` that finds no existing report and keeps the written text in memory, so that no file is created or changed anywhere.
4. WHEN `out` is given, THE tool SHALL use the node `ReportFs` with that path, so that `exorcise` validates the existing report, appends one attempt and writes atomically; the only paths touched SHALL be `out` and its temporary sibling in the same directory.
5. THE success text SHALL be the Proof_Report text (the in-memory one, or the file just written), accepted by `parseProofReport`, followed by a second text item with the summary lines `exorcise` printed.
6. THE Proof_Report SHALL contain the attempt for this run whatever its status (`proved`, `counterexample`, `no-call-sites` or `error`); a counterexample SHALL be a successful tool call, not a Tool_Error.
7. WHEN `exorcise` returns exit 2, THE tool SHALL return a Tool_Error `usage_error` with its message; WHEN it returns exit 1, `proof_failed` with its message.
8. THE tool SHALL load the Candidate so that a file edited between two calls is loaded again: `loadCandidate` gains an optional second argument `cacheBust` (no change in behavior when absent), and the tool passes the first 16 hex digits of the SHA-256 of the Candidate source text.
9. THE tool SHALL NOT read or write any path other than: the Candidate file and the modules it imports; the target directory (read only); and `out`.

### Requirement 9: Tool results and errors

**User Story:** As a client developer, I want every tool to answer in the same shape, so that I handle success and failure in one place.

#### Acceptance Criteria

1. EVERY successful Tool_Result SHALL have `isError` absent or false and at least one text item; the first text item SHALL be the tool's canonical output.
2. EVERY Tool_Error SHALL have `isError` true and exactly one text item, a JSON object `{"error":{"code":"<code>","message":"<text>"}}` whose `code` is one of the codes listed in `design.md` and whose `message` is non-empty.
3. A Tool_Error message SHALL NOT contain a stack trace, the value of an environment variable, or a GitHub token; WHEN an unexpected exception is caught, THE message SHALL be the fixed text `unexpected error` and the code `internal_error`.
4. THE server SHALL NOT throw from a tool handler for any input, including non-object arguments and hostile strings (`__proto__`, NUL, very long strings).
5. THE tools SHALL be deterministic for fixed Deps: the same arguments and the same Deps responses give byte-identical text.

### Requirement 10: Build, run and stdio behavior

**User Story:** As a user, I want one built file that I can start with `node`, so that the Power and the settings point at something real.

#### Acceptance Criteria

1. THE `build` script of `mcp` SHALL bundle `mcp/src/server.ts`, its workspace imports, `typescript`, `fast-check` and the two pinned oracles (through static imports) with `esbuild` into the single ESM file `mcp/dist/server.mjs`, target Node 22, SHALL copy the top-level `demo/*.json` snapshots to `mcp/dist/demo/`, and SHALL copy both to `power/server/` (`exorcist-mcp.mjs` and `demo/`); the server reads its demo snapshots from the `demo/` folder next to the running file.
2. THE bundle SHALL start with `node mcp/dist/server.mjs`, complete the MCP `initialize` handshake over stdio, and answer `tools/list` with the five tools of Requirement 2.1, with no network access and no environment variable set.
3. THE server `main` SHALL build the evidence configuration with `configFromEnv(env, cacheRoot)` where `cacheRoot` is `EXORCIST_CACHE_DIR` when set and otherwise `<os temp dir>/exorcist-mcp`; the optional `GITHUB_TOKEN` SHALL be passed only through `configFromEnv`.
4. THE server SHALL write nothing to the working directory except through `generate_pin_tests` `out`; the disk cache SHALL be confined to `cacheRoot`.
5. WHEN stdin closes, THE server SHALL exit with code 0.
6. THE build SHALL be reproducible offline once the dependencies are installed.

### Requirement 11: Workspace settings

**User Story:** As a Kiro user in this repository, I want the server registered, so that I can call it without setup.

#### Acceptance Criteria

1. THE Workspace_Settings (`.kiro/settings/mcp.json`) SHALL have the single server `exorcist` under `mcpServers`, with `command` `node`, `args` `["mcp/dist/server.mjs"]`, `disabled` false, and `autoApprove` exactly `["scan_repo","death_report","usage_surface","find_replacement"]`; `generate_pin_tests` SHALL NOT be auto-approved.
2. THE entry SHALL contain no secret value; `env` MAY contain `"GITHUB_TOKEN": "${GITHUB_TOKEN}"` (a reference, never a value).
3. THE Config_Validator for MCP settings SHALL pass for this file, and a test SHALL assert that `args[0]` is the path the `build` script writes.

### Requirement 12: Hooks

**User Story:** As a developer, I want automation that fires while I work, so that regressions show up when I cause them.

#### Acceptance Criteria

1. THE repository SHALL contain exactly four Hook_Files in `.kiro/hooks/`: `scan-deps-on-save.json`, `death-score-monotonic-on-save.json`, `check-on-stop.json`, `candidate-proof-on-save.json`, each `version` `v1`, with one hook, a `name`, a short `description` and a `timeout`.
2. `scan-deps-on-save`: trigger `PostFileSave`, `matcher` matching a path ending in `package.json` or `package-lock.json` (and not a path with a `node_modules` segment), command: the Hook_Script `hook:scan-deps`, which scans this repository and warns about packages that are `dead` now and were not in the Dead_Baseline.
3. `death-score-monotonic-on-save`: trigger `PostFileSave`, `matcher` matching `skeleton/src/death-score/` files `weights.ts`, `severity.ts` and `grade.ts` (and not tests), command: the Hook_Script `hook:monotonic`, which re-runs only the monotonicity property test of `skeleton/src/death-score/properties.test.ts` and prints its result.
4. `check-on-stop`: trigger `Stop` (no matcher), command: the Hook_Script `hook:stop-check`, which runs `npm run typecheck` and `npx vitest --run --changed` and prints a summary.
5. `candidate-proof-on-save`: trigger `PostFileSave`, `matcher` matching a `.js` file under `demo/proofs/candidates/`, command: the Hook_Script `hook:candidate-proof`, which re-runs the proof for that candidate with no `out` (nothing is written) and prints the status.
6. EVERY Hook_Script SHALL exit 0 whatever happens (a failed check, a missing checkout, no network, a parse error), SHALL print what it found on stdout, and SHALL append one line to the Fired_Log.
7. THE Hook_Files SHALL pass the Config_Validator for hooks, and the `matcher` of each SHALL compile as a regular expression and match the paths listed in this requirement and none of the paths listed as excluded.

### Requirement 13: Hook scripts and their pure helpers

**User Story:** As a maintainer, I want the logic of the hooks in small tested functions, so that a hook is not a shell one-liner nobody checked.

#### Acceptance Criteria

1. THE `newDeadPackages(baseline, report)` function SHALL return the names graded `dead` in the Scan_Report that are not in the baseline, sorted in UTF-16 code-unit order, without duplicates; and `deadNames(report)` SHALL return all names graded `dead`, sorted.
2. THE `hook:scan-deps` script SHALL scan the repository root with the same code as `scan_repo` for a Local_Path, read the Dead_Baseline when it exists (an absent or unreadable baseline is the empty set), print one `WARNING: new dead package: <name> (score <n>)` line per new dead package, print `no new dead packages` otherwise, and then write the new Dead_Baseline; WHEN the scan fails (for example, no network) it SHALL print `scan failed: <code>`, leave the baseline unchanged and exit 0.
3. THE `candidateTarget(path)` function SHALL map a path ending in `demo/proofs/candidates/<repo>/<file>.js` to `{ repo, package }` where `<repo>` is a Proof_Name, `<file>` is `<package>.<anything>.js` and `<package>` is a Proof_Name; it SHALL return `undefined` for any other path, for a path with a `..` segment, and for any name that is not a Proof_Name.
4. THE `hook:candidate-proof` script SHALL read the Hook JSON from stdin, take the saved file path from it, apply `candidateTarget`, locate the target checkout at `<repository root>/../lastrites-work/<repo>`, and WHEN the checkout exists run the same code as `generate_pin_tests` with no `out` and print one status line and, for a counterexample, the shrunk input; WHEN it does not exist it SHALL print `skipped: no checkout at <path>`.
5. THE `formatStopSummary(typecheck, tests)` function SHALL return a text whose first line is `check: PASS` exactly when both exit codes are 0 and `check: FAIL` otherwise, followed by one line per failed step with at most 20 lines of that step's output tail, each line at most 200 code units; the total SHALL NOT exceed 4000 code units.
6. THE `formatFiredLine(now, hookId, outcome)` function SHALL return `<ISO 8601 time> <hookId> <outcome>` with the outcome one of `ok`, `warn`, `fail` or `skipped`.
7. THE helpers SHALL be pure; the scripts SHALL take the clock, the file system and the process runner as injected arguments, and ONLY the script entry files SHALL read `process.argv`, `process.env` or stdin.

### Requirement 14: Custom agents

**User Story:** As a user, I want one agent that can only look and one that can fix, so that investigation cannot change my code.

#### Acceptance Criteria

1. THE repository SHALL contain `.kiro/agents/coroner.json` and `.kiro/agents/exorcist.json` with their prompts in `.kiro/agents/prompts/coroner.md` and `.kiro/agents/prompts/exorcist.md`, referenced as `file://./prompts/<name>.md`; the old `.gitkeep` SHALL stay.
2. THE Coroner SHALL have `tools` exactly `["read", "@exorcist/scan_repo", "@exorcist/death_report", "@exorcist/usage_surface", "@exorcist/find_replacement"]`, `includeMcpJson` false, an inline `mcpServers.exorcist` entry equal to the Workspace_Settings entry, and `permissions.rules` that allow only `fs_read` and the four `mcp` tools and deny `fs_write`, `shell`, `web_fetch` and the tool `generate_pin_tests`.
3. THE Coroner prompt SHALL tell it to gather death evidence and call sites, to cite the sources that tools return, to never edit anything, and to say plainly when a tool failed or evidence is unknown.
4. THE Coroner SHALL have no capability that writes: no `write`, `shell`, `*` or `@builtin` selector in `tools`, no `allow` rule for `fs_write`, `shell`, `web_fetch` or `subagent`, and no `@exorcist` selector without a tool name.
5. THE Exorcist_Agent SHALL have `tools` including `read`, `write`, `shell` and `@exorcist`, `includeMcpJson` false, the same inline `mcpServers.exorcist` entry, resources `file://.kiro/steering/migration-rules.md` and `file://.kiro/steering/proof-rules.md` (workspace-relative), and `permissions.rules` that allow `fs_read`, `fs_write` limited to `demo/proofs/candidates/**` and `../lastrites-work/**`, `shell` limited to commands starting with `npm`, `npx`, `node`, `git` and `ls`, and the five `mcp` tools, and that deny `shell` commands matching `git push*`, `git remote*` and `git config*`.
6. THE Exorcist_Agent prompt SHALL follow `migration-rules.md` and `proof-rules.md`, SHALL work on a new local branch, SHALL never push, SHALL write its candidate under `demo/proofs/candidates/<repo>/<package>.agent.js`, SHALL call `generate_pin_tests` before declaring a migration done, SHALL report the Proof_Report status and the `weak` flag exactly as returned, and SHALL treat a counterexample as not done, without weakening a test, a recipe or a Projection.
7. THE agent files SHALL pass the Config_Validator for agents, and a test SHALL assert 14.2 and 14.4 with the privilege checker of Property 9, and 14.5 for the deny rules.
8. THE agent files SHALL NOT use the CLI 2.x fields `allowedTools`, `toolsSettings` or `toolAliases`.

### Requirement 15: Power

**User Story:** As another team, I want to install Last Rites into my workspace from a folder, so that my Kiro can scan and prove.

#### Acceptance Criteria

1. THE Power SHALL contain `plugin.json`, `mcp.json`, `skills/migration-rules/SKILL.md`, `skills/proof-rules/SKILL.md` and `README.md`; the built server `server/exorcist-mcp.mjs` is generated by the `build` script and is ignored by git.
2. THE `plugin.json` SHALL have `$schema` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`, `name` `exorcist`, a semver `version`, a `description`, `author` with a `name`, and `keywords`; no other field except `license`.
3. THE Power `mcp.json` SHALL have `$schema` `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json` and one server `exorcist` with `type` `stdio`, `command` `node`, `args` `["server/exorcist-mcp.mjs"]` and no secret value; its `args[0]` SHALL equal the path the `build` script copies the bundle to.
4. EACH Skill SHALL have frontmatter with `name` (equal to its folder name) and a `description` that says when to use it, and a body equal to the body of the steering file it comes from (steering frontmatter removed).
5. THE `skillFromSteering(steeringText, meta)` function SHALL be pure, and `power:sync` SHALL write both skills with it; a test SHALL fail when a committed Skill differs from what `skillFromSteering` makes of the current steering file.
6. THE README SHALL explain, with the commands: build the server; install the Power from a folder in the Kiro IDE (Powers panel, "Add Custom Power", import from a folder) and with `kiro-cli powers install <path>`; what the five tools do; that `generate_pin_tests` executes the candidate file; the optional `GITHUB_TOKEN` and `EXORCIST_CACHE_DIR`; and the limits (npm and `package-lock.json` only, direct calls only).
7. THE Power SHALL NOT use the legacy `POWER.md`, and SHALL NOT be published to any registry.

### Requirement 16: Config validators

**User Story:** As a maintainer, I want every Kiro file in this change checked by a test, so that a typo in a hook or an agent is a red test, not a silent no-op.

#### Acceptance Criteria

1. THE `mcp/src/kiro-config/` folder SHALL contain a Config_Validator for each of: hook files, agent files, MCP settings (`.kiro/settings/mcp.json`), the Power `plugin.json`, the Power `mcp.json`, and Skill files, each following the field lists of `design.md`, "Kiro formats used".
2. EACH validator SHALL be pure and total (never throw, for any input including non-JSON text), SHALL report the path of the first offending field, and SHALL reject unknown fields, wrong types, missing required fields and (for hooks) an unknown trigger, a `matcher` that does not compile, a `command` action without `command` and an `agent` action without `prompt`.
3. A test SHALL run each validator on the real file(s) of this repository and assert `ok`.
4. THE validators SHALL not claim to prove that Kiro accepts a file; `design.md` records which fields were taken from the documentation and which were not confirmed.

### Requirement 17: Real use (final task group, manual)

**User Story:** As the author of the demo, I want the integration used for real on parse-server, and the outcomes written down as they were.

#### Acceptance Criteria

1. THE final group SHALL run outside `npm test`, SHALL never push, and SHALL start with a read-only preflight of `../lastrites-work/parse-server` (HEAD, branch, `git status --short`, remotes) recorded in the log.
2. THE group SHALL build the server, confirm `kiro-cli --version`, and run `kiro-cli chat --v3 --agent coroner --no-interactive --require-mcp-startup` from this repository against `../lastrites-work/parse-server` for `deep-diff`; IF `KIRO_API_KEY` (needed for non-interactive runs) is not available, THEN the group SHALL stop and record that the run was NOT RUN and why, and SHALL NOT substitute another way of producing a transcript.
3. THE group SHALL save the raw transcript outside git (`.cache/kiro-runs/`) and a transcript summary in `docs/kiro-log.md`: the command, the exit code, which tools the agent called, what evidence it reported, whether it stayed read only (a `git status --short` of both repositories before and after), and anything that went wrong.
4. THE group SHALL create a new local branch in `../lastrites-work/parse-server`, run the Exorcist_Agent to migrate `intersect` there, with its candidate written to `demo/proofs/candidates/parse-server/intersect.agent.js`, and `generate_pin_tests` called with `out` set to `demo/proofs/parse-server/intersect.json` BEFORE the target source is edited (the existing report's usage surface must still match the checkout).
5. THE group SHALL record every attempt's status in the log (attempt number, `status`, `weak`, seed, the shrunk counterexample if any, the sabotage line), and SHALL record whether the attempt was appended to `intersect.json` or refused by the harness (and why); the group SHALL NOT edit `intersect.json` by hand.
6. IF the Exorcist_Agent's last attempt is a counterexample or an error, THEN THE group SHALL record the migration as not done and SHALL NOT apply or keep a migration in the target; IF it is proved, THEN THE log SHALL say whether it is weak and which mutants survived.
7. THE group SHALL verify after the run that the target has no commit on a remote-tracking branch from this work (`git -C ... status -sb`, `git log origin/<base>..HEAD` is local only), that no push happened (the branch has no upstream), and that the base branch is unchanged.
8. THE group SHALL record which of the four hooks fired during the build, with dates, from the Fired_Log and the session, and SHALL write `did not fire` for a hook with no line.
9. THE group SHALL record in the log everything that differs from what this spec expected, including format fields that Kiro rejected or ignored (Requirement 16.4).
10. THE group SHALL leave all generated files in the working tree and make no commit.

### Requirement 18: Offline tests, properties and sabotage lists

**User Story:** As a maintainer, I want the integration proven by tests that can fail and need no network.

#### Acceptance Criteria

1. THE tests SHALL make no network request, run no LLM, read nothing outside this repository, and no test file SHALL contain the string `lastrites-work` (the hook script takes the sibling directory name as an injected constant, and its test passes a fake one); they SHALL use recorded fixtures and fakes (`FakeHttp`, fake clock and sleep, in-memory `SourceFs` and `ReportFs`).
2. THE test suite SHALL include one fast-check property, `numRuns` 100, for each of these thirteen subjects: (1) argument guards and routing, (2) output contract with the existing validators, (3) thin-wrapper equivalence, (4) tool totality, (5) write confinement, (6) determinism, (7) demo routing, (8) Config_Validators, (9) agent privilege, (10) new dead packages, (11) candidate path mapping, (12) hook output formatting, (13) skill generation.
3. THE test suite SHALL contain one Sabotage_List per property in `mcp/src/test-support/sabotage/kiro-p1.ts` to `kiro-p13.ts`, and one central test `mcp/src/sabotage.test.ts` that runs each property against every entry with the fixed seed 20261113 and fails with `Sabotage "<name>" stayed green for "<property>"`.
4. THE properties SHALL use the seed policy of `skeleton/src/death-score/fc-runner.ts` (`FC_SEED` wins, `CI` fixes the seed, seed and shrunk counterexample printed on failure), and each property file SHALL export `build(impl)` so the central test can swap the implementation.
5. THE Sabotage_Lists SHALL include at least: for property 2, a tool that returns non-canonical JSON; for property 3, a tool that adds a field the wrapped code does not return; for property 5, a tool that writes next to `out`; for property 9, a checker that ignores an `@exorcist` selector without a tool name; for property 11, a mapping that accepts `..`.
6. THE tests SHALL include one end-to-end test that builds the bundle into a temporary directory and talks to it over stdio (Requirement 10.2), and one that proves the stdout of the protocol stays clean when a candidate prints with `console.log`.
7. THE suite SHALL pass `npm run typecheck` with zero errors and `npm test` plain and with `CI=1`.

### Requirement 19: Scope limits

**User Story:** As a maintainer, I want this change to add integration only.

#### Acceptance Criteria

1. THE change SHALL NOT alter the death-score engine, the evidence stage, the scan pipeline's behavior, the proof harness's logic, the recipes, the web app or any existing test expectation; the permitted edits to existing source files are: the new `exports` of `apps/exorcist-npm/package.json`, the new files `programmatic.ts` and `programmatic-testing.ts`, exporting `REPO_PATTERN` from `scan/api/handler.ts`, the optional `cacheBust` argument of `loadCandidate`, the root `package.json` and `vitest.config.ts`, and `.gitignore`.
2. THE change SHALL NOT publish the Power, SHALL NOT add a network call to any test, and SHALL NOT add an LLM call anywhere in the product.
3. Out of scope: Windows paths, HTTP/SSE transports, MCP resources and prompts, OAuth, tools for the GitHub Actions scanner, writing the migration into the target by a tool (the Exorcist_Agent does that with its own file tools), and a Kiro IDE-specific manual check of the Power install (recorded in the log as done or NOT RUN).
