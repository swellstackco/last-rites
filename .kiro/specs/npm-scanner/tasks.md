# Implementation Plan: npm-scanner

## Overview

This plan implements the Npm_Scanner in `/apps/exorcist-npm/src/scan/` per the npm-scanner design: TypeScript (strict, ESM), Vitest + fast-check, zero network in tests. It delivers the pure modules (repo-target, inventory, report codec, assemble, rate limiter, client-ip, config), recorded fixtures, the repo fetcher, pool, deadline and pipeline, the API handler, demo store, watchdog, runtime, production fetch client and server, the demo snapshot script, all eight correctness properties (the six in Requirement 14 plus the additive scan-p7 and scan-p8) with sabotage checks, and the final wiring. Scope is the scan component only: no UI, MCP server, replacement or proof stage, and no change to `/skeleton`. Phases are sequential; within a phase, tasks are mostly independent.

## Tasks

### Phase 1: Scaffold, types and test support

- [x] 1.1 Apply the small requirement amendments the design recommends to `.kiro/specs/npm-scanner/requirements.md` by targeted edits only (no rewrite): add `internal_error` to the Scan_Error code list in the glossary and to Requirement 5.10; add `internal_error` mapped to HTTP 500 in Requirement 8.8; extend Requirement 14.1 and 14.8 to say that scan-p7 (rate limiter window) and scan-p8 (repo target validation) are additive to the six named subjects; extend the Unscannable_Specifier glossary entry with bare file paths (`file`), `gitlab:`, `bitbucket:`, `gist:`, `ssh:` and scp-like forms (`git`), and `portal:` (`other`).
  - _Requirements: 5.10, 8.8, 14.1, 14.8, 2.3_
- [x] 1.2 Edit `apps/exorcist-npm/package.json` to add the scripts `demo-snapshot` (`vite-node src/scan/demo-snapshot.ts --`), `record-scan-fixtures` (`vite-node src/scan/test-support/record-scan-fixtures.ts --`) and `serve` (`vite-node src/scan/server.ts`). Add no dependency. `npm test` must start none of them.
  - _Requirements: 11.7, 12.5, 12.6_
- [x] 1.3 Create `/demo/.gitkeep` so the directory exists until snapshots are generated manually (task 7.x script, run by the developer).
  - _Requirements: 8.2, 11.1_
- [x] 1.4 Create `src/scan/types.ts`: `DependencyKind`, `KIND_PRECEDENCE`, `SkipReason`, `DependencyEntry`, `SkippedEntry`, `InventoryResult`, `InventoryError`, `InventoryOutcome`, `InventoryStage`, `RepoInput`, `RepoTarget`, `ScannedDependency`, `ScanSummary`, `ScanReport`, `FetchFailureCategory`, `ScanError` (including `internal_error`) and `ScanOutcome`. Import `PackageSignals`, `SignalName`, `GradeBand`, `DeathScoreResult` from `@graveyard-kit/skeleton` and the evidence types from `../evidence/index.js`; never redeclare them. Add a type-level check that the four grade keys of `ScanSummary` equal `GradeBand`.
  - _Requirements: 1.1, 2.1, 2.3, 4.4, 5.5, 5.10, 12.1, 12.2_
- [x] 1.5 Edit `src/evidence/test-support/record-fixtures.ts`: add an optional fourth parameter `version?: string` to `recordPackageCase` that replaces `dist-tags.latest` as the version sent to OSV. When omitted the behavior is unchanged, so existing evidence fixtures and tests are untouched.
  - _Requirements: 13.5, 12.2_
- [x] 1.6 Create `src/scan/test-support/gated-evidence.ts`: `evidenceFor(profile, name)` (pure `EvidenceResult` from about six `PackageSignals` profiles, some tied on score, satisfying the evidence result invariant), `createGatedEvidence({ profileOf, failures })` (calls stay pending until released; records `calls` with name, versionRange and `now`, `inFlight` and `maxInFlight`; rejects, throws synchronously, or rejects with `EvidenceInputError` for names in `failures`), and `driveScan(promise, gate, picks)` (releases pending calls in pick order using `setImmediate` ticks, no real waiting).
  - _Requirements: 13.1, 14.2, 14.6_
- [x] 1.7 Create `src/scan/test-support/counting-clock.ts`: a fake `Clock` fixed at one instant that counts reads, built on the existing `createFakeClock`.
  - _Requirements: 5.6, 14.2_
- [x] 1.8 Checkpoint after Phase 1 - Ensure all tests pass, ask the user if questions arise.

### Phase 2: Pure modules and their properties

- [x] 2.1 Create `src/scan/repo-target.ts` with `parseRepoTarget(input: RepoInput)`: owner `^[A-Za-z0-9-]{1,39}$`, repo `^[A-Za-z0-9._-]{1,100}$` and not `.` or `..`, ref 1 to 200 characters of `[A-Za-z0-9._/-]` without `..`, missing ref becomes `HEAD`, `invalid_repo` wins over `invalid_ref`, never throws.
  - _Requirements: 4.2, 4.8, 4.9, 4.10_
- [x] 2.2 Write the Property 8 test in `repo-target.p8.test.ts` (exporting a `build(impl)` for the central sabotage test), with the sabotage list in `test-support/sabotage/scan-p8.ts` (owner allows underscore; repo `..` allowed; ref containing `..` allowed; ref length limit 201; `invalid_ref` takes precedence over `invalid_repo`; owner length limit 40; ref charset allows `?` and `#`).
  - **Property 8: Repo target validation**
  - **Validates: Requirements 4.8, 4.9, 4.10, 14.1**
- [x] 2.3 Create `src/scan/inventory.ts` with `classifySpecifier(spec)` (the table in the design, `git+` before `http`) and `inventory(manifestText, lockfileText?)`: BOM strip, `Map`-based collection, four-kind shape validation, single workspaces warning, lockfile status precedence (no text, not JSON, not an object, unsupported `lockfileVersion`, no `packages`), Kind_Precedence choice, `node_modules/<name>` lookup via `Object.hasOwn`, usability rules (`link`, `name`, `semver.valid`), kind-conflict and lockfile-mismatch warnings in the fixed order, code-unit sorting. Pure, never throws, no I/O, clock or environment.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 12.3, 12.9_
- [x] 2.4 Create `src/scan/test-support/arbitraries/manifest.ts`: a manifest arbitrary with names from a small pool plus `__proto__`, `constructor`, scoped and upper-case names, subsets of the four kinds, specifiers tagged by intended class (semver, `*`, empty string, dist-tag, `npm:`, git forms, GitHub shorthand with and without `#ref`, `file:`, bare paths, `link:`, `http(s):`, `workspace:`, `portal:`) and an optional `workspaces` field.
  - _Requirements: 14.3_
- [x] 2.5 Write the Property 2 test in `inventory.p2.test.ts` (exporting `build(impl)`), with the sabotage list in `test-support/sabotage/scan-p2.ts` (drop a name that appears in two kinds; range from the last kind; kinds in insertion order; lose prototype-property names; skipped name also in `dependencies`; `localeCompare` sort; no conflict warning; conflict warning on identical ranges).
  - **Property 2: Inventory completeness and partition**
  - **Validates: Requirements 1.1, 1.4, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8, 12.9, 14.3, 14.10**
- [x] 2.6 Write inventory example tests in `inventory.test.ts`: each row of the classification table, empty, whitespace-only and truncated manifest text, each invalid shape with the offending field in the message, BOM, zero dependencies, workspaces warning, `npm:` alias, git specifier, `workspace:` specifier, a name in two kinds, `*` and `""` as registry specifiers, shorthand versus dist-tag, lockfile version 1, no lockfile, unparseable lockfile, non-object lockfile, no `packages` map, `link: true`, mismatched `name`, invalid lockfile version, lockfile version outside the range.
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.2, 2.3, 3.3, 3.4, 3.5, 3.6, 3.7, 13.8_
- [x] 2.7 Create `src/scan/report.ts`: `serializeReport` (fixed key order from the design table, two-space indent, one trailing newline, absent optional fields omitted, rebuilt objects never relying on input key order), `parseReport` (categories `empty`, `invalid_json`, `missing_field`, `wrong_type`, `not_canonical`; strict structural walk; message names the path; never throws) and `REAL_CODEC`.
  - _Requirements: 7.4, 7.5, 7.6, 7.7_
- [x] 2.8 Create `src/scan/test-support/arbitraries/report.ts`: a `ScanReport` arbitrary built field by field (empty and non-empty arrays, present and absent optional fields including an empty `sourceUrls` object, unicode and escaped strings, all grade bands, integers only and never `-0`).
  - _Requirements: 14.7_
- [x] 2.9 Write the Property 6 test in `report.p6.test.ts` (exporting `build(codec)`), with the sabotage list in `test-support/sabotage/scan-p6.ts` (four-space indent; no trailing newline; input key order; drop `resolvedVersion`; sort `dependencies` on serialize; absent optional as `null`; lenient parse without the canonical comparison; parse throws on empty text; parse fills a missing field; omit an empty `sourceUrls`).
  - **Property 6: Canonical_Json round trip and strictness**
  - **Validates: Requirements 7.4, 7.5, 7.6, 7.7, 14.7**
- [x] 2.10 Write report example tests in `report.test.ts`: a handwritten report with the exact expected text, each `ReportParseError` category with its path message, optional field omission, and the unknown-key rejection in `sourceUrls` and `unknownReasons`.
  - _Requirements: 7.4, 7.5, 7.6_
- [x] 2.11 Create `src/scan/assemble.ts` with `compareScanned` and `assembleReport`: sort by `death.score` descending then name ascending in code-unit order, summary counts from `death.grade`, `repo` as `owner/repo`, `ref`, and unchanged `skipped` and `warnings`.
  - _Requirements: 5.4, 5.5, 5.7_
- [x] 2.12 Write assemble example tests in `assemble.test.ts`: score tie broken by name, mixed-case names in code-unit order, summary counts for each grade, empty input, `skipped` and `warnings` copied unchanged. The property for this module (Property 4) is written in Phase 6 because it runs over `scanOne`.
  - _Requirements: 5.4, 5.5, 5.7_
- [x] 2.13 Create `src/scan/api/rate-limit.ts` with `createRateLimiter({ limit, windowSeconds, clock, maxKeys })`: sliding-window log, expiry at age greater than or equal to the window, refused requests not recorded, `retryAfterSeconds = max(1, ceil((oldest + window - now) / 1000))`, `maxKeys` default 10000 with an empty-key sweep then least-recently-used eviction, and `size()`.
  - _Requirements: 9.4, 9.6, 9.9_
- [x] 2.14 Write the Property 7 test in `api/rate-limit.p7.test.ts` (exporting `build(factory)`), with the sabotage list in `test-support/sabotage/scan-p7.ts` (inclusive window boundary; count refused requests; floored `retryAfterSeconds`; unclamped or millisecond `retryAfterSeconds`; one shared counter; limit off by one; never evict at `maxKeys`).
  - **Property 7: Rate limiter window**
  - **Validates: Requirements 9.4, 9.9, 14.1**
- [x] 2.15 Create `src/scan/api/client-ip.ts` with `clientIp(req, trustProxy)`: last trimmed `x-forwarded-for` entry when `trustProxy` is true, socket address when the header is absent or the last entry is empty, header ignored when false, literal `"unknown"` when neither exists. Include the nginx deployment note in a comment.
  - _Requirements: 9.7, 9.8_
- [x] 2.16 Write client-ip tests in `api/client-ip.test.ts`: examples for each branch plus one fast-check property (`numRuns` 100 through `fc-runner.ts`) that `trustProxy: false` ignores any header value and `trustProxy: true` returns the trimmed last entry.
  - _Requirements: 9.7, 9.8_
- [x] 2.17 Create `src/scan/api/config.ts`: `ScanApiConfig`, `DEFAULT_SCAN_API_CONFIG` (port 27431, scan 10 per 60, demo 120 per 60, timeout 60, `trustProxy` false, `demoDir` resolved to `<repo root>/demo`, `maxDependencies` 300), `ScanApiConfigError`, `validateScanApiConfig` (names the invalid field) and `parsePortEnv` (the only reader of the `PORT` value; accepts only `/^[0-9]{1,5}$/` in 1 to 65535).
  - _Requirements: 9.11, 10.2, 10.3, 10.4_
- [x] 2.18 Write config tests in `api/config.test.ts`: each invalid field named in the error, defaults, `parsePortEnv` examples (`undefined`, `""`, `" 80"`, `"+80"`, `"80.0"`, `"8e1"`, `"0"`, `"65536"`), plus one fast-check property (`numRuns` 100) that `parsePortEnv` accepts exactly the digit strings with a value from 1 to 65535.
  - _Requirements: 9.11, 10.3, 10.4_
- [x] 2.19 Checkpoint after Phase 2 - Ensure all tests pass, ask the user if questions arise.

### Phase 3: Fixture recording

- [x] 3.1 Create `src/scan/test-support/record-scan-fixtures.ts`, a manual script (never run by `npm test`; guarded by `!process.env["VITEST"]`) that reuses `createRecorder` and `recordPackageCase`: check the repo is public and MIT through the unrecorded REST call, pin the commit SHA, record `package.json` and `package-lock.json` from `raw.githubusercontent.com` at the SHA, refuse unless `lockfileVersion` is 2 or 3 and `packages` lists at most 25 entries, run the real `inventory`, record each registry dependency with the lockfile version, write `meta.json` and a README entry, and warn when no direct dependency is deprecated or e18e-listed. Unauthenticated, no request headers stored, never reads `GITHUB_TOKEN`.
  - _Requirements: 13.4, 13.5, 4.1_
- [x] 3.2 Choose a real public MIT-licensed repository meeting the criteria (lockfile v2 or v3, at most 25 packages, at least one deprecated or e18e-listed direct dependency if one exists) and record its `package.json`, `package-lock.json` and `meta.json` under `src/scan/__fixtures__/<case>/`.
  - _Requirements: 13.4_
- [x] 3.3 Record and commit one evidence fixture directory per registry dependency of the chosen repository under `__fixtures__/<case>/<pkg>/` (scoped names stored as `@scope__pkg`), using the lockfile version for the OSV request.
  - _Requirements: 13.5_
- [x] 3.4 Write `src/scan/__fixtures__/README.md` naming the repository and commit SHA, the license, the lockfile version, the package count, and which dependency is deprecated or e18e-listed (or that none was found).
  - _Requirements: 13.4_
- [x] 3.5 Checkpoint after Phase 3 - Ensure all tests pass, ask the user if questions arise.

### Phase 4: Repo fetch, deadline, pool and pipeline

- [x] 4.1 Create `src/scan/stop-signal.ts`: `StopSignal`, `StopController` and `createDeadline(clock, timeoutMs)` that reads the clock once at creation and once per `aborted` read, aborted when elapsed is greater than or equal to the timeout or `abort()` was called.
  - _Requirements: 6.5, 9.10_
- [x] 4.2 Write deadline tests in `stop-signal.test.ts` with the fake clock: not aborted before the timeout, aborted exactly at it, `abort()` wins, no real timer.
  - _Requirements: 6.5, 9.9_
- [x] 4.3 Create `src/scan/pool.ts` with `runPool(items, limit, worker, signal?)`: shared counter, `min(limit, items.length)` worker loops, results written by index, signal checked before starting each item, `stoppedEarly` flag.
  - _Requirements: 5.2, 6.5_
- [x] 4.4 Write pool example tests in `pool.test.ts`: results in input order whatever the completion order, never more than `limit` in flight, remaining items start as running ones settle, nothing starts after abort, empty input, `limit` larger than the item count. Concurrency and ordering are also covered by Property 1 in Phase 6.
  - _Requirements: 5.2, 6.5_
- [x] 4.5 Create `src/scan/repo-fetch.ts` with `createRepoFileSource(cache, requestTimeoutMs)`: plain `GET https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<file>` with no headers, cache source key `"github"`, result mapping to `ok`, `not_found` (404 only), or `failed` with a category (410 reported as `network_error`), never throws.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 12.7, 12.8_
- [x] 4.6 Write repo-fetch tests in `repo-fetch.test.ts` with `FakeHttp` and a real `CacheLayer` on a temp directory: exact URLs and absence of headers, `HEAD` default, 404 for each file, each failure category, HTTP 410 and 5xx mapping, a rejected `cache.get`, only the two files requested, and zero requests on a second call within the TTL.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 13.1, 13.7_
- [x] 4.7 Create `src/scan/test-support/memory-files.ts`: `memoryFiles(manifestText, lockfileText?)`, a `RepoFileSource` over generated text, with an option to fail the lockfile fetch with a given category.
  - _Requirements: 13.1_
- [x] 4.8 Create `src/scan/pipeline.ts` with `PipelineDeps`, `PipelineParts`, `REAL_PARTS`, `scanOne`, `failedEvidenceResult` and `createScanPipeline`: one Clock read, target validation, `package.json` then `package-lock.json`, inventory, dependency cap on `dependencies + skipped`, pool with `EvidenceConfig.maxConcurrency`, `versionRange = resolvedVersion ?? declaredRange`, `scoreDeath`, isolation of evidence failures into all-unknown entries, warning order (inventory, lockfile fetch, evidence failures by index), `scan_timeout` on an aborted signal, `internal_error` from a top-level catch so the promise never rejects.
  - _Requirements: 2.6, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 12.1, 12.2_
- [x] 4.9 Write pipeline example tests in `pipeline.test.ts` with in-memory seams: each case of Requirement 13.8 (missing lockfile, missing `package.json`, malformed `package.json`, lockfile version 1, `npm:` alias, git specifier, `workspace:` specifier, a name in two kinds) asserting `ok` and the error code or the `skipped` reason; invalid repo and ref make zero file requests; a lockfile fetch failure adds one warning with the category; dependency cap at the boundary with a small `maxDependencies`; inventory error means zero evidence calls; one Clock read; timeout with a fake-clock deadline gives `scan_timeout` with no report; all evidence failing returns a report with one warning each; `scoreDeath` throwing once falls back, throwing twice gives `internal_error`.
  - _Requirements: 2.6, 4.3, 4.4, 4.5, 4.6, 4.8, 4.10, 5.6, 5.8, 5.9, 5.10, 6.1, 6.5, 6.6, 13.8_
- [x] 4.10 Write `pipeline.fixture.test.ts`: scan the recorded repository (ref = `meta.sha`) with `FakeHttp` and real evidence over the fixtures; assert `ok: true`, every dependency in exactly one of `dependencies` or `skipped`, `resolvedVersion` equal to the lockfile version for every listed registry dependency, `FakeHttp.unmatched` empty; add a second scan on the same temp cache directory asserting the registry requests are made once; add a concurrency check through `FakeHttp.maxInFlight`.
  - _Requirements: 5.2, 5.11, 13.1, 13.2, 13.5, 13.6, 13.7_
- [x] 4.11 Checkpoint after Phase 4 - Ensure all tests pass, ask the user if questions arise.

### Phase 5: API handler, runtime and server

- [x] 5.1 Create `src/scan/api/types.ts`: `ApiRequest` (with lazy `readBody(limitBytes)`), `ApiResponse`, `ApiHandler` and the API error code union.
  - _Requirements: 8.7, 10.6_
- [x] 5.2 Create `src/scan/api/watchdog.ts`: `Watchdog`, `noWatchdog` and `realWatchdog` (the only `setTimeout` in the scanner).
  - _Requirements: 9.10_
- [x] 5.3 Create `src/scan/api/demo-store.ts`: `DEMO_NAME_PATTERN` (`^[a-z0-9][a-z0-9-]{0,63}$`), `DemoStore`, and `createFsDemoStore(demoDir)` that re-checks the name, reads `<demoDir>/<name>.json` as bytes untouched, returns `undefined` for `ENOENT`, `EISDIR` and `ENOTDIR`, and propagates other errors.
  - _Requirements: 8.2, 8.3, 8.4_
- [x] 5.4 Write demo-store tests in `api/demo-store.test.ts` against a temp directory: bytes returned unmodified, missing file, directory in place of a file, names with `/`, `..`, upper-case, empty and 65 characters rejected by the guard, temp directory removed in `afterEach`.
  - _Requirements: 8.2, 8.3, 8.4_
- [x] 5.5 Create `src/scan/fetch-client.ts` with `createFetchClient({ maxBodyBytes, userAgent })`: wraps global `fetch`, `AbortSignal.timeout(req.timeoutMs)`, lower-case response headers, streamed body capped at 32 MiB by default, `HttpClientError("timeout" | "network_error")`, no credentials of its own, redirects followed.
  - _Requirements: 4.1, 4.7, 12.5_
- [x] 5.6 Write fetch-client tests in `fetch-client.test.ts` that stub `globalThis.fetch` inside the test only (restored in `afterEach`, no real request is made): header lower-casing, body cap exceeded, timeout, method and body forwarded, user agent set, no `authorization` header added.
  - _Requirements: 4.1, 13.1, 13.3_
- [x] 5.7 Create `src/scan/runtime.ts` with `createScanRuntime({ http, clock, sleep, evidenceConfig, maxDependencies })`: one `EvidenceStage`, one repo-file `CacheLayer` over its own `ResilientClient` on the same `cacheRoot`, one pipeline; a bad config throws `EvidenceConfigError` before any request.
  - _Requirements: 5.2, 5.11, 10.6, 12.2_
- [x] 5.8 Write runtime tests in `runtime.test.ts` with `FakeHttp` and fixtures: a scan through the runtime succeeds, two scans on one runtime share the cache directory (second makes no registry request), a bad evidence config throws before any request.
  - _Requirements: 5.11, 10.6, 13.1_
- [x] 5.9 Create `src/scan/api/handler.ts` with `createScanApi(deps)`: validates config first, two rate limiters on the injected Clock, default pipeline from `createScanRuntime`, routing, the `POST /api/scan` check order (rate limit, content type 415, size 413, body shape 400, deadline plus watchdog race), outcome-to-status mapping including `internal_error` as 500, `GET /api/demo/:name` with its own limiter, one `errorResponse` helper for the error body shape, never rejects.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.9, 9.10, 9.11, 10.6_
- [x] 5.10 Write handler tests in `api/handler.routing.test.ts`, in-process with no socket: 404 `not_found`, 405 with the `allow` header for each path, error body shape on every error, demo 200 with unmodified bytes and zero pipeline calls, 400 `invalid_demo_name` for `..%2f`, `a/b`, `A`, empty and 65 characters with no store call, 404 `demo_not_found`, separate demo limiter with `retry-after`.
  - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.6, 13.9_
- [x] 5.11 Write handler tests in `api/handler.input.test.ts`: 415 for a wrong content type (`charset` parameter ignored for the accepted type), 413 by `content-length` and by `readBody`, no parse on 413 or 415, 400 `invalid_input` for bad JSON, non-object, missing `repo`, bad `repo` shape and bad `ref`, scan rate limit counted before the 415, 413 and 400 checks, 429 with a positive integer `retry-after`, `trustProxy` true and false.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.7, 9.8, 13.9_
- [x] 5.12 Write handler tests in `api/handler.scan.test.ts`: 200 with the Canonical_Json report for a successful scan, each Scan_Error code mapped to its status (400, 404, 422, 502, 504, 500) with the code as the body `code`, the manual watchdog firing gives 504 `scan_timeout` and stops further work, a bad config is rejected naming the field and nothing listens, no account or token required.
  - _Requirements: 8.1, 8.8, 8.9, 9.10, 9.11, 13.9_
- [x] 5.13 Create `src/scan/server.ts`: `toApiRequest`, `writeApiResponse`, `startServer(handler, { port })` listening on `127.0.0.1` only (host fixed in code), `ServerStartError` naming the port, and `main()` as the only reader of `process.env` (`PORT` through `parsePortEnv`, optional `GITHUB_TOKEN` through `configFromEnv`), exiting 1 with a stderr message on `ScanApiConfigError` or `ServerStartError`. `main()` runs only as the process entry point and when `VITEST` is unset.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 12.5_
- [x] 5.14 Write server tests in `server.test.ts`: `startServer` on port 0 reports the address `127.0.0.1`, a second server on the same port rejects naming the port, an oversized body stops being read, `connection: close` after 413, `parsePortEnv` failure path writes to stderr without opening a socket (with the process exit stubbed).
  - _Requirements: 10.1, 10.4, 10.5, 9.1_
- [x] 5.15 Checkpoint after Phase 5 - Ensure all tests pass, ask the user if questions arise.

### Phase 6: Pipeline-level properties and the central sabotage test

- [ ] 6.1 Create `src/scan/test-support/arbitraries/lockfile.ts`: a lockfile arbitrary built from a generated manifest with per-name variants (usable version, `link: true`, mismatched `name`, invalid semver, missing entry, nested path, extra non-direct packages), `lockfileVersion` drawn from 1, 2, 3, 4 and missing, always with a `packages` map.
  - _Requirements: 14.4_
- [ ] 6.2 Write the Property 1 test in `pipeline.p1.test.ts` (exporting `build(parts)`), with the sabotage list in `test-support/sabotage/scan-p1.ts` (report ordered by completion order with an unsorted assemble; random tiebreak; elapsed-time warning; per-call `new Date()` as `now`; pool that ignores the limit).
  - **Property 1: Determinism and completion-order independence**
  - **Validates: Requirements 5.2, 5.6, 7.1, 7.2, 7.3, 14.2, 14.10**
- [ ] 6.3 Write the Property 3 test in `pipeline.p3.test.ts` (exporting `build(parts)`), with the sabotage list in `test-support/sabotage/scan-p3.ts` (prefer the declared range; evidence gets the declared range; honor `link: true`; ignore a mismatched `name`; include transitive packages; accept lockfileVersion 1 or 4; evidence call for skipped names; mismatch warning twice).
  - **Property 3: Lockfile precedence and what the evidence stage receives**
  - **Validates: Requirements 2.6, 3.1, 3.2, 3.3, 3.4, 3.6, 3.8, 5.1, 12.9, 14.4, 14.10**
- [ ] 6.4 Write the Property 4 test in `assemble.p4.test.ts` (exporting `build(parts)`), with the sabotage list in `test-support/sabotage/scan-p4.ts` (score ascending; no name tiebreak; name descending; `localeCompare` tiebreak; dying counted as dead; summary total includes skipped; `scanOne` drops `replacement`; `scanOne` scores a constant).
  - **Property 4: Sort order, summary counts and scoring**
  - **Validates: Requirements 5.3, 5.4, 5.5, 14.5, 14.10**
- [ ] 6.5 Write the Property 5 test in `pipeline.p5.test.ts` (exporting `build(parts)`), with the sabotage list in `test-support/sabotage/scan-p5.ts` (one failure fails the whole scan; failed dependency dropped; failed as alive; failure poisons later entries; no warning for a failed entry; failed entry with empty `unknownReasons`).
  - **Property 5: Failure isolation**
  - **Validates: Requirements 5.7, 5.10, 6.1, 6.2, 6.3, 6.4, 6.6, 14.6, 14.10**
- [ ] 6.6 Create `src/scan/sabotage.test.ts`: import `SCAN_P1_SABOTAGES` to `SCAN_P8_SABOTAGES` and the eight `build` functions, run each property against every entry of its list with the fixed seed through `assertAllSabotagesCaught` and `assertAllSabotagesCaughtAsync`, fail with `Sabotage "<name>" stayed green for "<property>"`, assert every list is non-empty, assert the sabotages named in Requirement 14.10 exist in the right lists, and assert the real implementations pass every property under the same seed.
  - _Requirements: 14.1, 14.8, 14.9, 14.10, 14.11, 14.12, 14.13, 14.14_
- [ ] 6.7 Checkpoint after Phase 6 - Ensure all tests pass, ask the user if questions arise.

### Phase 7: Demo snapshot script

- [ ] 7.1 Create `src/scan/demo-snapshot.ts`: `DemoRepo`, `DemoFs`, `DemoSnapshotDeps`, `runDemoSnapshots` (sequential; invalid name skipped and counted as failed; failed scan leaves the existing file; write to `.<name>.json.<n>.tmp` then rename; on write or rename failure remove the temp file, keep the old file, count as failed, continue) and `main()` wiring the real fetch client, runtime and `node:fs/promises`, exiting 1 when any repository failed and 0 otherwise. Runs with no GitHub token set. Started only by `npm run demo-snapshot`.
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9_
- [ ] 7.2 Create `src/scan/demo-list.ts` with `DEMO_REPOS`: a short named list of public repositories (names matching `DEMO_NAME_PATTERN`), including the fixture repository.
  - _Requirements: 11.1, 11.8_
- [ ] 7.3 Write demo-snapshot tests in `demo-snapshot.test.ts` with `FakeHttp` or a fake pipeline, a fake `DemoFs` and a newly created temp directory removed in `finally`: success writes canonical text through a temp file then a rename, failed scan leaves the old file and continues, write failure removes the temp file, invalid name skipped, summary decides the exit status, and the two default demo directories (`api/config.ts` and `demo-snapshot.ts`) resolve to the same path.
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.8, 13.10_
- [ ] 7.4 Checkpoint after Phase 7 - Ensure all tests pass, ask the user if questions arise.

### Phase 8: Integration, smoke tests and documentation

- [ ] 8.1 Create `src/scan/index.ts` exporting `inventory`, `createScanPipeline`, `serializeReport`, `parseReport` and the public types. Export no `replacement` or `proof` stage.
  - _Requirements: 12.3_
- [ ] 8.2 Write static smoke tests in `smoke.test.ts`: the scanner imports `/skeleton` only through `@graveyard-kit/skeleton`, no file under `/skeleton` resolves an import under `apps/exorcist-npm`, no scan module imports evidence internals other than `http/cache`, `http/resilient-client` and `http/fetch-json`, `evidence/index.ts` exports are unchanged, no `package.json` declares an LLM client dependency, any added runtime dependency is exact-pinned (none expected), `scan/index.ts` exports `inventory` and no `replacement` or `proof`, `process.env` is read only in the two `main()` functions and `PORT` only through `parsePortEnv`, the three npm scripts exist and no test imports `demo-snapshot` or `server` as an entry point.
  - _Requirements: 10.2, 11.7, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_
- [ ] 8.3 Run `npm run typecheck` across workspaces and `npm test`; fix strict-mode errors and confirm every property runs with `numRuns: 100`, the fixed seed applies when `CI` is set, `FC_SEED` replays, and every sabotage check fails its property as intended.
  - _Requirements: 13.1, 13.2, 14.1, 14.9, 14.12, 14.13, 14.14, 14.15_
- [ ] 8.4 Append a dated entry to `docs/kiro-log.md` noting the npm-scanner build, the eight properties (six required plus scan-p7 and scan-p8), the sabotage results, any shrunk counterexamples surfaced, the chosen fixture repository and commit SHA, and the design decisions worth recording (raw.githubusercontent.com as the file source, plain handler instead of Hono, `internal_error`, the requirement amendments from 1.1).
  - _Requirements: 14.1_
- [ ] 8.5 Final checkpoint - Ensure all tests pass, ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "id": 1, "tasks": ["1.6", "1.7", "2.1", "2.3", "2.7", "2.11", "2.13", "2.15", "2.17", "4.1", "4.5", "5.1", "5.2", "5.3", "5.5"] },
    { "id": 2, "tasks": ["2.2", "2.4", "2.6", "2.8", "2.10", "2.12", "2.14", "2.16", "2.18", "3.1", "4.2", "4.3", "4.6", "4.7", "5.4", "5.6"] },
    { "id": 3, "tasks": ["2.5", "2.9", "3.2", "4.4", "4.8", "6.1"] },
    { "id": 4, "tasks": ["3.3", "4.9", "5.7", "6.2", "6.3", "6.4", "6.5", "7.1", "8.1"] },
    { "id": 5, "tasks": ["3.4", "4.10", "5.8", "5.9", "6.6", "7.2", "7.3"] },
    { "id": 6, "tasks": ["5.10", "5.11", "5.12", "5.13"] },
    { "id": 7, "tasks": ["5.14", "8.2"] },
    { "id": 8, "tasks": ["8.3"] },
    { "id": 9, "tasks": ["8.4"] }
  ]
}
```

## Notes

- Scope is the scan component only. The UI, the MCP server, the `replacement` and `proof` stages, and any adapter interface in `/skeleton` belong to other specs.
- Tests perform zero network requests: `no-network.setup.ts` is loaded for every test file, `FakeHttp` is the only `HttpClient`, and fixtures are recorded once by `record-scan-fixtures.ts` (a manual step run by the developer, never by `npm test`). Task 5.6 stubs `globalThis.fetch` inside the test and restores it, so no request leaves the process.
- Per the tech steering, properties use `numRuns: 100`; the fast-check seed is fixed when `CI` is set and replayable with `FC_SEED`.
- Per `proof-rules.md`, every numbered property has a sabotage list in `test-support/sabotage/scan-pN.ts`, and `sabotage.test.ts` (6.6) runs all of them. Each property test file exports a `build(...)` function so the central test can swap in a wrong implementation.
- Property 4 sits in Phase 6, not next to `assemble.ts`, because it runs over `parts.scanOne`; task 2.12 gives `assemble.ts` example tests in the meantime.
- Scan-p7 and scan-p8 are additive to the six properties in Requirement 14 (task 1.1 amends the requirement text). The `clientIp` and `parsePortEnv` tests (2.16, 2.18) each carry one small fast-check property to satisfy "every pure module gets a property"; the design does not number them or give them sabotage lists, so a reviewer may want to add lists or fold them into the numbered set later.
- Fixture recording (3.2, 3.3) needs the developer's network and is run manually. If no repository meets every criterion, fall back as the design's Risks section describes.
- The `/demo/*.json` snapshots are generated by running `npm run demo-snapshot -w @graveyard-kit/exorcist-npm` by hand after Phase 7; `.gitkeep` holds the directory until then.
- Commits reference spec task numbers (for example, `npm-scanner 2.3: ...`) per the structure steering file.
- Test sub-tasks are not marked optional, matching the earlier plans: the product principle is proof over claims.
