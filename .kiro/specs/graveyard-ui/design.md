# Design

## Overview

The Graveyard_Ui is the first screen of "Last Rites". It turns one Scan_Report into a night graveyard: one tombstone per direct npm dependency, the dead ones large and first, the healthy ones folded into a count, and a click-through breakdown that shows every point of every score with a link to its real source.

It has two parts, split along the rule in `structure.md` ("an app may import from `/skeleton`; `/skeleton` never imports from an app"):

1. **Graveyard_View_Model** in `skeleton/src/graveyard/`. Pure TypeScript, no DOM types, no I/O, no clock. It groups and orders Graves, counts them, builds the Breakdown (signal rows, the calibration row, the total), validates source links, explains signals and grades in words, and defines the ProofSlot data shape. It is generic over a structural `GraveRecord`, so a future adapter (GitHub Actions) reuses it unchanged. It is exported as `@graveyard-kit/skeleton/graveyard`; a test-only subpath `@graveyard-kit/skeleton/graveyard/testing` exports the arbitraries and the property runner for the page's tests.
2. **Graveyard_Page** in the new workspace package `apps/exorcist-web`. Vite + TypeScript, no framework. It holds the Api_Client, the hash router, the state machine, the pure page models (Repo_Input parser, route codec, Ui_Error builder, report header), the DOM views, the night theme CSS and the DOM tests.

The page reads reports from the existing Scan_Api (`GET /api/demo/:name`, `POST /api/scan`), validates every body with the existing `parseReport`, and falls back to static copies of the demo JSON when the API is unreachable. It changes nothing in the scanner, the API or the engine.

## Goals

- The dead packages are the first thing on screen and read clearly in a 1080p screen recording; the click into a breakdown reads just as clearly.
- Every score is visibly the sum of its rows. The calibration row (`death.calibration`) is its own labelled row, so a package at 75 with a weighted sum of 40 is not a mystery.
- An unknown signal is always marked and explained, never shown as clean.
- Rate limits and failures are explained in plain words with a next action; the page is never blank or stuck.
- Hostile report data cannot inject markup or a `javascript:` link.
- The demo cannot break on a cold start: cached demos load from the API or, failing that, from static files.
- Five pure properties (partition, ordering, breakdown arithmetic, header counts, safe links), plus three additive ones, each with a sabotage list that must be caught.

## Non-Goals

- The proof harness, pin tests, spec export, the MCP server, the GitHub Actions app: later specs. This spec ships a disabled placeholder and a fixed data shape only.
- Any change to the Scan_Api, scanner, evidence stage, or death-score engine. No new endpoint (for example a demo list endpoint).
- Accounts, persistence of reports in the browser, server-side rendering, i18n, light theme, print stylesheet.
- Renaming anything to "Last Rites". The name is display text only; the rename of repo and package scopes comes later.
- A UI framework, a CSS framework, an icon font, a web font, a charting library.

## Research Findings

Facts checked in the repository while writing this spec:

- `GET /api/demo/:name` returns the file bytes unmodified; `POST /api/scan` returns Canonical_Json. Errors are `{ "error": { "code", "message" } }`. A 429 carries a positive integer `retry-after` header. Defaults: scan limit 10 per 60 s per IP, demo limit 120 per 60 s per IP, port 24817 on `127.0.0.1`. The handler sets **no CORS headers**, so the page must be same-origin (Vite proxy in dev, nginx in production).
- `parseReport(text)` is a strict structural parser (categories `empty`, `invalid_json`, `missing_field`, `wrong_type`, `not_canonical`) that already handles `death.calibration`. It does **not** check URL schemes or string contents, so a tampered `sourceUrl: "javascript:..."` passes it. `safeHttpUrl` is therefore required in the view model.
- `report.ts` imports at run time only `SIGNAL_NAMES` (skeleton) and `KIND_PRECEDENCE` (`./types.js`); every other import is `import type`. It is safe to bundle for the browser.
- `exorcist-npm/package.json` has no `exports` field, so a subpath export (`./report`) must be added for the page to import `parseReport` and the report types.
- `skeleton/package.json` exports `.` and `./death-score`; the skeleton tsconfig has `lib: ["ES2022"]` (no DOM, no `URL`, no `@types/node`). The view model therefore cannot use `URL`; `safeHttpUrl` is regex-based.
- `skeleton/src/death-score/fc-runner.ts` provides `NUM_RUNS` 100, `FIXED_SEED` 20261113, `resolveSeed`, `assertProperty`, `checkProperty`. Arbitraries live in `death-score/arbitraries.ts` (`packageSignalsArb`, `configWithFloorArb`, `declaredAbandonedArb`).
- Existing sabotage style: each property file exports `build(impl)`, wrong implementations live in `test-support/sabotage/<id>.ts`, a central `sabotage.test.ts` fails with `Sabotage "<name>" stayed green for "<property>"`.
- Root `vitest.config.ts` includes `skeleton/src/**/*.test.ts` and `apps/*/src/**/*.test.ts` and loads `no-network.setup.ts` (replaces global `fetch` with a thrower). A new `apps/exorcist-web` is therefore picked up with no config change. Vitest is 2.1.9, Vite is 5.4.21 (hoisted). `jsdom` is not installed.
- Root `package.json` has `test` and `typecheck` only; **`npm run dev` (promised by `tech.md`) does not exist yet**.
- Demo snapshots: parse-server 84 deps, 5 dead (all calibrated, for example `deprecated + no publish for 43 months (threshold 24)`, +35), 14 ailing, 65 alive, 2 skipped (`file:`), no warnings; prettier 147 deps, 1 dead (`remark-footnotes`), no lockfile warning; jest 70 deps, 0 dead, 0 dying, 8 skipped (`workspace:*`), two warnings; pump 2 deps. No unknown signals, no dying packages, no `evidenceWarnings`, source hosts only `registry.npmjs.org`, `github.com`, `osv.dev`, `raw.githubusercontent.com`. The longest names are 47 characters (`@eslint-community/eslint-plugin-eslint-comments`). Largest file is prettier at 490 KB.

## Architecture

```
                        ┌──────────────────────── browser ────────────────────────┐
 hash change ─────────► │ router.ts   parseRoute / formatRoute  (pure)            │
 (#/demo/x?pkg=y)       │      │                                                  │
                        │      ▼                                                  │
                        │ app/controller.ts  state machine                        │
                        │   picker ─► loading ─► report | error                   │
                        │      │ (latest-request-wins, AbortController)           │
                        │      ▼                                                  │
 click / Enter ───────► │ api/client.ts  (injected fetch, timeouts, fallback)     │
                        │      │  GET /api/demo/:name      POST /api/scan         │
                        └──────┼─────────────────────────────────┼───────────────┘
                               ▼                                 ▼
                    Scan_Api (127.0.0.1:24817, via Vite proxy / nginx)
                               │ 200 text            │ error JSON, 429 + retry-after
                               ▼                     ▼
        parseReport(text) ─► ScanReport      errors.ts  describeError() ─► Ui_Error
                               │
                               ▼
        model/report-view.ts  buildReportView(report, source)
              │   uses  buildGraveyard(report.dependencies)   ◄── skeleton/graveyard (pure)
              ▼
        { header, graveyard: GraveyardView<ScannedDependency>, skipped, notices }
              │
              ▼
        views/*.ts  render with h()/textContent only ─► DOM
              │
   tombstone activate ─► formatRoute(+pkg) ─► buildBreakdown(grave) ─► Detail_Panel
                                          └► proofSlotFor(grave)    ─► Proof section
```

### Data flow in words

1. The router turns the hash into a Route. `picker` shows the Repo_Picker; `demo` triggers a demo load; `live` shows the picker prefilled and never scans by itself.
2. The controller moves to `loading` and asks the Api_Client. A request counter makes the newest request win; the previous request is aborted and a late answer is ignored.
3. On HTTP 200 the body text goes to `parseReport`. A parse error becomes the `bad_response` Ui_Error. On an error status the body is read defensively and `describeError` returns a Ui_Error.
4. A parsed report goes to `buildReportView`, which calls `buildGraveyard` and builds the header model, notices and skipped list.
5. Views render from that model. Opening a tombstone writes `pkg` to the hash; the router then opens the Detail_Panel, which calls `buildBreakdown` and `proofSlotFor` for that Grave.

### Sharing and layering

```
apps/exorcist-web  ──imports──►  @graveyard-kit/skeleton/graveyard     (view model, pure)
                   ──imports──►  @graveyard-kit/skeleton               (toGrade, SIGNAL_NAMES, types)
                   ──imports──►  @graveyard-kit/exorcist-npm/report    (parseReport, report types)
skeleton           ──imports──►  nothing under /apps
```

## Components and Interfaces

### Layout

```
skeleton/
  package.json                       + exports "./graveyard", "./graveyard/testing"
  src/graveyard/
    index.ts                         public API (below)
    types.ts                         GraveRecord, Grave, GradeGroup, GraveyardView, Breakdown*, ProofSlot*
    grade-order.ts                   GRADE_ORDER, GRADE_INFO (labels, ranges derived from toGrade)
    signal-info.ts                   SIGNAL_INFO (label, one-sentence explanation) for all 7 signals
    build-graveyard.ts               compareGraves, buildGraveyard
    breakdown.ts                     buildBreakdown, topSignals, formatCalibration, formatRawValue
    safe-url.ts                      safeHttpUrl, hostOf
    proof-slot.ts                    ProofSlot types, proofSlotFor
    testing.ts                       re-exports: arbitraries, runner helpers (test-only subpath)
    test-support/
      arbitraries.ts                 graveRecordArb, hostileUrlArb, tamperedRecordArb
      sabotage-runner.ts             assertAllSabotagesCaught
      properties/p1.ts .. p5.ts      property builders  (build(impl))
      sabotage/p1.ts .. p5.ts        wrong implementations
    *.test.ts                        example tests, property tests, sabotage.test.ts

apps/exorcist-web/
  package.json  tsconfig.json  vite.config.ts  index.html
  scripts/dev.ts                     starts API + Vite (run with vite-node)
  src/
    main.ts                          wiring: deps, controller, first render
    constants.ts                     PRODUCT_NAME, LIVE_SCAN_LIMIT, timeouts, copy constants
    app/controller.ts                state machine, request-id, cooldown
    app/router.ts                    parseRoute, formatRoute, Route type
    api/client.ts                    createApiClient({ fetch, timers })
    api/errors.ts                    describeError, UiError, KNOWN_ERROR_CODES
    model/repo-input.ts              parseRepoInput
    model/demo-repos.ts              DEMO_REPOS (name, owner/repo, blurb)
    model/report-view.ts             buildReportView, formatScannedAt, buildSummaryHeader
    dom/h.ts                         tiny element builder (textContent only)
    dom/focus.ts                     focus trap, inert helpers, focus restore
    views/picker.ts live-form.ts status.ts header.ts graveyard.ts tombstone.ts
          detail.ts breakdown.ts proof-slot.ts skipped.ts
    styles/tokens.css base.css graveyard.css detail.css
    theme/contrast.ts                contrastRatio, parseHex, hueOf (used by tests only)
    test-support/                    build-report.ts, fake-fetch.ts, dom-harness.ts, fake-timers.ts,
                                     properties/p6.ts p7.ts p8.ts, sabotage/p6.ts p7.ts p8.ts
    __fixtures__/                    trimmed demo reports + README.md
    *.test.ts                        example, DOM, static and property tests

apps/exorcist-npm/package.json       + "exports": { "./report": "./src/scan/report.ts" }
package.json (root)                  + "dev" script
```

### Why vanilla TypeScript and no framework

`tech.md`: "no heavy framework unless a spec justifies one". This page has one state machine with four phases, about ten views and one dialog; there is no client-side data graph, no form wizard, no list that re-renders on keystrokes. Plain DOM building with a 30-line `h()` helper costs no dependency, no virtual DOM and no build plugin, makes the `textContent`-only rule trivially checkable by grep, and keeps the bundle small for a cold-start VPS demo. A framework would not justify itself here.

### skeleton: types (sketch)

```ts
import type { DeathScoreResult, GradeBand, SignalName } from "../death-score/index.js";

export interface UnknownReasonView { source: string; category: string; message: string }

/** Structural minimum. ScannedDependency satisfies it, extra fields ride along via the generic T. */
export interface GraveRecord {
  name: string;
  death: DeathScoreResult;
  unknownReasons?: Partial<Record<SignalName, UnknownReasonView>>;
}

export interface Grave<T extends GraveRecord> {
  /** Unique within a view: name, or `${name}#${n}` for the n-th (n >= 2) record with that name. */
  key: string;
  /** Position in the input list. */
  index: number;
  record: T;
}

export interface GradeGroup<T extends GraveRecord> {
  grade: GradeBand;
  graves: Grave<T>[];          // display order
  count: number;               // === graves.length
  defaultCollapsed: boolean;   // true only for "alive"
}

export interface GraveyardView<T extends GraveRecord> {
  /** Always four entries, in GRADE_ORDER. */
  groups: [GradeGroup<T>, GradeGroup<T>, GradeGroup<T>, GradeGroup<T>];
  counts: Record<GradeBand, number>;
  total: number;
}

export type BreakdownRow = SignalRow | CalibrationRow;

export interface SignalRow {
  kind: "signal";
  signal: SignalName;
  label: string;
  explanation: string;
  rawValue: string;        // as in the part, e.g. "43"
  rawDisplay: string;      // "43 months", "unknown"
  weight: number;
  points: number;
  status: "known" | "unknown";
  /** Present only when the part has a sourceUrl that is a Safe_Url. */
  href?: string;
  hrefHost?: string;
  /** Present when a sourceUrl exists but is not a Safe_Url; the raw value, cut to 80 chars. */
  withheldUrl?: string;
  unknownReason?: UnknownReasonView;
}

export interface CalibrationRow {
  kind: "calibration";
  label: "Declared abandoned";
  reason: string;
  points: number;
  text: string;            // `Declared abandoned: ${reason}, +${points}`
  explanation: string;
}

export interface Breakdown {
  rows: BreakdownRow[];    // signal rows in part order, then the calibration row if any
  sum: number;             // sum of rows[].points
  score: number;           // the displayed Total_Row
  consistent: boolean;     // sum === score
  gradeConsistent: boolean;// toGrade(score) === death.grade
}
```

### skeleton: functions

```ts
export const GRADE_ORDER: readonly ["dead", "dying", "ailing", "alive"];
export const GRADE_INFO: Record<GradeBand, { label: string; min: number; max: number; description: string }>;
//   min/max are derived from toGrade boundaries (a test enumerates 0..100), not typed by hand.
export const SIGNAL_INFO: Record<SignalName, { label: string; explanation: string }>;
//   Record<SignalName, ...> makes a missing signal a compile error.

export function compareGraves(a: Grave<GraveRecord>, b: Grave<GraveRecord>): number;
export function buildGraveyard<T extends GraveRecord>(records: readonly T[]): GraveyardView<T>;

export function buildBreakdown(record: GraveRecord): Breakdown;
export function topSignals(record: GraveRecord, n: number): string[];   // "no publish 43 months"
export function summaryLine(record: GraveRecord): string;               // calibration reason, else top two

export function safeHttpUrl(value: unknown): string | undefined;
export function hostOf(safeUrl: string): string;

export type ProofState = /* union, see Data Models */;
export function proofSlotFor<T extends GraveRecord>(g: Grave<T>): ProofSlot | undefined;
```

`buildGraveyard` algorithm: assign `key` by a `Map<string, number>` count of names seen; wrap each record as a Grave with its input index; bucket by `death.grade` into four arrays; sort each bucket with `compareGraves` (score descending, then `a.name < b.name ? -1 : a.name > b.name ? 1 : 0` which is UTF-16 code-unit order, then `index` ascending); build `counts` from bucket lengths. The comparator contains no `localeCompare`, no `Date`, no `Math.random`. `Array.prototype.sort` is stable in ES2019+, and the `index` tiebreak makes stability explicit and testable.

`safeHttpUrl` accepts a value only when all of these hold; it is a hand-written scan or one anchored regex, with no `URL` class:
- the value is a string of at most 2048 characters;
- it starts with `http://` or `https://`, the scheme in any letter case;
- the authority (the text after `//` up to the first `/`, `?` or `#`) is non-empty and contains no `@`, so userinfo is rejected, while `@` in the path, query or fragment is allowed;
- the whole string contains no whitespace, no control character (U+0000 to U+001F, U+007F), and none of `<`, `>`, `"`, `'`, backtick, `\`.

It returns the input string unchanged, with no normalization (no trimming, no lower-casing), so the `href` is exactly the string in the report. It never throws for any input type and returns `undefined` for non-strings.

`buildBreakdown(record)`:
- one `SignalRow` per `death.parts[i]`, same order; `label`/`explanation` from `SIGNAL_INFO`; `rawDisplay` from `formatRawValue(signal, rawValue, status)` (adds " months", " maintainers", " open vulnerabilities without a fix"; `deprecated`, `repoArchived`, `knownReplacementExists` shown as yes/no; unknown shown as "unknown");
- `sourceUrl` handling: absent → no href/withheld; `safeHttpUrl` ok → `href` and `hrefHost`; present but unsafe → `withheldUrl` = first 80 characters of the string;
- for `status === "unknown"`: `unknownReason` taken from `record.unknownReasons?.[signal]` (own-property check, so `__proto__`-style names cannot leak);
- calibration row appended when `death.calibration` is present, `text = "Declared abandoned: " + reason + ", +" + points`;
- `sum` = integer sum of all row points; `consistent` = `sum === death.score`; `gradeConsistent` = `toGrade(death.score) === death.grade`.

`buildBreakdown` never recomputes or adjusts a number. It shows what the report says and reports whether it adds up.

### skeleton: proof slot (shape for the later spec)

```ts
export interface ProofLeg {
  target: "old" | "new";
  package: string;
  version?: string;
  result: "green" | "red" | "not_run";
  numRuns: number;          // 200 for pin tests (proof-rules.md)
  seed: number;
}
export interface Counterexample { seed: number; shrunk: string; path?: string }   // proof-rules.md: show shrunk counterexample + seed
export interface SabotageResult { caught: boolean; name?: string }

export type ProofState =
  | { status: "coming_soon" }                                       // the only state produced in this spec
  | { status: "no_call_sites" }                                     // a pin test with zero real call sites fails, not passes
  | { status: "running"; step: "old" | "new" | "sabotage" }
  | { status: "failed"; leg: ProofLeg; counterexample: Counterexample }
  | { status: "verified"; old: ProofLeg; new: ProofLeg; sabotage: SabotageResult };
                                                                    // done = old green, new green, sabotage caught (migration-rules.md #7)

export interface ProofSlot { package: string; state: ProofState }
export function proofSlotFor<T extends GraveRecord>(g: Grave<T>): ProofSlot | undefined;
//   dead | dying -> { package: g.record.name, state: { status: "coming_soon" } }; otherwise undefined
```

The shape follows `proof-rules.md` (counterexample and seed shown in the proof panel; sabotage check required) and `migration-rules.md` (done means old green, new green, sabotage caught). The later spec may add states; the page's renderer is an exhaustive `switch` with a `never` default so that it cannot forget one.

### apps/exorcist-web: Api_Client

```ts
export interface ApiClientDeps {
  fetch: typeof globalThis.fetch;          // injected; tests pass a fake
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
  baseUrl?: string;                        // "" = same origin
}
export type ApiResult =
  | { ok: true; report: ScanReport; via: "api" | "static" }
  | { ok: false; error: UiError };

export interface ApiClient {
  getDemo(name: string, signal: AbortSignal): Promise<ApiResult>;
  scanRepo(input: { repo: string; ref?: string }, signal: AbortSignal): Promise<ApiResult>;
}
```

- `getDemo`: `GET {base}/api/demo/{name}` with timeout 15 s. On 200 → `parseReport`. On network error, 5xx or 404 → one `GET {base}/demo/{name}.json` (timeout 15 s) and `parseReport`; if that also fails, the original API error is reported (not the fallback's). On 429 or 400 → no fallback.
- `scanRepo`: `POST {base}/api/scan`, header `content-type: application/json`, body `JSON.stringify({ repo, ref? })`, `credentials: "omit"`, timeout 75 s (the server's scan timeout is 60 s). No fallback.
- Both: read `retry-after` (case-insensitive via `Headers.get`) and the JSON error body defensively (`unknown` narrowed by hand; a body over 64 KB is ignored). Abort by caller signal returns a `cancelled` marker that the controller ignores (not a Ui_Error).
- No `fetch` call is made at import time; everything flows through the injected function.

### apps/exorcist-web: errors.ts

```ts
export interface UiError {
  code: UiErrorCode;            // KNOWN_ERROR_CODES | "network_unreachable" | "client_timeout" | "bad_response" | "unknown_error"
  title: string;
  detail: string;               // plain-language explanation, from the table below
  serverMessage?: string;       // from the body, cut to 300 chars, shown as secondary text
  retryable: boolean;
  retryAfterSeconds?: number;   // integer 1..3600, only for rate_limited
  parseDetail?: string;         // bad_response only: "<category>: <message>"
}
export function describeError(input: {
  status?: number; body?: unknown; retryAfterHeader?: string | null; kind?: "network" | "timeout" | "parse"; parse?: { category: string; message: string };
}): UiError;
```

`describeError` is total: every branch builds strings from the table or from `String()` of validated primitives; unknown codes map to `unknown_error` with the status in the detail.

| code | status | title | what we tell the visitor | action |
|---|---|---|---|---|
| `invalid_repo` | 400 | That doesn't look like a GitHub repo | Use owner/name, for example `parse-community/parse-server`. | Fix input |
| `invalid_ref` | 400 | That branch or tag isn't valid | Letters, digits, `.`, `_`, `-` and `/` only, and no `..`. | Fix input |
| `invalid_input` | 400 | The scan request was rejected | The service did not accept the repo or ref as typed. | Fix input |
| `no_package_json` | 404 | No package.json found | The repo is private, doesn't exist, or has no `package.json` at its root at that ref. Only public repos are scanned. | Try another |
| `malformed_package_json` | 422 | package.json isn't valid JSON | The file was found but can't be read. | Try another |
| `invalid_package_json_shape` | 422 | package.json has an unexpected shape | A dependency field isn't an object of strings. | Try another |
| `too_many_dependencies` | 422 | Too many dependencies for a live scan | Live scans stop at 300 direct dependencies. The demos have no such limit. | Open a demo |
| `repo_fetch_failed` | 502 | GitHub didn't answer | Fetching the repo files failed after retries. Try again in a moment. | Retry |
| `scan_timeout` | 504 | The scan took too long | The service stopped it after about a minute. | Retry |
| `internal_error` | 500 | The scan service hit an error | Not your fault. | Retry |
| `rate_limited` | 429 | Slow down: live scans are limited | Each visitor gets a few live scans per minute. You can scan again in N seconds. Demos still work. | Wait / Open a demo |
| `unsupported_media_type` / `body_too_large` / `method_not_allowed` / `not_found` | 415 / 413 / 405 / 404 | The page and the service disagree | This is a bug in the page. | Retry |
| `invalid_demo_name` / `demo_not_found` | 400 / 404 | That demo isn't available | It may have been removed. | Back |
| `network_unreachable` | (fetch rejected) | Can't reach the scan service | Is the service running? In local development, start it with `npm run dev`. | Retry |
| `client_timeout` | (aborted) | No answer in time | The service did not answer within N seconds. | Retry |
| `bad_response` | 200 or any | The result couldn't be read | The service sent something that isn't a valid scan report. `<category>: <message>` | Retry |
| `unknown_error` | other | Something went wrong | HTTP status N. | Retry |

`retryable` is true for `repo_fetch_failed`, `scan_timeout`, `internal_error`, `network_unreachable`, `client_timeout`, `bad_response`, `unknown_error` and the "page and service disagree" group; `rate_limited` is retryable after the countdown; the rest are not.

### apps/exorcist-web: router.ts

```ts
export type Route =
  | { view: "picker" }
  | { view: "demo"; name: string; pkg?: string }
  | { view: "live"; repo: string; ref?: string; pkg?: string };
export function parseRoute(hash: string): Route;     // total; unknown -> { view: "picker" }
export function formatRoute(route: Route): string;   // "#/" | "#/demo/x?pkg=..." | "#/live?repo=...&ref=...&pkg=..."
```

`formatRoute` uses `encodeURIComponent` for every value (so `/`, `@`, `#`, `%`, `&`, `?`, spaces and non-ASCII all round-trip). `parseRoute` uses a manual split on the first `?` and on `&`, `decodeURIComponent` inside try/catch (bad escapes → picker), validates a demo name against `^[a-z0-9][a-z0-9-]{0,63}$` and a live repo with `parseRepoInput`. An empty `pkg` is treated as absent. Valid routes are exactly the ones `formatRoute` can emit, so the round trip is exact; `formatRoute(parseRoute(h))` is the normal form of `h`.

History: opening a Detail_Panel sets `location.hash` (a new history entry); Back closes it via the same `hashchange` path. Closing with Escape calls `history.back()` when the panel was opened from the list in this session, otherwise replaces the hash with the route minus `pkg`.

### apps/exorcist-web: repo-input.ts

```ts
export type RepoInputResult =
  | { ok: true; repo: string /* owner/name */; owner: string; name: string; ref?: string }
  | { ok: false; field: "repo" | "ref"; message: string };
export function parseRepoInput(repoText: string, refText?: string): RepoInputResult;
```

Rules: trim; length 1..300; strip a leading `https://` or `http://`; accept `github.com/` as the only host prefix (so `www.github.com` and every other host are rejected); strip one trailing `/` and then one trailing `.git`; the remainder must be exactly `owner/name` with owner `^[A-Za-z0-9-]{1,39}$` and name `^[A-Za-z0-9._-]{1,100}$`, not `.` or `..`. Ref: trim; empty → none; 1..200 chars of `[A-Za-z0-9._/-]`, no `..`. These are the same rules as the scanner's `parseRepoTarget` (stricter than the API's shape check), so a locally accepted input does not come back as `invalid_repo`. Case is preserved.

### apps/exorcist-web: report-view.ts

```ts
export interface SummaryHeader {
  repo: string; refLabel: string; scannedAtLabel: string;
  sourceLabel: "Snapshot" | "Live scan";
  counts: Record<GradeBand, number>;     // copied from GraveyardView.counts
  total: number; skipped: number;
  warnings: readonly string[];           // verbatim, same order
  rangesOnly: boolean;                   // dependencies.length > 0 && every versionSource === "range"
  summaryDisagrees: boolean;             // report.summary differs from computed counts or total
}
export interface ReportView {
  header: SummaryHeader;
  graveyard: GraveyardView<ScannedDependency>;
  skipped: readonly SkippedEntry[];
}
export function buildReportView(report: ScanReport, source: "demo" | "live"): ReportView;
export function formatScannedAt(iso: string): string;   // "2026-11-13 04:09 UTC", or the input if it does not parse
```

`formatScannedAt` parses with a regex on the canonical `YYYY-MM-DDTHH:MM:SS(.sss)Z` shape and does not use `Date` or locale APIs, so output is deterministic in every time zone.

### apps/exorcist-web: controller (state machine)

```ts
type Phase =
  | { tag: "picker"; prefill?: { repo: string; ref?: string }; notice?: string }
  | { tag: "loading"; source: Source }
  | { tag: "report"; source: Source; view: ReportView; openKey?: string; notice?: string }
  | { tag: "error"; error: UiError; source?: Source };
type Source = { kind: "demo"; name: string } | { kind: "live"; repo: string; ref?: string };
```

Rules:
- `requestId` increments on each load; the handler compares the id it started with against the current one before applying a result; the previous `AbortController` is aborted.
- Cooldown: on `rate_limited` the controller stores `cooldownUntil = clock.now() + seconds * 1000` and arms one timer per second to update the visible countdown text (marked `aria-hidden`); a separate `role="status"` text is written once at the start ("You can scan again in 42 seconds") and once at the end ("You can scan again now"). `clock` and `timers` are injected.
- `openKey` is derived from the Route on every change. Opening a key not found in the view sets `notice`.
- Phase change moves focus to the `h1` of the new screen; the Detail_Panel open/close is independent of phase changes and does not re-render the list (focus stays on the tombstone).

### apps/exorcist-web: views

| view | content | notes |
|---|---|---|
| `picker` | h1 "Last Rites", "The Graveyard" tagline, four Demo_Repo cards (buttons), then Live_Scan_Form | cards first in DOM order and larger |
| `live-form` | `<form>`, `<label>` + `<input>` for repo, `<details>` "Branch or tag (optional)" with a second input, submit button, limit hint, inline error | `aria-disabled` while loading or cooling down |
| `status` | `role="status"` loading block with Cancel, or error block (`role="alert"`) with title, detail, secondary server message, Retry and "Back to repos" | |
| `header` | repo/ref/scan time/source, four count controls, legend, warnings list, ranges-only note, summary-disagrees notice | |
| `graveyard` | skip link target, four group sections, alive disclosure | `h2` per group with count |
| `tombstone` | `<button>` with name, big score, grade text, summary line, unknown badge | variants `dead`, `dying`, `ailing`, `alive` |
| `detail` | `role="dialog"` panel: heading, facts, Breakdown table, evidence warnings, Proof section, Close | focus trap from `dom/focus.ts` |
| `breakdown` | `<table>` with caption; signal rows, calibration row (own `<tbody>` with a label), total row (`<tfoot>`) | stacks at narrow width |
| `proof-slot` | heading "Proof", "Exorcism coming", description, `aria-disabled` button | exhaustive switch on `ProofState` |
| `skipped` | collapsed `<details>` "Skipped (n)" | text only |

### dom/h.ts

`h(tag, props, ...children)` accepts only: `class` from a fixed class vocabulary type, `id`, `type`, `title`, `hidden`, boolean attributes, `aria-*`, `role`, `tabindex`, `data-*` with string values, and `href` **only as a `SafeHref`** branded type that only `safeHttpUrl` and constants can produce. Children are strings (written with `createTextNode`) or nodes. The helper has no `html` option, which makes the static check in Requirement 18.2 meaningful.

### Detail_Panel focus management (dom/focus.ts)

- On open: remember `document.activeElement` (the invoking button, or none for deep links); set `inert` and `aria-hidden="true"` on the `#app-root` sibling that holds the page; show the panel; focus its heading (`tabindex="-1"`).
- Trap: a `keydown` listener on the panel handles Tab and Shift+Tab by cycling through focusable descendants (`a[href], button:not([disabled]), input, summary, [tabindex]:not([tabindex="-1"])`), and Escape closes. The proof button uses `aria-disabled`, not `disabled`, so it is in the cycle.
- On close: remove `inert`/`aria-hidden`, hide the panel, and focus the remembered button if still connected, else the group heading found by index, else the `h1`.
- `inert` is not enforced by jsdom, so tests assert the attribute and the trap logic; browsers enforce `inert` natively.

`<dialog>.showModal()` was considered and rejected: jsdom does not implement it reliably, so the keyboard flow could not be tested in a DOM test, and a hand-written trap is about 40 lines.

### vite.config.ts

- `server.proxy`: `/api` → `http://127.0.0.1:24817` (`changeOrigin: false`).
- A small inline plugin `demoSnapshots`: in dev, a middleware serves `/demo/<name>.json` from the repo-root `demo/` directory (name checked against the demo pattern, no path joins from raw input); in build, `generateBundle` emits each `demo/*.json` as `demo/<name>.json`.
- A build-only `transformIndexHtml` that injects the CSP meta: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'` (frame-ancestors is ignored in a meta tag, so it is also noted for the nginx header; the meta alone does not set it). Dev mode injects inline HMR scripts, so no CSP in dev.
- `build.target: "es2022"`, `build.sourcemap: false`.

### scripts/dev.ts and root script

`apps/exorcist-web/scripts/dev.ts` (run with `vite-node`, like the existing `serve` script) spawns `npm run serve -w @graveyard-kit/exorcist-npm` and `vite`, prefixes their output lines, forwards SIGINT/SIGTERM to both, exits non-zero if either exits non-zero, and prints `Last Rites: http://127.0.0.1:5173/`. The root `dev` script is `npm run dev -w @graveyard-kit/exorcist-web`. Vite binds `127.0.0.1` (`server.host`), port 5173, `strictPort: true`.

## Data Models

### Theme tokens (`tokens.css`)

| token | value | role | contrast on `--night` | on `--stone` |
|---|---|---|---|---|
| `--night` | `#0b1215` | page ground (near-black blue-green) | | |
| `--soil` | `#121c20` | section ground | | |
| `--stone` | `#1b282d` | tombstone and panel surface | | |
| `--moon` | `#e8f0f2` | primary text (bone white) | 16.35 | 13.10 |
| `--mist` | `#a9bcc2` | secondary text | 9.59 | 7.68 |
| `--ember` | `#ff6a3d` | dead accent | 6.64 | 5.32 |
| `--amber` | `#f5b83d` | dying accent | 10.62 | 8.51 |
| `--lichen` | `#c9dc6a` | ailing accent | 12.53 | 10.04 |
| `--moss` | `#5fd6a4` | alive accent | 10.47 | 8.39 |
| `--link` | `#8ad7ff` | links | 11.92 | 9.54 |
| `--focus` | `#7fd8ff` | focus ring (3 px, 2 px offset) | 11.85 | 9.49 |
| `--edge` | `#5c7780` | borders of components | 3.96 | 3.17 |

Contrast values were computed with the WCAG relative-luminance formula while writing this spec; the test (`theme.test.ts`) recomputes them from `tokens.css`. All hues of saturated colors fall outside 250 to 335 degrees (blue-green to orange, plus the icy blue links and focus ring at about 200 degrees). Backgrounds have lightness below 25%. Fonts: `--font-ui: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`; `--font-num: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` for scores and raw values. No serif, no web font.

### Visual language

- **Ground**: a flat near-black blue-green with a faint ground line and a fog band (a CSS gradient from `--night` to `--soil`, not purple) behind the header. Moonlight is a single pale radial highlight, off-center, static.
- **Dead_Tombstone**: a tall slab with an arched top (`border-radius: 999px 999px 0.5rem 0.5rem` on the top edge), a 4 px ember top border, an ember glow (`box-shadow`), a cross-bar line, the text "DEAD" as a label chip, the package name at 24 px or more (wraps with `overflow-wrap: anywhere`), the score at 56 px or more in `--font-num`, and the one-line summary at 16 px or more (18 px at the Recording_Viewport). The glow pulses slowly **only** inside `@media (prefers-reduced-motion: no-preference)`.
- **Dying**: the same slab, standard size, amber top border, label chip "DYING".
- **Ailing**: compact row-like card, lichen left border, name and score only, label "AILING".
- **Alive**: compact chip-sized buttons inside the disclosure, moss left border, label "ALIVE".
- Grade is conveyed by the label text, the shape/size, and the color; never by color alone.
- **Detail_Panel**: wide screens: right-hand sheet 56 rem wide over a dimmed backdrop, headings at 28 px, rows at 18 px; narrow screens: full-height sheet. The score is shown large with "/ 100" and the grade chip. The Breakdown table has a **points bar** per row (a CSS-width bar plus the text "20 / 20"), the calibration row is drawn with a double top border and the "DECLARED ABANDONED" label chip in ember, and the Total_Row is bold with a heavy top rule, so the addition reads top to bottom.

### Responsive rules

- Base grid: `grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr))` for dead, `minmax(min(100%, 16rem), 1fr)` for dying, `minmax(min(100%, 12rem), 1fr)` for ailing/alive. Every grid child has `min-width: 0`.
- At 375 px: one column, header counts in a 2 by 2 grid, controls at least 44 px tall, the Breakdown table becomes stacked blocks (`display: block` for `tr`, each `td` printed with its `data-label`), the sheet is `100dvh`.
- Base font size 16 px, raised to 18 px at `min-width: 1200px`. Headings use `clamp()`.
- No `maximum-scale` in the viewport meta (zoom stays enabled).

### Copy constants (`constants.ts`)

`PRODUCT_NAME = "Last Rites"`, `SCREEN_NAME = "The Graveyard"`, `LIVE_SCAN_LIMIT = { limit: 10, windowSeconds: 60 }` (a test compares it with `DEFAULT_SCAN_API_CONFIG.scanRateLimit` by a relative import in the test only), `LIVE_TIMEOUT_MS = 75_000`, `DEMO_TIMEOUT_MS = 15_000`, `DEFAULT_RETRY_AFTER_S = 60`, `MAX_SERVER_MESSAGE = 300`, `WITHHELD_URL_CUT = 80`.

### Demo list (`model/demo-repos.ts`)

```ts
export const DEMO_REPOS = [
  { name: "parse-server", repo: "parse-community/parse-server", blurb: "A large backend with long-abandoned dependencies." },
  { name: "prettier",     repo: "prettier/prettier",            blurb: "A famous tool with one dead dependency." },
  { name: "jest",         repo: "jestjs/jest",                  blurb: "Healthy on the surface: ranges only, no lockfile." },
  { name: "pump",         repo: "mafintosh/pump",               blurb: "A tiny repo. A quiet baseline." },
] as const;
```

Blurbs contain no counts, so a re-snapshot cannot make them wrong. A test checks the names against `demo/*.json`.

## Decisions and Requirement Clarifications

- **Hash routes, not History API.** The built site is static; with hash routes nginx needs no rewrite rules and a pasted link works anywhere.
- **No auto-scan on reload of a live route.** It would spend the visitor's rate limit silently. The form is prefilled instead.
- **Demo fallback to static files.** The product principle says the demo must not break on cold start. The cost is one small Vite plugin; the benefit is that demos open even when the API process is down.
- **Reports are validated by `parseReport` and then still treated as untrusted.** `parseReport` checks shape; `safeHttpUrl` and `textContent` handle content.
- **Group by `death.grade` as reported, flag disagreement with `toGrade(score)`.** The page shows what the file says and tells the visitor when the file contradicts itself; it never "repairs" numbers.
- **The Breakdown never recomputes.** It shows `death.parts` and `death.calibration` as given and reports `consistent`.
- **Keys for duplicate names.** The scanner guarantees unique names, but the view model must still partition any input, so duplicates get `#n` keys. The partition property covers it.
- **`aria-disabled` rather than `disabled` for the Proof control and the cooldown button.** Disabled buttons leave the tab order; the point is that a keyboard user can find the placeholder and read why it does nothing.
- **Native `title` plus visible text.** `title` alone fails on touch and for keyboard users, so every explanation also exists as visible text (rows) or as accessible name/description (tombstones, scores).
- **Contrast is tested from the CSS file, not from memory.** `tokens.css` is the single source; `theme.test.ts` parses it.
- **Type-only imports across packages.** `@graveyard-kit/exorcist-npm/report` re-exports `parseReport` and the report types. The web `tsconfig` leaves `types` unset so the hoisted `@types/node` that `evidence/index.ts` needs is found during typecheck; the page's own code does not use Node APIs, and Vite bundles only `report.ts` and `types.ts` of the scanner.

## Correctness Properties

All properties use fast-check with `numRuns: 100` and the Fast_Check_Runner (`assertProperty`, `FC_SEED` wins, `CI` fixes seed 20261113, otherwise the random seed is recorded on failure). Each property file exports `build(impl)`; the real implementation is passed by default; the sabotage lists live in `test-support/sabotage/`.

Shared generators (`skeleton/src/graveyard/test-support/arbitraries.ts`, exported through `.../graveyard/testing`):

- `graveRecordArb`: builds `{ name, death, unknownReasons? }` with the real `scoreDeath`, from `packageSignalsArb` plus `configWithFloorArb`, with names from a small pool of collision-prone strings (`a`, `A`, `b`, `@scope/a`, `é`, `a#2`, `__proto__`, `constructor`, empty-ish names like `" "`), so ties and duplicates are frequent; the list arbitrary has length 0..60 and biases toward equal scores and boundary scores 0, 24, 25, 49, 50, 74, 75, 100; it includes `declaredAbandonedArb` records (calibrated) and all-unknown records.
- `tamperedRecordArb`: a `graveRecordArb` record with one tamper applied: a part's points changed, the score changed, the grade changed, or a calibration points changed, so that sums and grades disagree.
- `hostileUrlArb`: the corpus of Requirement 19.6 mixed with `fc.string()` and valid URLs in mixed case.

### Property 1: Grouping is a partition

**Validates: Requirements 6.1, 6.2, 6.4, 6.7, 19.2**

For any list of records:
- the multiset of `index` values over all four groups equals `{0..n-1}` with each exactly once;
- each Grave sits in the group equal to its `record.death.grade`;
- `groups` has four entries in `GRADE_ORDER`;
- all `key` values are unique, and the first record of a name has `key === name`;
- the input array and every record deep-equal a snapshot taken before the call.

Sabotages (each must be caught): drop records whose name already appeared; drop the alive group; put records with score 75 into both `dead` and `dying`; assign `key = name` without a suffix; filter out records with `score === 0`; mutate the input array by sorting it in place.

### Property 2: Ordering is band, then score descending, then name, stable and deterministic

**Validates: Requirements 6.3, 6.6, 19.3**

- The concatenation of the groups equals `[...input].sort(referenceCompare)`, where `referenceCompare` is written independently in the test: band index in `GRADE_ORDER`, then `b.score - a.score`, then code-unit comparison of names via `Array.from(name).map(c => c.charCodeAt(0))` lexicographic, then input index.
- Two calls on deep-equal inputs give deep-equal outputs.
- For inputs whose names are all distinct, shuffling the input (a generated permutation) gives a deep-equal output.
- For duplicate-name, equal-score records, output order follows input order.

Sabotages: score ascending; no name tiebreak (input order only); band order reversed (alive first); name before score; `localeCompare` for names (caught with names like `A`, `a`, `é`, `Z`); score compared as a string (so 9 > 75); `Math.random` tiebreak; name descending.

### Property 3: Breakdown rows sum to the displayed score

**Validates: Requirements 9.3, 9.4, 9.5, 10.1, 10.2, 10.4, 11.3, 19.4**

For any record built with the real `scoreDeath` (including calibrated and all-unknown records):
- `sum(rows.map(r => r.points)) === death.score === breakdown.score`, and `consistent === true`;
- exactly one `signal` row per part, same order and same `signal` names;
- a `calibration` row exists iff `death.calibration` exists; if it exists it is after all signal rows, and its `text` equals `"Declared abandoned: " + reason + ", +" + points`;
- unknown parts yield rows with `status: "unknown"` and their points are included in the sum;
- for a `tamperedRecordArb` record where the parts+calibration sum differs from the score, `consistent === false` and `score` is the unchanged `death.score` (the model does not adjust numbers).

Sabotages: omit the calibration row; count calibration points twice; use `weight` where `points` belongs; exclude unknown rows from the sum; compute `score` from the sum instead of copying `death.score` (caught by the tampered clause); set `consistent` to always true.

### Property 4: Header counts equal the grouped list sizes

**Validates: Requirements 6.5, 8.2, 8.3, 19.5**

For any list of records wrapped in a generated `ScanReport` (with `summary` either correct or tampered):
- `view.counts[g] === view.groups[g].graves.length` for each grade, and equals an independent recount `records.filter(r => r.death.grade === g).length`;
- the four counts sum to `total === records.length`;
- `buildReportView(report).header.counts` deep-equals `view.counts` and `header.total === report.dependencies.length` (skipped dependencies are not in the total);
- `header.summaryDisagrees` is true iff `report.summary` differs from the computed counts or total.

Sabotages: header counts copied from `report.summary`; `dying` counted into `dead`; `total` includes `skipped`; off by one for alive; counts computed from the first 50 records only; `summaryDisagrees` always false.

### Property 5: Source links only ever render http or https URLs

**Validates: Requirements 12.1, 12.2, 12.3, 12.5, 18.1, 19.6**

- For any string `s` from `hostileUrlArb`, and for non-string values (`undefined`, `null`, numbers, objects): `safeHttpUrl(s)` is `undefined` or equals `s`; when defined, it matches `^https?://` case-insensitively, has no whitespace or control character, and has a non-empty authority without `@`.
- For any tampered record with hostile `sourceUrl` values in its parts, every row has `href === undefined` or an `href` that satisfies the above, and any row whose `sourceUrl` was present but unsafe has `withheldUrl` set (cut to at most 80 characters) and no `href`.
- Known-good URLs from the corpus (`https://registry.npmjs.org/x`, `HTTP://Example.com/a?b#c`, URLs containing `@` in the path) are returned unchanged.

Sabotages: no check at all; denylist of `javascript:` only; case-sensitive denylist; `startsWith("http")`; accepts `//host`; accepts userinfo (`https://user:pw@host`); validates a trimmed copy but returns the untrimmed value; returns a normalized (lower-cased scheme) copy instead of the input.

### Property 6: Route codec round trip and totality (additive)

**Validates: Requirements 17.1, 17.2, 17.3, 19.7**

- For any valid Route (`picker`; `demo` with a name matching the pattern and an optional non-empty `pkg`; `live` with a valid `owner/repo`, optional valid ref and optional `pkg`), `parseRoute(formatRoute(r))` deep-equals `r`. `pkg` is drawn from `fc.string({ unit: "binary" })`-like corpora including `/`, `@`, `#`, `%`, `&`, `?`, `+`, spaces, `%2F`, emoji and lone surrogates.
- For any string (including broken percent-escapes) `parseRoute` returns a valid Route without throwing; `formatRoute(parseRoute(h))` is idempotent.

Sabotages: `/` not encoded in `pkg`; `&` not encoded; `ref` dropped on format; repo lower-cased on parse; decode errors thrown; `+` decoded as space.

### Property 7: Repo input parsing (additive)

**Validates: Requirements 3.2, 3.3, 19.7**

- For any accepted input, `owner`, `name` and `ref` satisfy the patterns of Requirement 3.3 and `repo === owner + "/" + name`.
- For any generated `owner`/`name` pair matching the patterns, each of the accepted spellings (`o/n`, `github.com/o/n`, `https://github.com/o/n`, with `/` or `.git` suffix and surrounding whitespace) is accepted and yields that pair with case preserved.
- Inputs with another host, extra path segments, `..`, a space inside, or over 300 characters are rejected with the `repo` field; a bad ref is rejected with the `ref` field.

Sabotages: accepts extra path segments; accepts any host; accepts `..` in a ref; rejects `_` in a repo name; lower-cases the result; strips `.git` anywhere in the name (which breaks a repo named `my.github.io`).

### Property 8: Error description is total and safe (additive)

**Validates: Requirements 4.2, 4.3, 4.8, 4.11, 19.7**

- For any `status` (integer or garbage), `body` (any JSON value including `null`, arrays, deeply nested, huge strings), `retryAfterHeader` (any string or null), and `kind`: `describeError` returns without throwing, with non-empty `title` and `detail`, `serverMessage` of at most 300 characters, and `retryAfterSeconds` either undefined or an integer in 1..3600 (only when `code === "rate_limited"`).
- For `status 429`, a valid positive integer header `n` gives `retryAfterSeconds === clamp(n, 1, 3600)`; a missing or invalid header gives 60.
- Every code in the table above maps to its documented title (a table-driven example test accompanies the property).

Sabotages: throws on an unknown code; empty `detail` for unknown codes; unclamped `retryAfterSeconds`; negative or NaN `retryAfterSeconds`; server message not truncated; 429 without a header yields `undefined`.

### Central sabotage tests

`skeleton/src/graveyard/sabotage.test.ts` runs P1 to P5 against their lists; `apps/exorcist-web/src/sabotage.test.ts` runs P6 to P8. Both use the fixed seed 20261113, fail with `Sabotage "<name>" stayed green for "<property>"`, assert every list is non-empty, and assert the real implementation passes every property under the same seed.

## Error Handling

| situation | where | behavior |
|---|---|---|
| API unreachable (fetch rejects) | Api_Client | demo: try static copy; then `network_unreachable` with Retry; live: `network_unreachable` |
| HTTP 429 | Api_Client, controller | `rate_limited` with seconds, countdown, scan button `aria-disabled`; demos stay usable; no demo fallback |
| Error body missing or not JSON | `describeError` | status-based fallback (`unknown_error` or the status class), never a blank screen |
| 200 but body fails `parseReport` | Api_Client | `bad_response` with `<category>: <message>`; nothing rendered from the body |
| Static fallback also fails | Api_Client | report the original API error |
| Client timeout | Api_Client | abort; `client_timeout` with Retry |
| User cancels | controller | abort; back to picker with values kept; no error shown |
| Superseded request answers late | controller | ignored (request id mismatch) |
| `pkg` not in report | controller | report shown with notice; no panel |
| Breakdown does not add up | `buildBreakdown` / detail view | visible error row; numbers unchanged |
| Grade differs from `toGrade(score)` | detail view | visible notice |
| Unsafe `sourceUrl` | `buildBreakdown` | no anchor; "Source link withheld" plus cut text |
| Report `summary` disagrees | header | notice; computed counts shown |
| Huge report (300 deps) | graveyard view | alive tombstones are not created until expanded; ailing/dying/dead at most a few hundred nodes |
| Exception inside a view render | controller | caught at the phase boundary; shows `unknown_error` with Retry, logs to `console.error` once; the page does not go blank |
| DOM API missing (very old browser) | main | not handled; the page targets current evergreen browsers (`inert`, `:focus-visible`, `dvh`) |

## Testing Strategy

- **Properties**: P1 to P5 in `skeleton/src/graveyard/`, P6 to P8 in `apps/exorcist-web/src/`, `numRuns` 100, shared runner, sabotage lists, two central sabotage tests.
- **Example tests (skeleton)**: `buildGraveyard` on a hand-made list with ties; `buildBreakdown` on a calibrated record (for example the ldapjs-style record: `deprecated + repo archived`, +3), on an all-unknown record, and on a tampered record; `GRADE_INFO` ranges equal `toGrade` for every integer 0..100; `SIGNAL_INFO` covers `SIGNAL_NAMES`; `proofSlotFor` returns a slot for dead and dying only; `topSignals` and `summaryLine` examples.
- **Example tests (page, Node environment)**: `parseRepoInput` table; `describeError` table for every code; `buildReportView` on each Fixture_Report; `formatScannedAt`; Api_Client with a fake `fetch` (request shape, 429 header, fallback to static only for network/5xx/404, no fallback for 429, abort, timeout via fake timers, parse failure); demo list equals `demo/*.json` names; `LIVE_SCAN_LIMIT` equals `DEFAULT_SCAN_API_CONFIG.scanRateLimit`.
- **Real-data invariants**: parse all four `/demo/*.json` with `parseReport`; assert Requirement 6 invariants, that `consistent` holds for every dependency's Breakdown, and that every part URL is a Safe_Url. No hard-coded counts, so re-snapshots do not break tests.
- **DOM tests** (`// @vitest-environment jsdom`, `dom-harness.ts` mounts the page with a fake `fetch`, fake clock and fake timers): the nine tests of Requirement 21.
- **Static tests** (read files, no DOM): `theme.test.ts` (contrast of the listed pairs, hue and lightness rules, no serif, `prefers-reduced-motion` wrapping of every `animation`/`transition`/`scroll-behavior: smooth`, no bare `outline: none`, `min-width: 0`/`overflow-wrap` rules present, 44 px target rule present); `safety.test.ts` (forbidden APIs absent from `src/**/*.ts`, no `http://` or `https://` literal in `index.html` or CSS other than the CSP/proxy config, no remote `@import`/`url(http`); `smoke.test.ts` (skeleton imports nothing under `/apps`; the web package declares no LLM dependency; added dependencies are exact-pinned; `exorcist-npm` exports map contains only `./report`).
- **Not covered by automated tests**: real layout (horizontal scroll at 375 px, tombstone sizes and above-the-fold fit at 1920 by 1080), real focus-ring rendering, `inert` enforcement and reduced-motion behavior in a browser. The last task asks for a manual check, or screenshots with a headless browser if one is available, and records which checks were actually done.
- **No network**: the fake `fetch` in `test-support/fake-fetch.ts` fails the test on any URL it was not given; `no-network.setup.ts` still replaces the global `fetch`.

## Risks

- **jsdom focus and `inert`**: jsdom handles `focus()` and `document.activeElement` but ignores `inert`. Mitigation: assert attributes and test the trap logic by dispatching Tab key events; real behavior is in the manual check.
- **Vite and `.js` suffixes**: the repo uses NodeNext-style `.js` import suffixes in `.ts` files. Vite 5 resolves them to `.ts`; if a case fails, the build task fixes the import, not the convention.
- **Cross-package typecheck**: importing `@graveyard-kit/exorcist-npm/report` pulls `evidence/index.ts` types into the web typecheck. If `@types/node` is not auto-discovered, the fix is `types: ["node"]` in the web tsconfig, not a copy of the types.
- **Contrast of glow and bars**: decorative glows are not counted for contrast; bars carry the text "n / m" so meaning does not depend on them.
- **Bundle of `report.ts`**: it must stay browser-safe. A smoke test checks that its runtime imports are only `@graveyard-kit/skeleton` and `./types.js`.
- **Hard-coded rate-limit text**: the "10 per minute" copy could drift from the server config; a test compares the constant with `DEFAULT_SCAN_API_CONFIG` (a deployment that overrides the config will still show the default; acceptable for v1).
- **Large demo (490 KB)**: parse and render are expected to be well under a second; alive tombstones are lazy.

## Judgment Calls

Decisions made without asking, for the owner to confirm or reverse:

1. **Package name and place**: `apps/exorcist-web` (`@graveyard-kit/exorcist-web`), the web front end of the flagship app. The spec dir is `graveyard-ui`; the package name follows the existing `exorcist-*` apps. Renaming to Last Rites happens later with everything else.
2. **Skeleton ships the pure view model only**, not DOM components. `structure.md` mentions a "graveyard UI component" in `/skeleton`; this spec treats the reusable part as the view model, the labels and the ProofSlot shape, and keeps DOM rendering in the app. Lifting the views into the skeleton later is possible because they take only view-model data.
3. **No framework**: vanilla TypeScript with a `textContent`-only `h()` helper.
4. **Vite 5.4.21 (already hoisted) and an exact-pinned `jsdom`** (the version is chosen at install time, compatible with Vitest 2.1.x and Node 22, and recorded in `docs/kiro-log.md`). `jsdom` over `happy-dom` because focus, keyboard events and ARIA attributes are more faithfully implemented.
5. **Custom dialog instead of `<dialog>`**, because jsdom's `showModal` is unreliable and the keyboard flow must be testable.
6. **Demo list is a constant in the page**, with a test that it equals `/demo/*.json`; no new list endpoint, because the API is out of scope. The demo cards show no counts, to avoid stale numbers.
7. **Static demo fallback** (`/demo/<name>.json`) copied into the build and served in dev, used only for network error, 5xx and 404 of the demo endpoint.
8. **`@graveyard-kit/exorcist-npm/report` subpath export** added to `exorcist-npm/package.json` so the page reuses `parseReport` and the report types instead of redeclaring them.
9. **Hash routing with `pkg=<key>` deep links**; live routes never auto-scan on load.
10. **Rate-limit text** shows "10 per minute per visitor" from a constant checked against the server default, plus the exact `retry-after` seconds on a 429. A missing header means 60 seconds.
11. **Repo input accepts** `owner/repo`, `github.com/owner/repo`, `http(s)://github.com/owner/repo` (optional `/`, `.git`); it does not parse `/tree/<ref>` URLs. The ref is a separate optional field.
12. **Ailing is expanded (compact), alive is collapsed**; dying is standard size. The brief only fixed dead (prominent) and alive (collapsed).
13. **`aria-disabled` instead of `disabled`** for the Proof placeholder and the cooldown scan button, so they stay discoverable by keyboard.
14. **Grouping by the reported `death.grade`**, not by recomputing from the score; disagreement is flagged, not repaired.
15. **Three extra properties** (route codec, repo input, error totality) beyond the five requested, each with a sabotage list, following the scanner spec's additive-property precedent.
16. **Colors**: near-black blue-green ground, bone text, ember/amber/lichen/moss accents, icy blue links and focus ring; hue and lightness rules are tested from the CSS. The tokens in this document are the starting point; the build task may adjust them if a test or a visual check fails, keeping the rules.
17. **Contrast, hue and reduced-motion rules are verified from the CSS text, layout is not**: horizontal-scroll and above-the-fold checks at 375 px and 1920 by 1080 px are manual (or headless screenshots), not automated.
18. **CSP only in the production build**, as a `<meta>`; `frame-ancestors` cannot be set by a meta tag, so it is left to an nginx header (not added here).
19. **`npm run dev`** is added at the root via a small `vite-node` launcher script, because `tech.md` promises the command and it does not exist yet.
20. **Session-only data**: reports are kept in memory, never in browser storage.
