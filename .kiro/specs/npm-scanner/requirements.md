# Requirements Document

## Introduction

The Npm_Scanner is the scan component of `/apps/exorcist-npm`. Given a public GitHub repository (`owner/repo`, optional ref), it produces a deterministic Scan_Report: the repository's direct npm dependencies, each with its evidence, death score, grade, and replacement info, sorted most-dead first. It has four parts:

1. The Inventory_Stage, a pure function that turns `package.json` and an optional `package-lock.json` into a list of dependencies to scan and a list of skipped specifiers. This is the `inventory` stage of the npm adapter.
2. The Repo_Fetcher, which downloads the two files from GitHub through the existing cached ResilientClient.
3. The Scan_Pipeline, which runs inventory, then the existing Npm_Evidence_Stage per dependency with bounded concurrency, then `scoreDeath`, and assembles the Scan_Report.
4. The Scan_Api, a small Node HTTP handler that the graveyard UI and the MCP server call later, plus a manual Demo_Snapshot_Script that writes pre-scanned reports to `/demo`.

v1 scans the root `package.json` only. Workspaces and monorepo packages are out of scope: a `workspaces` field is ignored and produces a warning. Yarn and pnpm lockfiles, private repositories, transitive dependencies, the UI, and the MCP server are also out of scope.

This spec reuses and never redeclares these existing types and functions: `PackageSignals`, `SignalName`, `GradeBand`, `DeathScoreResult`, and `scoreDeath` from `@last-rites/skeleton`; and `createEvidenceStage`, `EvidenceResult`, `EvidenceConfig`, `ReplacementInfo`, `UnknownReason`, `HttpClient`, `ResilientClient`, `CacheLayer`, and `Clock` from `apps/exorcist-npm/src/evidence`. The evidence spec exports no `inventory` stage; this spec adds it. The hosted app and the tests make no LLM calls, and the tests make no network requests.

Behavioral decisions fixed here, so design does not have to guess:

- Source of repo files: `raw.githubusercontent.com`. It needs no token, has no GitHub REST API rate limit to spend on a scan, and returns the file bytes directly, so one cached GET fetches one file. An omitted ref resolves to `HEAD`, the default branch.
- A name that appears in several dependency kinds yields one Dependency_Entry (see Requirement 2).
- The lockfile version wins over the declared range (see Requirement 3).

## Glossary

- **Npm_Scanner**: the system specified here, made of the Inventory_Stage, Repo_Fetcher, Scan_Pipeline, Scan_Api, and Demo_Snapshot_Script.
- **Inventory_Stage**: the pure function that maps a Manifest_Text and an optional Lockfile_Text to an Inventory_Result.
- **Repo_Fetcher**: the module that downloads `package.json` and `package-lock.json` for a Repo_Target.
- **Scan_Pipeline**: the module that runs the Repo_Fetcher, the Inventory_Stage, the Npm_Evidence_Stage, and `scoreDeath`, and returns a Scan_Outcome.
- **Scan_Api**: the Node HTTP handler exposing `POST /api/scan` and `GET /api/demo/:name`.
- **Demo_Snapshot_Script**: the manual script that scans a named list of repositories and writes `/demo/<name>.json`.
- **Npm_Evidence_Stage**: the function returned by `createEvidenceStage`; it produces an EvidenceResult for one package name and optional version range.
- **Repo_Target**: `{ owner, repo, ref }` where `ref` is the requested ref or `HEAD` when none is requested.
- **Manifest_Text**: the raw text of the root `package.json`.
- **Lockfile_Text**: the raw text of the root `package-lock.json`.
- **Dependency_Kind**: one of `dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies`.
- **Kind_Precedence**: the fixed order `dependencies`, `optionalDependencies`, `devDependencies`, `peerDependencies`.
- **Declared_Range**: the specifier string a Dependency_Kind maps a name to in `package.json`.
- **Registry_Specifier**: a Declared_Range that resolves through the npm registry: a semver range, a dist-tag, `*`, or the empty string.
- **Unscannable_Specifier**: a Declared_Range that is not a Registry_Specifier: it starts with `npm:`, `git:`, `git+`, `github:`, `file:`, `link:`, `http:`, `https:`, `workspace:`, or `portal:`, or has the `owner/repo` GitHub shorthand form. It also includes bare file paths (reason `file`), `gitlab:`, `bitbucket:`, `gist:`, `ssh:` and scp-like git forms (reason `git`), and `portal:` (reason `other`).
- **Dependency_Entry**: one scannable dependency in the Inventory_Result, with `name`, `kinds` (all kinds the name appears in, in Kind_Precedence order), `declaredRange`, optional `resolvedVersion`, and `versionSource` (`lockfile` or `range`).
- **Skipped_Entry**: `{ name, kind, specifier, reason }` for a dependency whose chosen specifier is an Unscannable_Specifier. The `reason` is one of `npm_alias`, `git`, `file`, `link`, `http`, `workspace`, or `other`.
- **Inventory_Result**: the Inventory_Stage output: `dependencies` (Dependency_Entry list), `skipped` (Skipped_Entry list), `warnings`, and `lockfile` (`used` or `absent`).
- **Inventory_Error**: a typed error value `{ code, message }` returned by the Inventory_Stage, with `code` one of `malformed_package_json` or `invalid_package_json_shape`.
- **Scanned_Dependency**: the report entry for one Dependency_Entry: the Dependency_Entry fields plus `signals` (PackageSignals), `unknownReasons`, optional `replacement` (ReplacementInfo), `evidenceWarnings`, and `death` (DeathScoreResult).
- **Scan_Report**: `{ repo, ref, scannedAt, dependencies, skipped, warnings, summary }`, where `repo` is `owner/repo`, `ref` is the Repo_Target ref, `scannedAt` is an ISO 8601 string from the injected Clock, `dependencies` is a list of Scanned_Dependency, and `summary` holds `total`, `skipped`, and one count per GradeBand.
- **Scan_Outcome**: either `{ ok: true, report }` or `{ ok: false, error }`, where `error` is a Scan_Error.
- **Scan_Error**: a typed error value `{ code, message }`, with `code` one of `invalid_repo`, `invalid_ref`, `no_package_json`, `malformed_package_json`, `invalid_package_json_shape`, `too_many_dependencies`, `repo_fetch_failed`, `scan_timeout`, or `internal_error`.
- **Canonical_Json**: the Scan_Report serialization with object keys in a fixed documented order and two-space indentation, ending in one newline.
- **Max_Dependencies**: 300, the maximum number of distinct names in the root `package.json` across all Dependency_Kinds.
- **Scan_Api_Config**: the configuration object for the Scan_Api: port (default 24817), per-IP scan rate-limit window and limit (default 10 per 60 seconds), per-IP demo rate-limit window and limit (default 120 per 60 seconds), request and scan timeout (default 60 seconds), `trustProxy` flag, demo directory, and Max_Dependencies.
- **Clock**: the injected time source exported by `apps/exorcist-npm/src/evidence`.
- **Test_Support**: the existing helpers FakeHttp, fake-clock, fake-sleep, temp-cache, fc-runner, sabotage-runner, stage-harness, the `createRecorder` recorder pattern in `record-fixtures.ts`, and `no-network.setup.ts`.

## Requirements

### Requirement 1: Parse package.json into dependencies

**User Story:** As a developer, I want every dependency in my `package.json` read with its kind and declared range, so that the scan covers what I actually declared.

#### Acceptance Criteria

1. WHEN a Manifest_Text that is a JSON object is provided, THE Inventory_Stage SHALL read the `dependencies`, `devDependencies`, `optionalDependencies`, and `peerDependencies` fields, each a JSON object mapping name to Declared_Range, SHALL treat an absent field as empty, and SHALL record each name with the Dependency_Kind of the field it came from and its Declared_Range string unchanged.
2. IF the Manifest_Text is not parseable as JSON (including empty or whitespace-only text), THEN THE Inventory_Stage SHALL return an Inventory_Error with code `malformed_package_json`, SHALL NOT throw, and SHALL return no Inventory_Result.
3. IF the Manifest_Text is valid JSON but is not an object (including an array, string, number, boolean, or null), or a dependency field is present and is not an object (including an array or null), or a Declared_Range is not a string, THEN THE Inventory_Stage SHALL return an Inventory_Error with code `invalid_package_json_shape` whose message identifies the offending field or dependency name, SHALL NOT throw, and SHALL return no Inventory_Result.
4. WHEN the Manifest_Text contains a `workspaces` field of any value, THE Inventory_Stage SHALL ignore the field and SHALL add exactly one warning to the Inventory_Result stating that workspaces are not scanned in v1.
5. WHEN the Manifest_Text contains zero dependencies in every Dependency_Kind, THE Inventory_Stage SHALL return an Inventory_Result with empty `dependencies` and empty `skipped`, and SHALL NOT return an error.
6. THE Inventory_Stage SHALL perform no I/O and SHALL read neither the system clock nor the environment.
7. WHEN the same Manifest_Text and Lockfile_Text are provided twice, THE Inventory_Stage SHALL return deep-equal Inventory_Result values, including identical ordering of `dependencies`, `skipped`, and `warnings`.

### Requirement 2: One entry per name, with skipped specifiers

**User Story:** As a developer, I want each package listed once, and non-registry specifiers set aside with a reason, so that nothing is scored against the wrong package or silently dropped.

#### Acceptance Criteria

1. WHEN a name appears in more than one Dependency_Kind, THE Inventory_Stage SHALL produce exactly one entry for that name, SHALL list every kind the name appears in under `kinds` in Kind_Precedence order with no duplicates, and SHALL take the Declared_Range from the first kind in Kind_Precedence that lists the name.
2. WHEN the chosen Declared_Range of a name is a Registry_Specifier, THE Inventory_Stage SHALL place the name in `dependencies` as a Dependency_Entry and SHALL NOT place the name in `skipped`.
3. WHEN the chosen Declared_Range of a name is an Unscannable_Specifier, THE Inventory_Stage SHALL place the name in `skipped` as a Skipped_Entry carrying the first kind in Kind_Precedence that lists the name, the specifier, and exactly one reason from `npm_alias`, `git`, `file`, `link`, `http`, `workspace`, or `other`, and SHALL NOT place the name in `dependencies`.
4. THE Inventory_Stage SHALL place every distinct name found in the four Dependency_Kinds in exactly one of `dependencies` or `skipped`, so that the count of `dependencies` plus the count of `skipped` equals the count of distinct names.
5. THE Inventory_Stage SHALL return `dependencies` and `skipped` each sorted by name in ascending UTF-16 code-unit order.
6. WHEN a Skipped_Entry is produced for a name, THE Scan_Pipeline SHALL make zero Npm_Evidence_Stage calls for that name.
7. WHEN a name appears in more than one Dependency_Kind and those kinds carry different Declared_Range values, THE Inventory_Stage SHALL add exactly one warning for that name identifying the package name, the kind whose Declared_Range was used, and each ignored kind whose Declared_Range differs.
8. IF a name appears in more than one Dependency_Kind and all kinds carry identical Declared_Range values, THEN THE Inventory_Stage SHALL add no warning for that name.

### Requirement 3: Lockfile precedence

**User Story:** As a developer, I want the version I actually have installed to be the one that is judged, so that a loose range does not hide or invent problems.

#### Acceptance Criteria

1. WHERE a Lockfile_Text with `lockfileVersion` 2 or 3 is provided, WHEN its `packages` map contains the key `node_modules/<name>` for a Dependency_Entry with a string `version` that is a valid semver version, THE Inventory_Stage SHALL set `resolvedVersion` to that `version` and `versionSource` to `lockfile`, regardless of the Declared_Range.
2. WHEN no usable lockfile version exists for a Dependency_Entry, THE Inventory_Stage SHALL leave `resolvedVersion` absent and set `versionSource` to `range`.
3. IF the lockfile entry for `node_modules/<name>` has `link: true`, has a `name` field different from the dependency name, or has no valid semver `version`, THEN THE Inventory_Stage SHALL treat the lockfile entry as unusable for that dependency, SHALL apply criterion 2 to that Dependency_Entry, and SHALL NOT add a warning for the unusable entry.
4. IF a lockfile `version` does not satisfy the Declared_Range, THEN THE Inventory_Stage SHALL still use the lockfile version and SHALL add exactly one warning per affected Dependency_Entry containing the package name, the lockfile version, and the Declared_Range.
5. IF the Lockfile_Text is not parseable as JSON, is not a JSON object, or has no `packages` map that is a JSON object, THEN THE Inventory_Stage SHALL treat the lockfile as absent, SHALL set `lockfile` to `absent`, SHALL set every `versionSource` to `range`, SHALL add one warning stating which of the three reasons applies, and SHALL NOT throw.
6. IF the Lockfile_Text parses as a JSON object and its `lockfileVersion` is 1, is missing, or is any value other than 2 or 3, THEN THE Inventory_Stage SHALL treat the lockfile as absent, SHALL set `lockfile` to `absent`, SHALL set every `versionSource` to `range`, SHALL add one warning stating that the lockfile version is unsupported and naming the value found, and SHALL NOT throw.
7. WHEN no Lockfile_Text is provided, THE Inventory_Stage SHALL set `lockfile` to `absent`, SHALL set every `versionSource` to `range`, and SHALL add one warning stating that no lockfile was found and that results use declared ranges.
8. WHERE a Lockfile_Text is used, THE Inventory_Stage SHALL ignore lockfile entries whose names are not direct dependencies in the Manifest_Text, and SHALL NOT include them in the output or in any warning.

### Requirement 4: Fetch repository files

**User Story:** As a developer, I want to scan a public GitHub repo by name, so that I do not have to upload files.

#### Acceptance Criteria

1. WHEN a Repo_Target with a valid owner, repo, and ref is provided, THE Repo_Fetcher SHALL request `package.json` from `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/package.json` and `package-lock.json` from the same base through the ResilientClient and CacheLayer, with no GitHub token attached to either request.
2. WHEN a Repo_Target is provided with no ref, THE Repo_Fetcher SHALL use `HEAD` as the ref.
3. IF the `package.json` request returns HTTP 404, THEN THE Scan_Pipeline SHALL return a Scan_Outcome with Scan_Error code `no_package_json` and SHALL make no further requests for that scan. This also covers a private or nonexistent repository, which raw.githubusercontent.com reports as 404.
4. IF the `package.json` request fails for any reason other than HTTP 404 (network error, timeout, rate limit, or server error) after the ResilientClient has exhausted its retries, THEN THE Scan_Pipeline SHALL return a Scan_Outcome with Scan_Error code `repo_fetch_failed` and a `failureCategory` of `network_error`, `timeout`, or `rate_limited`, using the same categories as the Npm_Evidence_Stage FailureCategory.
5. IF the `package-lock.json` request returns HTTP 404, THEN THE Scan_Pipeline SHALL continue the scan with no Lockfile_Text and SHALL add no warning for the 404 beyond the Inventory_Stage warning that no lockfile was found.
6. IF the `package-lock.json` request fails for any reason other than HTTP 404, THEN THE Scan_Pipeline SHALL continue the scan with no Lockfile_Text and SHALL add exactly one warning to the Scan_Report naming the failure category (`network_error`, `timeout`, or `rate_limited`).
7. THE Repo_Fetcher SHALL perform every external request through the injected HttpClient, so that the test suite supplies FakeHttp and makes zero real network requests.
8. IF the owner does not match the GitHub owner rule (letters, digits, and hyphens, 1 to 39 characters) or the repo does not match the GitHub repo rule (letters, digits, `.`, `_`, and `-`, 1 to 100 characters, and not `.` or `..`), THEN THE Scan_Pipeline SHALL return a Scan_Outcome with Scan_Error code `invalid_repo` and SHALL make zero external requests.
9. IF the ref is present and is empty, longer than 200 characters, contains `..`, or contains a character outside letters, digits, `.`, `_`, `-`, and `/`, THEN THE Scan_Pipeline SHALL return a Scan_Outcome with Scan_Error code `invalid_ref` and SHALL make zero external requests.
10. IF both the repo and the ref are invalid, THEN THE Scan_Pipeline SHALL return Scan_Error code `invalid_repo` and SHALL make zero external requests.

### Requirement 5: Scan pipeline and report

**User Story:** As a developer, I want one call that returns a scored, sorted report for a repo, so that I can see the deadest dependencies first.

#### Acceptance Criteria

1. WHEN the Inventory_Stage returns an Inventory_Result, THE Scan_Pipeline SHALL call the Npm_Evidence_Stage exactly once per Dependency_Entry, passing the name, the `resolvedVersion` as `versionRange` when `resolvedVersion` is present and otherwise the Declared_Range, and the Now value from the injected Clock.
2. THE Scan_Pipeline SHALL run at most `EvidenceConfig.maxConcurrency` Npm_Evidence_Stage calls at the same time, and SHALL start each remaining call as soon as a running call settles until all Dependency_Entry items have been processed.
3. WHEN an EvidenceResult is returned, THE Scan_Pipeline SHALL call `scoreDeath` with the EvidenceResult `signals`, SHALL store the returned DeathScoreResult as `death` of the Scanned_Dependency, and SHALL copy `unknownReasons`, `replacement`, and `warnings` (as `evidenceWarnings`) unchanged.
4. THE Scan_Pipeline SHALL sort `dependencies` by `death.score` descending, then by `name` ascending in UTF-16 code-unit order, so that the output order is identical for any input order of the same Dependency_Entry set.
5. THE Scan_Pipeline SHALL set `summary.total` to the length of `dependencies`, `summary.skipped` to the length of `skipped`, and each GradeBand count to the number of `dependencies` whose `death.grade` equals that GradeBand, such that the four GradeBand counts sum to `summary.total`.
6. THE Scan_Pipeline SHALL set `scannedAt` to the ISO 8601 string of one Clock reading taken at the start of the scan, SHALL read the Clock exactly once per scan, and SHALL use that same value as Now for every Npm_Evidence_Stage call.
7. THE Scan_Pipeline SHALL copy Inventory_Result `warnings` and `skipped` into the Scan_Report unchanged and in the original order, followed by any pipeline warnings.
8. IF the number of distinct names across all Dependency_Kinds exceeds Max_Dependencies, THEN THE Scan_Pipeline SHALL return a Scan_Outcome with Scan_Error code `too_many_dependencies`, SHALL make zero Npm_Evidence_Stage calls, and SHALL NOT include a Scan_Report.
9. IF the Inventory_Stage returns an Inventory_Error, THEN THE Scan_Pipeline SHALL return a Scan_Outcome with the Scan_Error code equal to the Inventory_Error code, SHALL make zero Npm_Evidence_Stage calls, and SHALL NOT include a Scan_Report.
10. THE Scan_Pipeline SHALL return a Scan_Outcome for every input, including when the Inventory_Stage, the Npm_Evidence_Stage, or `scoreDeath` throws or rejects, and SHALL NOT reject its returned promise or throw. An unexpected internal failure that no other rule covers (for example `scoreDeath` throwing for the fallback entry as well) SHALL produce a Scan_Outcome with Scan_Error code `internal_error`. An Npm_Evidence_Stage failure for one dependency is handled by Requirement 6 and never becomes a Scan_Error.
11. THE Scan_Pipeline SHALL reuse the evidence CacheLayer so that two scans of the same dependency within the evidence TTL make the dependency's registry requests once.

### Requirement 6: Failure isolation

**User Story:** As a developer, I want one broken package lookup to cost me only that package, so that a flaky source never fails a whole scan.

#### Acceptance Criteria

1. IF the Npm_Evidence_Stage rejects or throws for a Dependency_Entry, THEN THE Scan_Pipeline SHALL build a Scanned_Dependency for that entry with all seven Signals unknown, one UnknownReason per Signal with source `npm` and category `network_error`, an `evidenceWarnings` entry stating that evidence failed, and a `death` computed by `scoreDeath` from those unknown Signals.
2. IF the Npm_Evidence_Stage rejects or throws for a Dependency_Entry, THEN THE Scan_Pipeline SHALL add exactly one Scan_Report warning for that entry, containing the package name and the version or range that was requested.
3. IF the Npm_Evidence_Stage fails for any subset of Dependency_Entry values, THEN THE Scan_Pipeline SHALL return a Scan_Report in which every dependency outside that subset has `signals` and `death` deep-equal to those from a scan with no failures, and the scan SHALL complete without a Scan_Error.
4. THE Scan_Pipeline SHALL include every Dependency_Entry in `dependencies`, whether or not its evidence call failed, so that the count of `dependencies` equals the count of Dependency_Entry values.
5. WHEN the scan has run longer than the configured scan timeout (default 60 seconds), THE Scan_Pipeline SHALL return a Scan_Outcome with Scan_Error code `scan_timeout`, SHALL start no further evidence calls after the timeout is reached, and SHALL NOT return a partial Scan_Report.
6. IF the Npm_Evidence_Stage fails for every Dependency_Entry before the scan timeout is reached, THEN THE Scan_Pipeline SHALL return a Scan_Report containing one Scanned_Dependency and one warning per Dependency_Entry, and SHALL NOT return a Scan_Error.

### Requirement 7: Deterministic, canonical report

**User Story:** As a maintainer, I want the same inputs to give byte-identical output, so that demos, caches, and tests are stable.

#### Acceptance Criteria

1. WHEN the Scan_Pipeline is run twice with the same HttpClient responses, the same Repo_Target, the same configuration, and the same Clock value, THE Scan_Pipeline SHALL produce Scan_Reports whose Canonical_Json strings are byte-identical.
2. WHEN the Npm_Evidence_Stage calls complete in different orders across two runs with otherwise identical inputs, THE Scan_Pipeline SHALL produce Scan_Reports whose Canonical_Json strings are byte-identical.
3. THE Scan_Report SHALL contain no value derived from the system clock other than `scannedAt`, no random value, and no elapsed-time or duration value.
4. THE Scan_Report serializer SHALL write Canonical_Json with object keys in one fixed order defined in the design document and the same for every Scan_Report, with array elements kept in the order they appear in the Scan_Report.
5. WHEN the Scan_Report parser receives valid Canonical_Json for a Scan_Report, THE Scan_Report parser SHALL return that Scan_Report.
6. IF the text given to the Scan_Report parser is not valid Canonical_Json for a Scan_Report (including empty text, malformed JSON, a missing required field, a field of the wrong type, or text that parses as JSON but is not in canonical form), THEN THE Scan_Report parser SHALL return a typed error identifying the failure category, SHALL NOT throw, and SHALL NOT return a partial Scan_Report.
7. FOR ALL valid Scan_Report values, parsing the Canonical_Json of the report and then serializing the result SHALL produce text byte-identical to the original Canonical_Json (round-trip property).

### Requirement 8: Scan API endpoints

**User Story:** As the graveyard UI, I want an HTTP endpoint that returns a Scan_Report as JSON, so that the UI can show a scan without running the pipeline.

#### Acceptance Criteria

1. WHEN a `POST /api/scan` request has a JSON body `{ "repo": "<owner>/<repo>", "ref": "<ref>" }` with `ref` optional, THE Scan_Api SHALL run the Scan_Pipeline and respond with HTTP 200, a `content-type` of `application/json`, and the Canonical_Json Scan_Report.
2. WHEN a `GET /api/demo/:name` request has a `:name` that matches `^[a-z0-9][a-z0-9-]{0,63}$` and names an existing file `<name>.json` in the demo directory, THE Scan_Api SHALL respond with HTTP 200, a `content-type` of `application/json`, and the unmodified contents of that file, and SHALL make zero Npm_Evidence_Stage calls and zero external requests.
3. IF `:name` does not match `^[a-z0-9][a-z0-9-]{0,63}$`, THEN THE Scan_Api SHALL respond with HTTP 400 and error code `invalid_demo_name` and SHALL read no file.
4. IF `:name` matches `^[a-z0-9][a-z0-9-]{0,63}$` and no file `<name>.json` exists in the demo directory, THEN THE Scan_Api SHALL respond with HTTP 404 and error code `demo_not_found`.
5. IF the request path is not `/api/scan` or `/api/demo/:name`, THEN THE Scan_Api SHALL respond with HTTP 404 and error code `not_found`.
6. IF the method is not `POST` for `/api/scan` or not `GET` for `/api/demo/:name`, THEN THE Scan_Api SHALL respond with HTTP 405, error code `method_not_allowed`, and an `allow` header whose value is the single allowed method for that path.
7. THE Scan_Api SHALL respond to every error with a JSON body of the form `{ "error": { "code": "<code>", "message": "<message>" } }` and a `content-type` of `application/json`, where `<code>` and `<message>` are non-empty strings.
8. WHEN the Scan_Pipeline returns a Scan_Outcome with ok false, THE Scan_Api SHALL respond with the status mapped as follows: `invalid_repo` and `invalid_ref` to 400, `no_package_json` to 404, `malformed_package_json`, `invalid_package_json_shape`, and `too_many_dependencies` to 422, `repo_fetch_failed` to 502, `scan_timeout` to 504, and `internal_error` to 500, and SHALL use the Scan_Error code as the `code` in the response body.
9. THE Scan_Api SHALL make zero LLM calls and SHALL require no account, API key, or token from the caller.

### Requirement 9: Scan API input validation and limits

**User Story:** As a maintainer, I want the API to refuse bad or abusive requests cheaply, so that a small VPS stays up.

#### Acceptance Criteria

1. IF the `POST /api/scan` body is larger than 4096 bytes, THEN THE Scan_Api SHALL respond with HTTP 413 and error code `body_too_large`, SHALL NOT parse the body, and SHALL run no scan.
2. IF the `POST /api/scan` body is not valid JSON, is not a JSON object, lacks a string `repo`, has a `repo` that does not match `<owner>/<repo>` (owner 1 to 39 characters and repo 1 to 100 characters, each made only of letters, digits, `.`, `_` and `-`), or has a `ref` that is present and is not a string of 1 to 256 characters, THEN THE Scan_Api SHALL respond with HTTP 400 and error code `invalid_input` and SHALL run no scan.
3. IF the `content-type` of a `POST /api/scan` request is not `application/json` (ignoring parameters such as `charset`), THEN THE Scan_Api SHALL respond with HTTP 415 and error code `unsupported_media_type`, SHALL NOT parse the body, and SHALL run no scan.
4. WHEN a client IP has made more than the configured number of `POST /api/scan` requests within the configured window (defaults: 10 requests per 60-second window; measured back from the current Clock time), THE Scan_Api SHALL respond to further `POST /api/scan` requests from that IP with HTTP 429, error code `rate_limited`, and a `retry-after` header holding a positive integer number of seconds equal to the time until the oldest counted request leaves the window, rounded up.
5. THE Scan_Api SHALL count each `POST /api/scan` request toward the rate limit of its client IP before it checks size, content type or body, and before it runs any scan work, whether or not the request is later rejected.
6. THE Scan_Api SHALL keep `GET /api/demo/:name` outside the per-IP scan rate limit and SHALL apply to it a separate per-IP demo rate limit, with its own counter, defaulting to 120 requests per 60-second window; WHEN the demo limit is exceeded, THE Scan_Api SHALL respond with HTTP 429, error code `rate_limited`, and a `retry-after` header computed as in criterion 4.
7. WHERE `trustProxy` is true in the Scan_Api_Config, THE Scan_Api SHALL take the client IP from the last comma-separated entry of the `x-forwarded-for` header (trimmed of whitespace), falling back to the socket address when the header is absent or that entry is empty.
8. WHEN `trustProxy` is false or unset, THE Scan_Api SHALL take the client IP from the socket address and SHALL ignore the `x-forwarded-for` header.
9. THE Scan_Api SHALL read time for rate-limit windows from the injected Clock and SHALL NOT read the system time for that purpose.
10. IF a request has been running longer than the configured request timeout (default 60 seconds, the same value as the scan timeout), THEN THE Scan_Api SHALL respond with HTTP 504 and error code `scan_timeout`, and SHALL stop doing further work for that request.
11. IF the Scan_Api_Config has a port that is not an integer from 1 to 65535, or a scan or demo rate-limit limit, window, or timeout that is not a finite number greater than 0, THEN THE Scan_Api SHALL reject the configuration with an error naming the invalid field and SHALL NOT listen.

### Requirement 10: Scan API server binding

**User Story:** As an operator, I want the server to listen only on the loopback address behind nginx, so that it is not directly exposed.

#### Acceptance Criteria

1. WHEN the server starts successfully, THE Scan_Api SHALL listen on the IPv4 loopback address `127.0.0.1` only and SHALL NOT accept connections addressed to any non-loopback interface of the host.
2. THE Scan_Api SHALL read the listening port from the `PORT` environment variable in exactly one place in the codebase.
3. IF `PORT` is unset or is an empty string, THEN THE Scan_Api SHALL listen on port 24817 (a deliberately non-obvious default).
4. IF `PORT` is set to a non-empty value that is not a base-10 integer from 1 to 65535 inclusive (including values with whitespace, a sign, a decimal point, or non-digit characters), THEN THE Scan_Api SHALL terminate startup with a non-zero exit status, SHALL write an error naming `PORT` and the rejected value to standard error, and SHALL NOT open any listening socket.
5. IF the resolved port is already in use or cannot be bound, THEN THE Scan_Api SHALL terminate startup with a non-zero exit status and SHALL write an error naming the port to standard error.
6. THE Scan_Api handler SHALL be constructible with an injected HttpClient, Clock, Sleep, and configuration, and SHALL be invocable in-process with a request object and return a response without opening a network socket.

### Requirement 11: Demo snapshots

**User Story:** As a maintainer, I want pre-scanned reports on disk, so that the hosted demo loads instantly and works on a cold start.

#### Acceptance Criteria

1. WHEN the Demo_Snapshot_Script is run, THE Demo_Snapshot_Script SHALL scan each repository in its named list with the Scan_Pipeline and write each successful Scan_Report as Canonical_Json to `/demo/<name>.json`.
2. IF a scan in the Demo_Snapshot_Script returns a Scan_Outcome with ok false, THEN THE Demo_Snapshot_Script SHALL print the repository name and the Scan_Error code, SHALL leave any existing `/demo/<name>.json` unchanged, SHALL count the repository as failed, and SHALL continue with the remaining repositories.
3. WHEN the Demo_Snapshot_Script finishes with at least one failed repository, THE Demo_Snapshot_Script SHALL exit with a non-zero status.
4. WHEN the Demo_Snapshot_Script finishes with zero failed repositories, THE Demo_Snapshot_Script SHALL exit with status 0.
5. THE Demo_Snapshot_Script SHALL write each file to a temporary path in `/demo` and rename it to the final path, so that a reader never sees a partial file.
6. IF writing or renaming a file fails for a repository, THEN THE Demo_Snapshot_Script SHALL delete the temporary file if it exists, SHALL leave any existing `/demo/<name>.json` unchanged, SHALL print the repository name and a write-failure error, SHALL count the repository as failed, and SHALL continue with the remaining repositories.
7. THE Demo_Snapshot_Script SHALL be started only by an explicit npm script of `apps/exorcist-npm`, and `npm test` SHALL NOT start the Demo_Snapshot_Script.
8. IF a demo name does not match the Scan_Api demo name pattern, THEN THE Demo_Snapshot_Script SHALL skip that repository without scanning or writing any file, SHALL print the repository name and an invalid-name error, SHALL count the repository as failed, and SHALL continue with the remaining repositories.
9. THE Demo_Snapshot_Script SHALL use the real network client and SHALL run to completion when no GitHub token is set.

### Requirement 12: Scope and reuse

**User Story:** As a maintainer, I want the scanner built on the existing pieces, so that the kit stays small and one-directional.

#### Acceptance Criteria

1. THE Npm_Scanner SHALL import `PackageSignals`, `SignalName`, `GradeBand`, `DeathScoreResult`, and `scoreDeath` from the public exports of `@last-rites/skeleton` and SHALL NOT redeclare them.
2. THE Npm_Scanner SHALL import `createEvidenceStage`, `EvidenceResult`, `EvidenceConfig`, `ReplacementInfo`, `UnknownReason`, `HttpClient`, `ResilientClient`, `CacheLayer`, and `Clock` from `apps/exorcist-npm/src/evidence` and SHALL NOT redeclare them.
3. THE Npm_Scanner SHALL export an implementation of the `inventory` stage of the npm adapter and SHALL NOT export an implementation of the `replacement` or `proof` stage.
4. THE `/skeleton` package SHALL contain zero import statements that resolve to a module under `/apps/exorcist-npm`.
5. THE Npm_Scanner SHALL make zero calls to a large language model and SHALL declare zero dependencies on a large language model client library in any `package.json` it owns.
6. WHERE a new runtime dependency is added for the Scan_Api, THE Npm_Scanner SHALL declare it in `package.json` with an exact version string (digits and dots only, with no range operators).
7. THE Npm_Scanner SHALL fetch and read only `package.json` and `package-lock.json`, and SHALL NOT request or read yarn or pnpm lockfiles; a repository without `package-lock.json` is scanned from declared ranges with the missing-lockfile warning.
8. THE Npm_Scanner SHALL make unauthenticated requests only, so that a private repository is reported as `no_package_json` (see Requirement 4) and no partial scan result is retained.
9. WHEN THE Npm_Scanner builds the inventory from a `package-lock.json`, THE Npm_Scanner SHALL use only the entries for direct dependencies of the root project and SHALL exclude every transitive dependency, so that the inventory count equals the number of distinct direct dependencies in `package.json`.

### Requirement 13: Zero-network tests and recorded fixtures

**User Story:** As a maintainer, I want the scanner tested on real recorded files with no network, so that parsers are checked against what GitHub returns.

#### Acceptance Criteria

1. THE test suite SHALL make zero real network requests and SHALL use FakeHttp as the only HttpClient.
2. THE test suite SHALL load `no-network.setup.ts` before every test file.
3. IF any test calls global `fetch`, THEN THE test suite SHALL fail that test with an error indicating that real network access is forbidden, and SHALL send no request.
4. THE test suite SHALL store a fixture recorded with the `createRecorder` pattern from one real public MIT-licensed repository that commits a `package-lock.json` with `lockfileVersion` 2 or 3, whose lockfile lists at most 25 packages, and that has at least one deprecated or e18e-listed direct dependency if such a repository can be found, containing its `package.json` and `package-lock.json`, under `__fixtures__/` next to the tests that use it. The repository is chosen during the recording task, and the fixture README SHALL name the repository and the commit SHA the files were recorded from.
5. THE test suite SHALL store, under `__fixtures__/`, one evidence fixture per registry dependency of the recorded repository, recorded with the same recorder.
6. WHEN run against the recorded repository fixture, THE Scan_Pipeline SHALL return a Scan_Outcome with ok true, SHALL place every dependency of the fixture in exactly one of `dependencies` or `skipped`, and SHALL set `resolvedVersion` to the lockfile version for every registry dependency the lockfile lists.
7. IF the fake HttpClient receives a request with no matching fixture, THEN THE test suite SHALL fail the running test with an error that contains the HTTP method and full URL of the unmatched request.
8. THE test suite SHALL include at least one example test for each of these cases: missing lockfile, missing `package.json`, malformed `package.json`, lockfile version 1, an `npm:` alias, a git specifier, a `workspace:` specifier, and a name present in two Dependency_Kinds. Each test SHALL assert the `ok` value of the Scan_Outcome and either the error code or the `skipped` entry reason for that case.
9. THE test suite SHALL include at least one test per status code listed in Requirement 8 and Requirement 9 that calls the Scan_Api handler in-process, without opening a network socket, and asserts that exact status code.
10. WHEN the test suite runs the Demo_Snapshot_Script, THE test suite SHALL provide FakeHttp as its only HttpClient and a newly created temporary directory as its only output location, and SHALL remove that directory when the test ends.

### Requirement 14: Property-based tests with sabotage checks

**User Story:** As a maintainer, I want the scanner proven by properties that can actually fail, so that green tests mean something.

#### Acceptance Criteria

1. THE test suite SHALL include exactly one fast-check property for each of the following six subjects, each configured with `numRuns` of 100: determinism, inventory completeness, lockfile precedence, sort order and summary counts, failure isolation, and Canonical_Json round trip. Two additive properties, scan-p7 (rate limiter window) and scan-p8 (repo target validation), are in addition to these six subjects.
2. THE determinism property SHALL assert that, for generated dependency sets of 0 to 50 dependencies and generated evidence completion orders (permutations of the evidence calls), the Canonical_Json of the Scan_Report is byte-identical across at least 2 runs of the same input.
3. THE inventory completeness property SHALL assert that, for generated `package.json` objects with names spread across the four Dependency_Kinds and generated specifier kinds, every distinct name appears exactly once in `dependencies` or `skipped`, never in both, and none is dropped.
4. THE lockfile precedence property SHALL assert that, for generated manifests and lockfiles, every Dependency_Entry with a usable lockfile version has `resolvedVersion` equal to that version and `versionSource` `lockfile`, every other Dependency_Entry has `versionSource` `range`, and the evidence call receives the lockfile version as its `versionRange` for each entry with a usable lockfile version.
5. THE sort order property SHALL assert that `dependencies` is ordered by `death.score` descending then `name` ascending, that the GradeBand counts of `summary` equal the per-grade counts of `dependencies`, and that the GradeBand counts sum to `summary.total`.
6. THE failure isolation property SHALL assert that, for any generated subset of failing evidence calls (including the empty subset and the full set), the Scan_Report is valid, contains every dependency, and every dependency outside the subset is deep-equal to its entry from the run with no failures.
7. THE Canonical_Json round-trip property SHALL assert the round trip stated in Requirement 7.
8. THE test suite SHALL contain one sabotage list per property in `test-support/sabotage/`, in files named `scan-p1.ts` to `scan-p6.ts`, plus `scan-p7.ts` and `scan-p8.ts` for the two additive properties (numbered in the order listed in criterion 1, with the `scan-` prefix so they do not collide with the evidence `p1` to `p11` files), each list containing at least 1 entry, and each entry being a deliberately wrong implementation.
9. THE test suite SHALL contain one central sabotage test that runs every property against every entry of that property's sabotage list.
10. THE sabotage lists SHALL include at least these wrong implementations: for determinism, ordering the report by completion order; for completeness, dropping a name that appears in two kinds; for lockfile precedence, preferring the declared range; for sort order, sorting by score ascending, and separately omitting the name tiebreak; for failure isolation, letting one failed evidence call fail the whole scan.
11. IF a sabotage entry does not cause its property to fail, THEN THE test suite SHALL report a test failure with the message `Sabotage "<name>" stayed green for "<property>"`, where `<name>` is the sabotage entry name and `<property>` is the property name.
12. WHERE the `CI` environment variable is set and `FC_SEED` is not set, THE test suite SHALL run every property with one fixed fast-check seed that is the same on every run.
13. WHERE the `FC_SEED` environment variable is set to an integer, THE test suite SHALL run every property with that seed, taking precedence over the fixed CI seed.
14. IF a property fails, THEN THE test suite SHALL print the fast-check seed and the shrunk counterexample in the failure output.
15. THE test suite SHALL pass `npm run typecheck` with zero errors.
