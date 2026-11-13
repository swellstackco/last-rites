# Requirements Document

## Introduction

The Npm_Evidence_Stage is the evidence stage of the npm adapter in `/apps/exorcist-npm`. Given one npm package name per call, and optionally the version range declared in `package.json`, it gathers every signal the Death_Score_Engine needs and returns an Evidence_Result whose `signals` field is a PackageSignals object exactly as defined in `skeleton/src/death-score/types.ts`, with a source URL for every known signal. It reads from the npm registry, the GitHub REST API, OSV.dev, and the e18e `module-replacements` data file. deps.dev is used only if a configuration enables it and it fills a gap the other sources leave. All external fetches go through one disk cache and one injectable HTTP client, so tests run with zero network. A failure in any one source makes only the dependent signals unknown, with a recorded reason. The stage never throws for a single bad source and never reports a signal as alive without evidence. Time is injected, so results are deterministic and the Death_Score_Engine stays pure.

This spec covers only the evidence stage. The scanner, API, UI, replacement stage, and proof stage are out of scope. The hosted app and tests make no LLM calls.

PackageSignals has no field for an unknown reason or a warning. The reasons and warnings are therefore returned beside the PackageSignals in an Evidence_Result and never added to the type.

## Glossary

- **Npm_Evidence_Stage**: the evidence stage of the npm adapter in `/apps/exorcist-npm`; the system specified here. One call handles one package.
- **Death_Score_Engine**: the pure module in `/skeleton` that scores PackageSignals.
- **PackageSignals**: the type exported by `skeleton/src/death-score/types.ts`, with seven Signals, each known or unknown, and optional `sourceUrls`. The Npm_Evidence_Stage imports it and never redefines it.
- **SignalValue**: the type exported by `/skeleton` for a Signal that is either known (with a value) or unknown.
- **SignalName**: the type exported by `/skeleton` naming the seven Signals.
- **Signal**: one of `deprecated`, `repoArchived`, `monthsSinceLastPublish`, `monthsSinceLastCommit`, `maintainerCount`, `openVulnsNoFix`, `knownReplacementExists`.
- **Evidence_Result**: the object returned by the Npm_Evidence_Stage, containing `signals` (the PackageSignals), `unknownReasons` (an Unknown_Reason for each unknown Signal), `replacement` (the optional Replacement_Info), and `warnings` (a list of warning messages, empty when there are none).
- **Unknown_Reason**: a record naming the failed Source and a failure category. The category is exactly one of `not_found`, `timeout`, `rate_limited`, `malformed_response`, `network_error`, `not_applicable`, or `incomplete`. The category `incomplete` means the data was only partly retrieved, as when OSV.dev pages are exhausted at the page limit.
- **Replacement_Info**: the replacement name (optional) and replacement type from the e18e data file for a package that has a known replacement, kept for later stages.
- **Source**: one external data provider: `npm`, `github`, `osv`, `e18e`, or `depsdev`.
- **Http_Client**: the injectable interface through which all network requests are made; tests supply a fake implementation.
- **Cache_Layer**: the single module that stores and retrieves external responses as JSON files on disk under `.cache/`, keyed by request.
- **TTL**: the time-to-live of a cache entry, configured per Source.
- **Repo_Url_Parser**: the pure function that extracts a GitHub owner and repository name from an npm `repository` field.
- **Repo_Ref**: an `{ owner, repo }` pair identifying a GitHub repository.
- **Now**: the injected current time used for every time computation and cache expiry check, supplied as an ISO 8601 value or a Date.
- **Months_Since**: the number of whole calendar months, rounded down, between a past timestamp and Now, never negative.
- **Resolved_Version**: the highest version published on the npm registry that satisfies the supplied version range, or the version tagged by the `latest` dist-tag when no range is supplied.
- **Fixture**: a recorded real response stored under `__fixtures__/` next to the tests that use it.

## Requirements

### Requirement 1: Produce PackageSignals from a package name

**User Story:** As a developer, I want one call that returns all death-score signals for a package, so that the scanner can score it without knowing about data sources.

#### Acceptance Criteria

1. WHEN a non-empty package name is provided, THE Npm_Evidence_Stage SHALL return an Evidence_Result whose PackageSignals contains exactly seven entries, one for each SignalName defined in `/skeleton`, where each entry is either a known SignalValue or an unknown value carrying an Unknown_Reason.
2. THE Npm_Evidence_Stage SHALL import the PackageSignals, SignalValue, and SignalName types from `/skeleton` and SHALL NOT declare duplicate definitions of those types.
3. WHERE a version range is provided, THE Npm_Evidence_Stage SHALL resolve the Resolved_Version as the highest published version satisfying that range, including pre-release versions only if the range includes a pre-release tag.
4. WHEN no version range is provided, THE Npm_Evidence_Stage SHALL use the version tagged by the `latest` dist-tag of the npm registry as the Resolved_Version.
5. IF a provided version range matches no published version, THEN THE Npm_Evidence_Stage SHALL return an Evidence_Result in which all seven Signals are marked unknown with an Unknown_Reason of `not_found`, and SHALL NOT return an error.
6. IF the package name is an empty string or contains only whitespace characters, THEN THE Npm_Evidence_Stage SHALL return an error indicating that a package name is required and SHALL NOT make any external fetch.
7. IF the package name does not exist in the npm registry, THEN THE Npm_Evidence_Stage SHALL return an Evidence_Result in which all seven Signals are marked unknown with an Unknown_Reason of `not_found`, and SHALL NOT return an error.

### Requirement 2: Signals from the npm registry

**User Story:** As a developer, I want publish, deprecation, and maintainer facts from the npm registry, so that the score reflects the package's own metadata.

#### Acceptance Criteria

1. WHEN the npm registry document for the package is retrieved, THE Npm_Evidence_Stage SHALL set `deprecated` to known true if the Resolved_Version entry in the registry document carries a non-empty deprecation message, and to known false otherwise.
2. WHEN the registry document is retrieved and the `time` map contains at least one entry other than `created` and `modified` whose value is a valid ISO 8601 timestamp, THE Npm_Evidence_Stage SHALL set `monthsSinceLastPublish` to known, with the value being the Months_Since the latest such timestamp.
3. WHEN the registry document is retrieved and the `maintainers` list is present, THE Npm_Evidence_Stage SHALL set `maintainerCount` to known, with the value being the number of entries in the list (0 if empty).
4. WHEN a known Signal is derived from the registry document, THE Npm_Evidence_Stage SHALL set the matching `sourceUrls` entry to `https://registry.npmjs.org/<name>`.
5. IF the registry document cannot be retrieved (network failure, timeout, HTTP error, or package not found) or cannot be parsed, THEN THE Npm_Evidence_Stage SHALL mark `deprecated`, `monthsSinceLastPublish`, `maintainerCount`, `repoArchived`, and `monthsSinceLastCommit` as unknown, SHALL set the Unknown_Reason of each to the category of the failure, SHALL complete without throwing, and SHALL leave Signals from other sources unchanged. `repoArchived` and `monthsSinceLastCommit` are included because the repository URL is also unavailable.
6. IF the `time` map is missing or contains no entry other than `created` and `modified` with a valid ISO 8601 timestamp, THEN THE Npm_Evidence_Stage SHALL mark `monthsSinceLastPublish` as unknown with an Unknown_Reason of `malformed_response`.
7. IF the `maintainers` field is missing or is not a list, THEN THE Npm_Evidence_Stage SHALL mark `maintainerCount` as unknown with an Unknown_Reason of `malformed_response`.
8. IF the Resolved_Version is not present in the registry document, THEN THE Npm_Evidence_Stage SHALL mark `deprecated` as unknown with an Unknown_Reason of `malformed_response`.

### Requirement 3: GitHub repository URL parsing

**User Story:** As a developer, I want every common way of writing a GitHub repository URL to resolve to the same repository, so that GitHub signals are not lost to formatting differences.

#### Acceptance Criteria

1. WHEN the npm `repository` field is a string, THE Repo_Url_Parser SHALL use that string as the value to parse.
2. WHEN the `repository` field is an object whose `url` property is a string, THE Repo_Url_Parser SHALL use the `url` property as the value to parse.
3. WHEN the value is a GitHub URL in any of the forms `https://github.com/o/r`, `http://github.com/o/r`, `git+https://github.com/o/r.git`, `git://github.com/o/r.git`, `git+ssh://git@github.com/o/r.git`, `ssh://git@github.com/o/r.git`, `git@github.com:o/r.git`, or `github:o/r`, or the bare shorthand `o/r`, THE Repo_Url_Parser SHALL return the Repo_Ref `{ owner: "o", repo: "r" }`.
4. WHEN the value contains a `.git` suffix, a trailing slash, a `#` fragment, a `?` query string, or a monorepo path such as `/tree/main/packages/x`, THE Repo_Url_Parser SHALL ignore these parts and return the same Repo_Ref as for the plain form.
5. WHEN the host is `github.com` or `www.github.com` in any letter case, or leading or trailing whitespace is present, THE Repo_Url_Parser SHALL match the host case-insensitively, trim the whitespace, and return the same Repo_Ref as for the plain form.
6. WHEN the `repository` object contains a `directory` property, THE Repo_Url_Parser SHALL ignore the directory for the purpose of identifying the Repo_Ref.
7. IF the value is a URL whose host is not `github.com` or `www.github.com`, or a shorthand with a non-GitHub prefix such as `gitlab:` or `bitbucket:`, THEN THE Repo_Url_Parser SHALL return no Repo_Ref.
8. IF the `repository` field is absent, `null`, an empty or whitespace-only string, an object without a string `url`, a value of any other type, a value lacking an owner or repo segment, or otherwise not parseable, THEN THE Repo_Url_Parser SHALL return no Repo_Ref and SHALL NOT throw.
9. IF the owner or repo segment contains characters outside the valid GitHub name set (owner: letters, digits, and hyphens, 1 to 39 characters; repo: letters, digits, `.`, `_`, and `-`, 1 to 100 characters), THEN THE Repo_Url_Parser SHALL return no Repo_Ref.
10. FOR ALL Repo_Ref values `{ owner, repo }` with valid GitHub names, rendering the Repo_Ref in each form listed in criterion 3 and then parsing it SHALL return the same Repo_Ref (round-trip property).

### Requirement 4: Signals from GitHub

**User Story:** As a developer, I want archive status and last-commit age from GitHub, so that a dead upstream repository is detected.

#### Acceptance Criteria

1. WHEN a Repo_Ref is available, THE Npm_Evidence_Stage SHALL request the repository metadata from the GitHub REST API and set `repoArchived` to the boolean value of the `archived` flag of the response.
2. WHEN the repository metadata is retrieved, THE Npm_Evidence_Stage SHALL request the latest commit on the default branch named in the metadata and set `monthsSinceLastCommit` to the Months_Since the commit date.
3. WHEN a known Signal is derived from GitHub, THE Npm_Evidence_Stage SHALL set the matching `sourceUrls` entry to the `https://github.com/<owner>/<repo>` page of the repository.
4. IF no Repo_Ref is available, THEN THE Npm_Evidence_Stage SHALL mark `repoArchived` and `monthsSinceLastCommit` as unknown with an Unknown_Reason of `not_applicable`, and SHALL NOT mark either as alive.
5. IF the metadata request returns a not-found response, or the repository was renamed or moved to a location that cannot be reached by following redirects, THEN THE Npm_Evidence_Stage SHALL mark both Signals as unknown with an Unknown_Reason of `not_found`.
6. IF the metadata request fails because of a network error, a timeout, a rate-limit response, or a server error response, THEN THE Npm_Evidence_Stage SHALL mark both Signals as unknown with the Unknown_Reason of the category of the failure (`network_error`, `timeout`, `rate_limited`, or `not_found` as applicable), SHALL NOT mark either as alive, and SHALL complete without throwing.
7. IF the metadata is retrieved and the latest-commit request fails, returns no commits, or returns a commit without a parseable date, THEN THE Npm_Evidence_Stage SHALL keep the `repoArchived` value and SHALL mark `monthsSinceLastCommit` as unknown with the Unknown_Reason of the category of the failure (`malformed_response` for missing or unparseable data).
8. WHERE `GITHUB_TOKEN` is set to a non-empty value, THE Npm_Evidence_Stage SHALL send it as a bearer token in GitHub requests.
9. WHEN `GITHUB_TOKEN` is not set or is empty, THE Npm_Evidence_Stage SHALL send GitHub requests without authentication.
10. THE Npm_Evidence_Stage SHALL exclude the GitHub token value from the Cache_Layer keys, cache files, Evidence_Result, and Unknown_Reason messages.

### Requirement 5: Vulnerabilities with no fix from OSV

**User Story:** As a developer, I want to know how many vulnerabilities in my resolved version will never be fixed, so that unfixable security risk raises the death score.

#### Acceptance Criteria

1. WHEN a Resolved_Version is available, THE Npm_Evidence_Stage SHALL query the OSV.dev query API for the npm package name and Resolved_Version.
2. WHEN the OSV response is retrieved, THE Npm_Evidence_Stage SHALL set `openVulnsNoFix` to the count of distinct vulnerability ids affecting the Resolved_Version for which no affected range, across all affected entries for the npm package, lists a `fixed` event.
3. WHEN the OSV response contains no vulnerabilities, THE Npm_Evidence_Stage SHALL set `openVulnsNoFix` to known 0.
4. WHEN the OSV response contains `next_page_token`, THE Npm_Evidence_Stage SHALL request further pages until the token is absent, up to a maximum of 10 pages.
5. WHEN `openVulnsNoFix` is known, THE Npm_Evidence_Stage SHALL set its `sourceUrls` entry to `https://osv.dev/list?q=<name>`.
6. IF the Resolved_Version is not available, THEN THE Npm_Evidence_Stage SHALL mark `openVulnsNoFix` as unknown with the Unknown_Reason of the failed npm registry step and SHALL NOT query OSV.dev.
7. IF the OSV.dev request fails with a network error, a timeout, or a non-success response, or the response cannot be parsed, THEN THE Npm_Evidence_Stage SHALL mark `openVulnsNoFix` as unknown with the Unknown_Reason of the category of the failure, and SHALL NOT set a `sourceUrls` entry for it.
8. IF the page limit of criterion 4 is reached while `next_page_token` is still present, THEN THE Npm_Evidence_Stage SHALL mark `openVulnsNoFix` as unknown with an Unknown_Reason of `incomplete`.

### Requirement 6: Known replacement from e18e

**User Story:** As a developer, I want to know whether a maintained replacement exists, so that the score and later migration stages can use it.

#### Acceptance Criteria

1. WHEN the e18e `module-replacements` data file is retrieved and parsed successfully, THE Npm_Evidence_Stage SHALL set `knownReplacementExists` to known true if the data file contains an entry whose module name exactly equals (case-sensitive) the package name, and to known false if it contains no such entry.
2. WHEN `knownReplacementExists` is known true and the matching entry names a replacement, THE Npm_Evidence_Stage SHALL include in the Evidence_Result a Replacement_Info containing the replacement name and the replacement type exactly as reported by the data file.
3. WHEN `knownReplacementExists` is set to known true or known false, THE Npm_Evidence_Stage SHALL set its `sourceUrls` entry to the URL from which the e18e data file was retrieved.
4. WHEN the matching e18e entry gives no replacement module, THE Npm_Evidence_Stage SHALL set `knownReplacementExists` to known true and SHALL include a Replacement_Info whose type is the type reported by the data file and whose replacement name is absent.
5. IF the e18e data file cannot be retrieved, is not valid for parsing, or the matching entry has no readable type, THEN THE Npm_Evidence_Stage SHALL mark `knownReplacementExists` as unknown with an Unknown_Reason naming the `e18e` Source, SHALL omit Replacement_Info, and SHALL continue without raising an error to the caller.
6. IF the data file contains more than one entry matching the package name, THEN THE Npm_Evidence_Stage SHALL use the first matching entry in file order and SHALL set `knownReplacementExists` to known true.

### Requirement 7: deps.dev as an optional gap filler

**User Story:** As a maintainer, I want deps.dev used only when it adds something, so that the evidence stage stays small and makes few requests.

#### Acceptance Criteria

1. WHEN every Signal is known after all other Sources have been evaluated, THE Npm_Evidence_Stage SHALL make zero deps.dev requests.
2. IF `repoArchived` or `monthsSinceLastCommit` is unknown only because no Repo_Ref was found in the npm `repository` field, THEN THE Npm_Evidence_Stage SHALL leave those Signals unknown, SHALL make zero deps.dev requests to infer a repository, and SHALL NOT record a source URL for those Signals.
3. WHERE a deps.dev lookup is enabled by configuration, WHEN at least one Signal is unknown after all other Sources have been tried and the unknown Signal is not covered by criterion 2, THE Npm_Evidence_Stage SHALL make at most one deps.dev request and SHALL use the response only to fill Signals that are unknown.
4. WHERE a deps.dev lookup is enabled, WHEN a deps.dev response fills a Signal, THE Npm_Evidence_Stage SHALL record `https://deps.dev/npm/<name>` as the source URL of that Signal.
5. WHERE a deps.dev lookup is enabled, WHEN a Signal already has a known value from another Source, THE Npm_Evidence_Stage SHALL keep that value and its original source URL unchanged.
6. IF a deps.dev request fails, times out, or returns a response that does not contain the unknown Signal, THEN THE Npm_Evidence_Stage SHALL leave the affected Signals unknown, SHALL NOT retry the request, and SHALL complete without throwing.
7. WHERE no deps.dev lookup is enabled by configuration (the default), THE Npm_Evidence_Stage SHALL make zero deps.dev requests.

### Requirement 8: One cache layer and an injectable HTTP client

**User Story:** As a maintainer, I want every external fetch cached on disk behind one interface, so that scans are fast, polite to free APIs, and testable without a network.

#### Acceptance Criteria

1. THE Npm_Evidence_Stage SHALL perform every external request through the Http_Client, and the Http_Client SHALL be supplied by the caller.
2. THE Npm_Evidence_Stage SHALL perform every Http_Client request through the Cache_Layer.
3. WHEN the Http_Client returns a successful response (HTTP 2xx) on a cache miss or expired entry, THE Cache_Layer SHALL store the response as one JSON file under `.cache/` within the configured root directory, keyed by request URL for GET requests and by request URL plus request body for POST requests, such that two requests with the same key map to the same file and two requests with different keys map to different files.
4. WHEN a request is made and the Cache_Layer holds an entry for the key whose age at Now is less than the TTL of the Source, THE Cache_Layer SHALL return the stored response without calling the Http_Client.
5. WHEN a request is made and the Cache_Layer holds an entry whose age at Now is greater than or equal to the TTL of the Source, THE Cache_Layer SHALL call the Http_Client exactly once and, if the response is successful, replace the stored entry with the new response and a new stored-at timestamp.
6. THE Cache_Layer SHALL read the TTL for each Source from a single configuration object that provides a default TTL, in seconds and greater than 0, for each of the npm registry, GitHub REST API, OSV.dev, deps.dev, and e18e Sources.
7. IF a cache file is unreadable or contains invalid JSON, THEN THE Cache_Layer SHALL treat the entry as absent, call the Http_Client exactly once, and, if the response is successful, overwrite the bad file with the new response without raising an error to the caller.
8. IF the Http_Client returns a failure (a non-2xx HTTP status or a thrown network error), THEN THE Cache_Layer SHALL NOT write or overwrite any cache entry for that key, SHALL leave any existing entry unchanged, and SHALL return the failure to the caller.
9. THE Cache_Layer SHALL accept its root directory as a constructor parameter, and every cache read and write SHALL occur within that directory, so that tests can use a temporary directory.
10. WHEN the Cache_Layer determines the age of an entry, THE Cache_Layer SHALL compute it from a Now value supplied by an injectable clock, so that tests can control expiry without waiting.

### Requirement 9: Failure isolation and unknown reasons

**User Story:** As a developer, I want one broken source to cost me only its own signals, so that a GitHub outage never hides a deprecation I already know about.

#### Acceptance Criteria

1. IF a Source returns HTTP 404, does not respond within the configured per-request timeout, is rate limited, returns a body that is not parseable as JSON, or fails at the network level, THEN THE Npm_Evidence_Stage SHALL mark each Signal that depends on that Source as unknown.
2. IF a Signal is marked unknown, THEN THE Npm_Evidence_Stage SHALL add exactly one Unknown_Reason for that Signal to the Evidence_Result, whose failure category is one of the Glossary categories.
3. IF any single Source fails, THEN THE Npm_Evidence_Stage SHALL return an Evidence_Result for the package, SHALL NOT throw, and SHALL NOT reject its returned promise.
4. IF a Source fails, THEN THE Npm_Evidence_Stage SHALL set every Signal that does not depend on that Source to a value deeply equal to the value it has in an Evidence_Result produced from the same inputs when no Source fails.
5. THE Npm_Evidence_Stage SHALL omit the `sourceUrls` entry for every unknown Signal.
6. THE Npm_Evidence_Stage SHALL set a `sourceUrls` entry, containing an absolute URL, for every known Signal.
7. IF a Source response is parseable as JSON but is missing the field a Signal needs, THEN THE Npm_Evidence_Stage SHALL mark only that Signal as unknown with an Unknown_Reason of `malformed_response`, and SHALL leave every other Signal derived from the same response unchanged.
8. IF every Source fails, THEN THE Npm_Evidence_Stage SHALL return an Evidence_Result in which every Signal is unknown, each with an Unknown_Reason, and with no `sourceUrls` entries.

### Requirement 10: Rate-limit-friendly requests

**User Story:** As a maintainer, I want the stage to be polite to free APIs, so that scans do not get blocked.

#### Acceptance Criteria

1. THE Npm_Evidence_Stage SHALL limit concurrent in-flight Http_Client requests to a configurable maximum, defaulting to 4, accepting integer values from 1 to 32, and SHALL never have more than that maximum in flight at any instant.
2. IF the configured concurrency maximum is not an integer between 1 and 32, THEN THE Npm_Evidence_Stage SHALL reject the configuration with an error indicating the invalid value and SHALL issue no requests.
3. WHEN a GitHub response includes `x-ratelimit-remaining` equal to 0, THE Npm_Evidence_Stage SHALL make no further GitHub request until the time given by `x-ratelimit-reset` (Unix epoch seconds) has passed.
4. IF a GitHub request would have to wait longer than a configurable maximum wait, defaulting to 60 seconds, for the `x-ratelimit-reset` time to pass, THEN THE Npm_Evidence_Stage SHALL not issue the request and SHALL mark the GitHub-dependent Signals as unknown with an Unknown_Reason of `rate_limited`.
5. WHEN any Source responds with HTTP 429 and a `retry-after` header holding a non-negative integer number of seconds, THE Npm_Evidence_Stage SHALL wait that many seconds before retrying the request.
6. WHEN any Source responds with HTTP 429 and the `retry-after` header is absent or not a non-negative integer, THE Npm_Evidence_Stage SHALL wait an exponentially increasing delay before retrying, starting at 1 second and doubling on each subsequent attempt, capped at 30 seconds.
7. THE Npm_Evidence_Stage SHALL retry a request that received HTTP 429 up to a configurable maximum number of retries, defaulting to 3, accepting integer values from 0 to 10.
8. IF all retry attempts for a request are exhausted, THEN THE Npm_Evidence_Stage SHALL mark the dependent Signals as unknown with an Unknown_Reason of `rate_limited`.
9. THE Npm_Evidence_Stage SHALL perform all waiting through an injectable sleep function, so that tests run without real delays.
10. WHEN a request exceeds the configurable request timeout, defaulting to 10 seconds (10000 ms), THE Npm_Evidence_Stage SHALL abort the request, SHALL NOT retry it, and SHALL mark the dependent Signals as unknown with an Unknown_Reason of `timeout`.

### Requirement 11: Deterministic time handling

**User Story:** As a developer, I want evidence computed against an injected clock, so that results are reproducible and the Death_Score_Engine stays pure.

#### Acceptance Criteria

1. THE Npm_Evidence_Stage SHALL take Now as a parameter and SHALL NOT read the system clock during Months_Since calculations or cache expiry checks.
2. THE Npm_Evidence_Stage SHALL compute Months_Since as the number of whole calendar months, rounded down to an integer of 0 or greater, between the given timestamp and Now.
3. IF a valid ISO 8601 timestamp is later than Now, THEN THE Npm_Evidence_Stage SHALL set the Months_Since value to 0.
4. IF a timestamp is not a valid ISO 8601 date, THEN THE Npm_Evidence_Stage SHALL mark the dependent Signal as unknown with an Unknown_Reason of `malformed_response`, SHALL NOT produce a Months_Since value for that timestamp, and SHALL continue evaluating the remaining Signals.
5. IF Now is not a valid date, THEN THE Npm_Evidence_Stage SHALL reject the invocation with an error indicating an invalid Now, and SHALL NOT perform any Http_Client requests or cache reads.
6. WHEN the Npm_Evidence_Stage is invoked twice with the same Http_Client responses, the same package name, the same version range, and the same Now, THE Npm_Evidence_Stage SHALL return deep-equal Evidence_Result values.
7. FOR ALL timestamps T and times N1 less than or equal to N2, Months_Since(T, N1) SHALL be less than or equal to Months_Since(T, N2).

### Requirement 12: Recorded fixtures and zero-network tests

**User Story:** As a maintainer, I want tests built on real recorded responses, so that parsers are checked against what the sources actually return.

#### Acceptance Criteria

1. THE test suite SHALL perform zero real network requests, and SHALL use only a fake Http_Client backed by Fixtures.
2. THE test suite SHALL store Fixtures under `__fixtures__/` next to the tests that use them.
3. THE test suite SHALL include Fixtures recorded from real responses for each of five cases: a healthy package (`picocolors`), a deprecated package (`request`), a package with a known replacement (`is-number` or `left-pad`), a package whose GitHub repository is archived, and a package with no `repository` field.
4. IF the fake Http_Client receives a request for which no Fixture exists, THEN THE fake Http_Client SHALL fail the running test with an error identifying the unmatched request, and SHALL make no real network request.
5. WHEN run against the `picocolors` Fixtures, THE Npm_Evidence_Stage SHALL return `deprecated` known false and `knownReplacementExists` known false.
6. WHEN run against the `request` Fixtures, THE Npm_Evidence_Stage SHALL return `deprecated` known true.
7. WHEN run against the known-replacement Fixtures, THE Npm_Evidence_Stage SHALL return `knownReplacementExists` known true and a Replacement_Info containing a non-empty replacement name.
8. WHEN run against the archived-repository Fixtures, THE Npm_Evidence_Stage SHALL return `repoArchived` known true.
9. WHEN run against the no-repository Fixtures, THE Npm_Evidence_Stage SHALL return `repoArchived` and `monthsSinceLastCommit` unknown, each with an Unknown_Reason of `not_applicable`.
10. THE Npm_Evidence_Stage SHALL pass a compile-time check (`npm run typecheck` reports zero errors) showing that Evidence_Result.signals is assignable to the `/skeleton` PackageSignals type.
11. WHEN the output for each of the five Fixture cases is passed to the Death_Score_Engine, THE Death_Score_Engine SHALL return a score without throwing an error.

### Requirement 13: Property-based tests with sabotage checks

**User Story:** As a maintainer, I want the evidence stage proven by properties that can actually fail, so that green tests mean something.

#### Acceptance Criteria

1. THE test suite SHALL include one fast-check property for each of five subjects, each configured with `numRuns` of 100: repo URL parsing, failure isolation, cache transparency, determinism, and Months_Since (monotonicity and non-negativity).
2. THE repo URL parsing property SHALL assert that every valid GitHub URL form generated for a given owner and repository name maps to the same Repo_Ref, and that every generated non-GitHub URL maps to no Repo_Ref.
3. THE failure isolation property SHALL assert that, for any subset of failing Sources (including the empty subset and the full set), the result is a valid PackageSignals, each Signal that depends on a failed Source is unknown, and every other Signal is deep-equal to its value from the run with no failing Sources.
4. THE cache transparency property SHALL assert that a read served from the Cache_Layer is deep-equal to the read that populated it, and that a read of an entry whose age is greater than its TTL triggers exactly one refetch.
5. THE determinism property SHALL assert that two runs with the same Fixtures and the same Now produce deep-equal Evidence_Result values.
6. THE Months_Since property SHALL assert that, for any two Now values where the second is greater than or equal to the first, the second Months_Since value is greater than or equal to the first, and that every Months_Since value is greater than or equal to 0.
7. THE test suite SHALL include one sabotage check for each property in this requirement, which runs the property against a deliberately wrong implementation and confirms that the property fails.
8. IF a sabotage check run does not produce a property failure, THEN THE test suite SHALL report a test failure that names the property whose sabotage check passed.
9. WHERE the CI environment is detected, THE test suite SHALL run every property with a fixed fast-check seed.
10. IF a property fails, THEN THE test suite SHALL print the fast-check seed and the shrunk counterexample in the test output.

### Requirement 14: Scope and dependencies

**User Story:** As a maintainer, I want the evidence stage kept small and one-directional, so that the kit stays reusable.

#### Acceptance Criteria

1. THE Npm_Evidence_Stage SHALL import modules from `/skeleton` only through the skeleton package's public exports.
2. THE `/skeleton` package SHALL contain zero import statements, static or dynamic, that resolve to a module under `/apps/exorcist-npm`.
3. THE Npm_Evidence_Stage SHALL make zero calls to a large language model, and SHALL declare zero dependencies on a large language model client library.
4. THE Npm_Evidence_Stage SHALL complete an evidence call with no API key, token, or account configured.
5. WHERE `GITHUB_TOKEN` is set to a non-empty value, THE Npm_Evidence_Stage SHALL send it only as the authorization credential on GitHub REST API requests, and SHALL NOT send it to the npm registry, OSV.dev, deps.dev, or e18e sources.
6. IF `GITHUB_TOKEN` is set and the GitHub REST API rejects it as invalid or expired, THEN THE Npm_Evidence_Stage SHALL retry that request once without the token, performing the retry through the Cache_Layer and the Http_Client like any other request and keeping the token out of every Cache_Layer key, and SHALL add a warning to the Evidence_Result `warnings` list indicating the token was rejected.
7. THE Npm_Evidence_Stage SHALL export an implementation of the `evidence` stage of the skeleton adapter interface, and SHALL NOT export an implementation of the `inventory`, `replacement`, or `proof` stage.
