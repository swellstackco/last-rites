# Implementation Plan: npm-evidence

## Overview

This plan implements the Npm_Evidence_Stage in `/apps/exorcist-npm/src/evidence/` per the npm-evidence design: TypeScript (strict, ESM), Vitest + fast-check, zero network in tests. It delivers the pure modules, the cache and resilient HTTP layer, recorded fixtures for the five required cases, the five sources, the stage, all 11 correctness properties with sabotage checks, and the final wiring. Scope is the evidence stage only: no scanner, API, UI, replacement, proof or inventory stage. Phases are sequential; within a phase, tasks are mostly independent.

## Tasks

### Phase 1: Scaffold, types and test support

- [x] 1.1 Create `apps/exorcist-npm/package.json` (name, ESM, dependency on `@graveyard-kit/skeleton`, exact-pinned `semver`, no LLM client dependency), `tsconfig.json` extending `tsconfig.base.json`, and a Vitest setup file that replaces `globalThis.fetch` with a function that fails the test. Remove `.gitkeep` once real files exist.
  - _Requirements: 1.2, 12.1, 14.1, 14.3_
- [x] 1.2 Create `src/evidence/types.ts`, `src/evidence/http/types.ts` and `src/evidence/config.ts`: `Source`, `FailureCategory`, `UnknownReason`, `ReplacementInfo`, `EvidenceInput`, `EvidenceResult`, `EvidenceStage`, `EvidenceInputError`, `EvidenceConfigError`, `HttpClient`, `HttpRequest`, `HttpResponse`, `HttpClientError`, `Clock`, `Sleep`, `EvidenceConfig`, `DEFAULT_CONFIG` (TTLs 3600/3600/21600/86400/86400, timeout 10000, concurrency 4, retries 3, GitHub max wait 60, deps.dev off), `validateConfig` and `configFromEnv`. Import `PackageSignals`, `SignalValue` and `SignalName` from `@graveyard-kit/skeleton`; never redeclare them.
  - _Requirements: 1.2, 8.6, 10.1, 10.2, 10.7, 10.10, 14.1_
- [x] 1.3 Create `src/evidence/test-support/fc-runner.ts` (resolve seed from `FC_SEED` or fixed seed when `CI` is set, `checkProperty`, `assertProperty`, `formatReport` printing seed and shrunk counterexample, default `numRuns: 100`) and `test-support/sabotage-runner.ts` (`runAgainst`, `runSabotageChecks` that fails with `Sabotage "<name>" stayed green for "<property>"`), mirroring the skeleton helpers without deep-importing them.
  - _Requirements: 13.7, 13.8, 13.9, 13.10, 14.1_
- [x] 1.4 Create `test-support/fake-http.ts` (fixture-backed `HttpClient` that records every request, throws `UnmatchedFixtureRequest` on a miss and exposes the recorded list so tests assert it is empty in `afterEach`; supports injected failure modes and controllable release order), `fake-clock.ts`, `fake-sleep.ts` (records waits, never delays) and `temp-cache.ts` (fresh temp directory per run). Define the on-disk fixture layout under `__fixtures__/<case>/`.
  - _Requirements: 8.9, 8.10, 10.9, 12.1, 12.2, 12.4_

### Phase 2: Pure modules

- [x] 2.1 Create `src/evidence/months-since.ts` with `monthsSince(timestamp, now): number | undefined` using UTC components, the lexicographic day-of-month and time-of-day tuple rule, and a clamp to 0 for future timestamps; return `undefined` for unparseable input.
  - _Requirements: 11.1, 11.2, 11.3, 11.4_
- [x] 2.2 Write the Property 6 test (Months_Since is non-negative and monotone in Now) in `months-since.p6.test.ts`, with the sabotage list in `test-support/sabotage/p6.ts` (no clamp; absolute value of the month difference; month number only, ignoring years).
  - **Property 6: Months_Since is non-negative and monotone in Now**
  - **Validates: Requirements 11.2, 11.3, 11.7, 13.6, 13.7**
- [x] 2.3 Write the Property 7 test (Months_Since counts whole calendar months) in `months-since.p7.test.ts`, with the sabotage list in `test-support/sabotage/p7.ts` (ignores the day-of-month tuple; `floor(days / 30)`; rounds up).
  - **Property 7: Months_Since counts whole calendar months**
  - **Validates: Requirements 11.2, 13.7**
- [x] 2.4 Create `src/evidence/repo-url.ts` with `parseRepoUrl(field: unknown): RepoRef | undefined` per the design (no `URL` class, nine accepted forms, fragment/query/monorepo-path/`.git`/trailing-slash stripping, case-insensitive host, trim, name validation, reject `.` and `..`, never throws).
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_
- [x] 2.5 Write the Property 1 test (every GitHub URL form maps to the same Repo_Ref) in `repo-url.p1.test.ts`, with the sabotage list in `test-support/sabotage/p1.ts` (does not strip `.git`; case-sensitive host; no trim; whole path as repo).
  - **Property 1: Every GitHub URL form maps to the same Repo_Ref**
  - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.10, 13.2, 13.7**
- [x] 2.6 Write the Property 2 test (non-GitHub and invalid values map to no Repo_Ref and never throw) in `repo-url.p2.test.ts`, with the sabotage list in `test-support/sabotage/p2.ts` (accepts any host; accepts a repo over 100 characters; throws on non-string input).
  - **Property 2: Non-GitHub and invalid values map to no Repo_Ref and never throw**
  - **Validates: Requirements 3.7, 3.8, 3.9, 13.2, 13.7**
- [x] 2.7 Create `src/evidence/version.ts` with `resolveVersion(doc, range?)` returning `resolved`, `none` or `no_match` (whitespace-only range treated as none; `semver.maxSatisfying`; dist-tag fallback). Write example tests for pre-release ranges, dist-tag ranges, no-match ranges and a `latest` that is missing from `versions`.
  - _Requirements: 1.3, 1.4, 1.5, 2.8_
- [x] 2.8 Create `src/evidence/osv-count.ts` with `countOpenVulnsNoFix(vulns, name)`: distinct ids, npm ecosystem and name match, `fixed` events only, `last_affected` is not a fix, unmatched vulnerabilities count as unfixed.
  - _Requirements: 5.2, 5.3_
- [x] 2.9 Write the Property 8 test (open-vulnerability count matches the unfixed-id model) in `osv-count.p8.test.ts`, with the sabotage list in `test-support/sabotage/p8.ts` (counts objects not ids; `last_affected` as a fix; ignores ecosystem; examines only the first affected entry).
  - **Property 8: Open-vulnerability count matches the unfixed-id model**
  - **Validates: Requirements 5.2, 5.3, 13.7**
- [x] 2.10 Checkpoint after Phase 2 - Ensure all tests pass, ask the user if questions arise.

### Phase 3: Cache and resilient HTTP layer

- [x] 3.1 Create `src/evidence/http/cache.ts` with `CacheLayer` per the design: sha256 key over method, URL and body (headers excluded), `<root>/.cache/<hash>.json`, `schema: 1` entries, TTL check from the injected clock (`age >= ttl` is expired, future `storedAt` is absent), atomic write, ignore write failures, failures never written, unreadable or invalid files treated as absent, `fromCache` carried outside `response`.
  - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10_
- [x] 3.2 Write the Property 4 test (cache transparency and TTL) in `http/cache.p4.test.ts`, with the sabotage list in `test-support/sabotage/p4.ts` (ignores TTL; `age == ttl` treated as fresh; two client calls on expiry; never writes; lossy copy).
  - **Property 4: Cache transparency and TTL**
  - **Validates: Requirements 8.4, 8.5, 8.10, 13.4, 13.7**
- [x] 3.3 Write the Property 9 test (cache keys map one-to-one to files, inside the root) in `http/cache.p9.test.ts`, with the sabotage list in `test-support/sabotage/p9.ts` (key includes headers; ignores body; ignores method).
  - **Property 9: Cache keys map one-to-one to files**
  - **Validates: Requirements 8.3, 8.9, 13.7**
- [x] 3.4 Create `src/evidence/http/resilient-client.ts` with `ResilientClient`: counting-semaphore scheduler acquired per attempt, 429 retry with `retry-after` or `min(30, 2^attempt)` backoff through the injected `Sleep`, no retry on timeout, retries bounded by `maxRetries`, GitHub rate-limit gate using `x-ratelimit-remaining`/`x-ratelimit-reset` from live responses only, `githubMaxWaitSeconds` cutoff, and 403 with `x-ratelimit-remaining: 0` classified as `rate_limited`. Add `http/fetch-json.ts` with the failure classification table.
  - _Requirements: 10.1, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10_
- [x] 3.5 Write the Property 10 test (concurrency never exceeds the configured maximum) in `http/resilient-client.p10.test.ts`, with the sabotage list in `test-support/sabotage/p10.ts` (no limit; limit of `M + 1`; slot released before the client call settles).
  - **Property 10: Concurrency never exceeds the configured maximum**
  - **Validates: Requirements 10.1, 13.7**
- [x] 3.6 Write example tests for the cache and resilient client: second run makes zero client calls, corrupt cache file overwritten, failure does not overwrite an existing entry, `retry-after` honored, backoff doubles and caps at 30, retries bounded, timeout not retried, gate waits for `x-ratelimit-reset`, wait above the maximum yields `rate_limited`, stale cached rate-limit headers do not trigger the gate.
  - _Requirements: 8.5, 8.7, 8.8, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.10_
- [x] 3.7 Checkpoint after Phase 3 - Ensure all tests pass, ask the user if questions arise.

### Phase 4: Fixture recording

- [x] 4.1 Create `src/evidence/test-support/record-fixtures.ts`, a manual script (never run by `npm test`) that performs live requests for a named case through the real HTTP client and writes the responses into `__fixtures__/<case>/` in the layout defined in 1.4. It must not record request headers or the GitHub token.
  - _Requirements: 12.1, 12.2, 14.4_
- [x] 4.2 Record and commit the `picocolors` case (healthy package: npm document, GitHub repository and commit, OSV response) plus the three shared e18e manifests (`native`, `micro-utilities`, `preferred`) and one deps.dev response used to confirm the field names for `depsdev.ts`.
  - _Requirements: 12.2, 12.3, 12.5_
- [x] 4.3 Record and commit the `request` case (deprecated package: npm document, GitHub repository and commit, OSV response).
  - _Requirements: 12.2, 12.3, 12.6_
- [x] 4.4 Record and commit the known-replacement case using `left-pad` (or `is-number` if `left-pad` lacks an e18e entry): npm document, GitHub repository and commit, OSV response; confirm the e18e entry has a non-empty replacement.
  - _Requirements: 12.2, 12.3, 12.7_
- [x] 4.5 Record and commit the archived-repository case: pick a published npm package whose GitHub repository has `archived: true`, record its npm document, GitHub repository and commit, and OSV response, and note the chosen package name in the fixture directory README.
  - _Requirements: 12.2, 12.3, 12.8_
- [x] 4.6 Record and commit the no-repository case: pick a published npm package whose registry document has no `repository` field, record its npm document and OSV response. No GitHub fixtures exist for this case.
  - _Requirements: 12.2, 12.3, 12.9_

### Phase 5: Sources, assembly and stage

- [x] 5.1 Create `src/evidence/sources/npm.ts`: `GET https://registry.npmjs.org/<encoded name>` through the cache, per-field parsing of the Resolved_Version deprecation message, latest valid `time` entry (ignoring `created` and `modified`), `maintainers` count and `repository` field, 404 as `not_found`. Returns an `Outcome`, never throws.
  - _Requirements: 1.5, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 9.1, 9.7_
- [x] 5.2 Create `src/evidence/sources/github.ts`: repository metadata then latest commit on the default branch (`committer.date`, falling back to `author.date`), bearer token only when configured, one retry without the token after a 401 with a "token rejected" warning, `not_found` for 404, commit failure keeps `repoArchived`.
  - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 14.5, 14.6_
- [x] 5.3 Create `src/evidence/sources/osv.ts`: `POST https://api.osv.dev/v1/query` with the package name, ecosystem and Resolved_Version, follow `next_page_token` for up to 10 pages, `incomplete` if the token remains, no request without a Resolved_Version.
  - _Requirements: 5.1, 5.4, 5.5, 5.6, 5.7, 5.8_
- [x] 5.4 Create `src/evidence/sources/e18e.ts`: fetch the three manifests in fixed order, `Object.hasOwn` lookup, first manifest in order wins, build `ReplacementInfo` (first of `replacements`, plus the full list), unknown when a manifest failed and none retrieved matched, unknown with `malformed_response` when the matching entry has no readable `type`.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
- [x] 5.5 Create `src/evidence/sources/depsdev.ts`: disabled by default, one `GET https://api.deps.dev/v3/systems/npm/packages/<name>`, fills only unknown `deprecated` and `monthsSinceLastPublish`, no retry, source URL `https://deps.dev/npm/<name>`, zero requests when nothing fillable is unknown or when no Repo_Ref was the only gap.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_
- [ ] 5.6 Create `src/evidence/assemble.ts`, a pure `assembleResult(outcomes)`: compute Months_Since from `now`, build each `SignalValue`, set `sourceUrls` only for known signals, set `unknownReasons` only for unknown signals with messages built from category, source and public URL only, order everything by `SIGNAL_NAMES`, and map `not_applicable` when no Repo_Ref exists.
  - _Requirements: 1.1, 4.4, 9.2, 9.4, 9.5, 9.6, 9.8, 11.4_
- [ ] 5.7 Create `src/evidence/stage.ts` and `src/evidence/index.ts`: `createEvidenceStage(config, deps)` validates config first, validates `now` then name before any I/O, builds `CacheLayer(ResilientClient(http))`, runs npm then github, osv and e18e independently with a last-resort catch per source, short-circuits to all-unknown `not_found` on npm 404 or a range with no match, optionally runs deps.dev, then calls `assembleResult`. Export `createEvidenceStage`, `configFromEnv` and the public types; export no `inventory`, `replacement` or `proof` stage.
  - _Requirements: 1.1, 1.5, 1.6, 1.7, 9.3, 10.2, 11.5, 14.7_
- [ ] 5.8 Write example tests for the sources against fixtures and fakes: npm (missing `maintainers`, missing `time`, absent Resolved_Version, empty maintainers, 404), GitHub (404, 5xx, rate limit, no commits, token header present or absent, 401 then retry with warning, redirect), OSV (request body, three pages, ten pages, endless token giving `incomplete`, zero calls with no Resolved_Version), e18e (match in each manifest, duplicate across manifests, `__proto__`, no replacements, no type, one manifest failing), deps.dev (disabled gives zero calls, all known gives zero calls, one call fills only gaps, failure not retried).
  - _Requirements: 2.5, 2.6, 2.7, 2.8, 4.5, 4.6, 4.7, 4.8, 4.9, 5.4, 5.6, 5.8, 6.4, 6.5, 6.6, 7.1, 7.3, 7.6, 7.7, 14.6_
- [ ] 5.9 Write the fixture-case and input tests: for each of the five cases assert the required signals (`picocolors` deprecated false and replacement false, `request` deprecated true, replacement case true with a non-empty name, archived case `repoArchived` true, no-repository case both GitHub signals unknown with `not_applicable`) and that `scoreDeath` accepts each output without throwing; add tests for whitespace names, invalid `now`, invalid configuration, the npm 404 and no-match range paths, each with zero client calls where the requirements say so.
  - _Requirements: 1.5, 1.6, 1.7, 10.2, 11.5, 12.5, 12.6, 12.7, 12.8, 12.9, 12.11_
- [ ] 5.10 Checkpoint after Phase 5 - Ensure all tests pass, ask the user if questions arise.

### Phase 6: Stage-level properties and sabotage harness

- [ ] 6.1 Write the Property 3 test (failure isolation) in `stage.p3.test.ts`, with the `isValidEvidenceResult` helper in `test-support/` and the sabotage list in `test-support/sabotage/p3.ts` (fail-fast; failed-as-alive; npm failure also blanks `knownReplacementExists`; rethrows the first failure). Exclude npm `not_found`, which is covered by 5.9.
  - **Property 3: Failure isolation**
  - **Validates: Requirements 2.5, 4.6, 5.7, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8, 10.8, 13.3, 13.7**
- [ ] 6.2 Write the Property 5 test (determinism and dependence on the injected Now only) in `stage.p5.test.ts`, with the sabotage list in `test-support/sabotage/p5.ts` (reads `new Date()`; random jitter in a reason message; completion-order `unknownReasons` and `warnings`).
  - **Property 5: Determinism and dependence on the injected Now only**
  - **Validates: Requirements 11.1, 11.6, 13.5, 13.7**
- [ ] 6.3 Write the Property 11 test (the GitHub token is confined to GitHub requests and never persisted) in `stage.p11.test.ts`, with the sabotage list in `test-support/sabotage/p11.ts` (token in the cache key; token sent to every host; failure message includes request headers).
  - **Property 11: The GitHub token is confined to GitHub requests and never persisted**
  - **Validates: Requirements 4.8, 4.10, 14.5, 14.6, 13.7**
- [ ] 6.4 Create `src/evidence/sabotage.test.ts` that imports every list under `test-support/sabotage/` (p1 to p11) and runs each sabotage against its property with the fixed seed, failing by name if any sabotage stays green.
  - _Requirements: 13.7, 13.8_

### Phase 7: Integration and documentation

- [ ] 7.1 Write static smoke tests: the app imports `/skeleton` only through `@graveyard-kit/skeleton`, no file under `/skeleton` resolves an import under `apps/exorcist-npm`, `package.json` declares no LLM client dependency, the module exports `createEvidenceStage` and no `inventory`, `replacement` or `proof`, and a type-level test assigns `EvidenceResult["signals"]` to `PackageSignals`.
  - _Requirements: 1.2, 12.10, 14.1, 14.2, 14.3, 14.7_
- [ ] 7.2 Run `npm run typecheck` across workspaces and `npm test`; fix strict-mode errors and confirm every property runs with `numRuns: 100` and every sabotage check fails its property as intended.
  - _Requirements: 12.1, 12.10, 13.1, 13.9, 13.10_
- [ ] 7.3 Append a dated entry to `docs/kiro-log.md` noting the npm-evidence build, the 11 properties, the sabotage results, any shrunk counterexamples surfaced, and the requirement clarifications from the design (npm 404 versus failure isolation, e18e manifests, partial e18e failure).
  - _Requirements: 13.7_
- [ ] 7.4 Final checkpoint - Ensure all tests pass, ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "2.1", "2.4", "2.7", "2.8", "3.1", "3.4"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.5", "2.6", "2.9", "3.2", "3.3", "3.5", "3.6", "4.1", "5.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.6", "5.2", "5.3", "5.4", "5.5"] },
    { "id": 5, "tasks": ["5.6"] },
    { "id": 6, "tasks": ["5.7"] },
    { "id": 7, "tasks": ["5.8", "5.9", "6.1", "6.2", "6.3"] },
    { "id": 8, "tasks": ["6.4", "7.1"] },
    { "id": 9, "tasks": ["7.2"] },
    { "id": 10, "tasks": ["7.3"] }
  ]
}
```

## Notes

- Scope is the evidence stage only. The scanner, API, UI, and the inventory, replacement and proof stages belong to other specs.
- Tests perform zero network requests. Fixtures are recorded once by `record-fixtures.ts` (a manual step run by the developer, never by `npm test`) and committed under `__fixtures__/`.
- Per the tech steering, internal properties use `numRuns: 100`; the fast-check seed is fixed when `CI` is set and replayable with `FC_SEED`.
- Per `proof-rules.md`, every property has a sabotage check: a property that cannot fail is rejected. Each property's sabotage list lives in its own file under `test-support/sabotage/` so tasks never write the same file.
- Commits reference spec task numbers (for example, `npm-evidence 2.4: ...`) per the structure steering file.
- Property 3 excludes npm `not_found` by design (Requirement 1.7 wins over 2.5 and 9.4); that path is covered by the example tests in 5.9.
- Test sub-tasks are not marked optional, matching the death-score plan: the product principle is proof over claims.
