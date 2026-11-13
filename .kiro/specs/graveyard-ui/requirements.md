# Requirements Document

## Introduction

The Graveyard_Ui is the web screen of the product now called "Last Rites". The screen itself is named "The Graveyard". It lets a visitor pick a cached demo scan or scan a public GitHub repository, and then shows every direct npm dependency of that repository as a tombstone, dead ones first, with a click-through breakdown of exactly how its death score was computed and links to the real sources.

It has two parts, split as `.kiro/steering/structure.md` requires:

1. The Graveyard_View_Model, pure TypeScript in `/skeleton/src/graveyard/`, reusable by any adapter. It groups, orders, counts and explains results, builds the score breakdown, validates source links, and defines the data shape of the future Proof_Slot. It has no DOM, no I/O and no clock.
2. The Graveyard_Page, a new workspace package `apps/exorcist-web` (Vite + TypeScript, no UI framework). It holds the repo picker, the live scan box, the API client, the routing, the DOM rendering, and the night theme.

It consumes the existing Scan_Api (`POST /api/scan`, `GET /api/demo/:name`, listening on `127.0.0.1:24817`) and the existing Scan_Report (`ScanReport`, `ScannedDependency`, `parseReport`). It does not change the scan API, the scanner, or the death-score engine. It renders `death.calibration` (added by the death-score-calibration bugfix) as its own labelled row so the points visibly add up to the score.

The proof harness is a later spec. This spec ships a disabled "Exorcism coming" placeholder on dead and dying tombstones and fixes the data shape that panel will take.

The hosted app and the tests make no LLM calls. The tests make no network requests; they use fixtures derived from `/demo/*.json`.

Facts about the four existing demo snapshots that shape the tests (checked while writing this spec): parse-server has 5 dead and 14 ailing packages, all 5 dead ones carry a calibration row; prettier has 1 dead package; jest has no dead and no dying packages, 8 skipped workspace dependencies, and a "no lockfile" warning; pump has 2 dependencies. None of them contains a dying package, an unknown signal, or an unsafe URL. Tests therefore also build synthetic reports with the real `scoreDeath`.

Behavioral decisions fixed here so design does not have to guess:

- The Graveyard_Page is a single-page app with hash routes. A live scan is never re-run automatically on page load, because live scans are rate-limited.
- Every string that comes from a report is untrusted. It is only ever written with `textContent`, and a link is only ever created from a Safe_Url.
- The product name "Last Rites" is user-visible text only. No package, directory, scope or identifier is renamed by this spec.

## Glossary

- **Graveyard_Ui**: the system specified here, made of the Graveyard_View_Model and the Graveyard_Page.
- **Graveyard_View_Model**: the pure module in `skeleton/src/graveyard/` (exported as `@graveyard-kit/skeleton/graveyard`) that turns a list of Grave_Records into a Graveyard_View, builds Breakdowns, validates links and defines the Proof_Slot shape.
- **Graveyard_Page**: the Vite + TypeScript page in `apps/exorcist-web`.
- **The_Graveyard**: the screen that shows one loaded Scan_Report as Tombstones.
- **Last_Rites**: the product name, shown as `PRODUCT_NAME` in the page title and header only.
- **Scan_Api**: the existing HTTP handler exposing `POST /api/scan` and `GET /api/demo/:name`.
- **Scan_Report**: the existing `ScanReport` type and its Canonical_Json text, read with the existing `parseReport`.
- **Grave_Record**: the structural minimum the view model needs per package: `name`, `death` (a `DeathScoreResult`) and optional `unknownReasons`. `ScannedDependency` satisfies it.
- **Grade_Order**: the fixed order `dead`, `dying`, `ailing`, `alive`.
- **Grade_Band**: one of `alive`, `ailing`, `dying`, `dead`, as defined by `toGrade` (0-24, 25-49, 50-74, 75-100).
- **Grave**: a Grave_Record plus a `key` that is unique within one Graveyard_View.
- **Grade_Group**: the Graves of one Grade_Band, in display order.
- **Graveyard_View**: `{ groups, counts, total }`, where `groups` always holds the four Grade_Groups in Grade_Order.
- **Tombstone**: the clickable card for one Grave, showing name, score, grade label and a one-line summary.
- **Dead_Tombstone**: a Tombstone in the `dead` Grade_Group, drawn largest.
- **Summary_Header**: the block above the Grave groups with repo, ref, scan time, source kind, counts per Grade_Band, skipped count and warnings.
- **Detail_Panel**: the modal dialog that opens for one Tombstone and shows its Breakdown.
- **Breakdown**: the list of Breakdown_Rows plus a Total_Row for one Grave.
- **Signal_Row**: one Breakdown_Row for one `SignalPart`: label, explanation, raw value, points, weight, known or unknown, and Source_Link.
- **Calibration_Row**: the separate, labelled Breakdown_Row for `death.calibration`, for example "Declared abandoned: deprecated + repo archived, +3".
- **Total_Row**: the last row of a Breakdown, showing the displayed score.
- **Unknown_Row**: a Signal_Row whose `status` is `unknown`, shown with its UnknownReason.
- **Source_Link**: the link on a Signal_Row to the real source URL of that signal.
- **Safe_Url**: a string of at most 2048 characters that starts with `http://` or `https://` (any letter case), has a non-empty host and no userinfo, and contains no whitespace, control character, `<`, `>`, `"`, `'`, backtick or backslash.
- **Proof_Slot**: the data (`ProofSlot`) and the placeholder panel for the future proof harness, present on dead and dying Graves only.
- **Proof_State**: the discriminated union of states a Proof_Slot can be in. Only `coming_soon` is produced in this spec.
- **Repo_Picker**: the entry screen with the Demo_Repo cards and the Live_Scan_Form.
- **Demo_Repo**: one of `parse-server`, `prettier`, `jest`, `pump`, each backed by `/demo/<name>.json`.
- **Live_Scan_Form**: the form that takes `owner/repo` (and an optional ref) and calls `POST /api/scan`.
- **Repo_Input**: the text the visitor types into the Live_Scan_Form.
- **Ui_Error**: the page's typed error value `{ code, title, detail, retryable, retryAfterSeconds? }` built from an API error body, an HTTP status, a network failure or a parse failure.
- **Route**: the parsed hash of the page: `picker`, `demo` (with a name and an optional package key) or `live` (with a repo, an optional ref and an optional package key).
- **Api_Client**: the module that calls the Scan_Api through an injected `fetch`.
- **Night_Theme**: the dark graveyard look defined by the Theme_Tokens.
- **Theme_Tokens**: the CSS custom properties in `apps/exorcist-web/src/styles/tokens.css`.
- **Narrow_Viewport**: a viewport 375 CSS pixels wide (and down to 320).
- **Recording_Viewport**: a viewport 1920 by 1080 CSS pixels, used for the demo video.
- **Reduced_Motion**: the `prefers-reduced-motion: reduce` user setting.
- **Fixture_Report**: a Scan_Report used by tests: a trimmed copy of a `/demo` snapshot under `__fixtures__/`, or a synthetic report built with the real `scoreDeath`.
- **Fast_Check_Runner**: the existing `fc-runner.ts` seed policy: `FC_SEED` wins, `CI` fixes seed 20261113, otherwise a random seed is recorded on failure; `numRuns` is 100.

## Requirements

### Requirement 1: Scope, packages and reuse

**User Story:** As a maintainer, I want the UI split into a reusable view model and a thin page, so that the kit stays reusable and the dependency direction stays one-way.

#### Acceptance Criteria

1. THE Graveyard_Ui SHALL place the Graveyard_View_Model in `skeleton/src/graveyard/`, exported through the subpath `@graveyard-kit/skeleton/graveyard`, and SHALL place the Graveyard_Page in the new workspace package `apps/exorcist-web` (name `@graveyard-kit/exorcist-web`), so that `npm run typecheck` and `npm test` pick it up through the existing workspace globs.
2. THE `/skeleton` package SHALL contain zero import statements that resolve under `/apps`, and the Graveyard_View_Model SHALL use no DOM type, no I/O, no environment variable, no random value and no clock value.
3. THE Graveyard_Page SHALL use no UI framework. Its runtime dependencies SHALL be none beyond `@graveyard-kit/skeleton` and the `parseReport` subpath of `@graveyard-kit/exorcist-npm`; Vite and the DOM test environment SHALL be dev dependencies; every added dependency SHALL be declared with an exact version string.
4. THE Graveyard_Page SHALL import `DeathScoreResult`, `GradeBand`, `SignalName`, `toGrade` and `SIGNAL_NAMES` from `@graveyard-kit/skeleton`, and `ScanReport`, `ScannedDependency` and `parseReport` from `@graveyard-kit/exorcist-npm/report`, and SHALL NOT redeclare them.
5. THE Graveyard_Ui SHALL show the product name "Last Rites" only through one constant `PRODUCT_NAME` and SHALL name the screen "The Graveyard"; THE Graveyard_Ui SHALL NOT rename any package, directory, npm scope or identifier.
6. THE Graveyard_Ui SHALL make zero LLM calls, SHALL use no paid service, and SHALL load no remote script, style, font, image or analytics; at run time the page SHALL contact only its own origin (`/api/...` and `/demo/...`).
7. THE Graveyard_Ui SHALL NOT change the behavior of the Scan_Api, the scanner pipeline, the evidence stage or the death-score engine.

### Requirement 2: Repo picker and demo scans

**User Story:** As a visitor, I want to open a ready-made scan in one click, so that the demo works instantly and never depends on a live scan.

#### Acceptance Criteria

1. WHEN the Route is `picker`, THE Repo_Picker SHALL show one card for each Demo_Repo in the order `parse-server`, `prettier`, `jest`, `pump`, each card naming the demo and its `owner/repo`, and each card SHALL be a native button or link.
2. WHEN a visitor activates a Demo_Repo card, THE Graveyard_Page SHALL request `GET /api/demo/<name>` for that one demo and SHALL NOT request the other demos.
3. THE Graveyard_Page SHALL define the Demo_Repo list in one constant, every name in it SHALL match `^[a-z0-9][a-z0-9-]{0,63}$`, and a test SHALL check that the constant equals the set of `/demo/*.json` file names.
4. THE Repo_Picker SHALL state on the demo cards that a demo is a cached snapshot that loads instantly and runs no scan, and the Summary_Header of a loaded demo SHALL say "Snapshot" together with the scan time.
5. THE Repo_Picker SHALL show the Demo_Repo cards before the Live_Scan_Form in document order and SHALL give them the larger visual weight.
6. IF `GET /api/demo/<name>` fails with a network error, an HTTP 5xx or an HTTP 404, THEN THE Api_Client SHALL fetch the static copy `/demo/<name>.json` once and SHALL use it if it parses as a Scan_Report; IF the API answered HTTP 429 or 400, THEN THE Api_Client SHALL NOT fall back.
7. THE Graveyard_Page build SHALL include a copy of every `/demo/*.json` file at `/demo/<name>.json` of the built site, and the dev server SHALL serve the same paths, so that the fallback in criterion 6 has a target.

### Requirement 3: Live scan box

**User Story:** As a visitor, I want to scan a public GitHub repo by name, so that I can see my own dead dependencies.

#### Acceptance Criteria

1. THE Live_Scan_Form SHALL have a labelled text field for the repository and a labelled optional field for a branch or tag, and SHALL submit on the submit button and on the Enter key in either field.
2. THE Repo_Input parser SHALL accept `owner/repo`, `github.com/owner/repo`, and `http(s)://github.com/owner/repo` with an optional trailing `/` or `.git`, and surrounding whitespace, and SHALL reject everything else, including other hosts, extra path segments, empty text and text longer than 300 characters.
3. WHEN the Repo_Input parser accepts input, THE parser SHALL return an owner matching `^[A-Za-z0-9-]{1,39}$` and a repo matching `^[A-Za-z0-9._-]{1,100}$` that is neither `.` nor `..`, and SHALL preserve letter case. WHEN a ref is given, THE parser SHALL accept it only if it has 1 to 200 characters from letters, digits, `.`, `_`, `-` and `/` and does not contain `..`; an empty ref field SHALL mean no ref.
4. IF the Repo_Input or ref is rejected, THEN THE Live_Scan_Form SHALL show an inline message tied to the field (`aria-invalid` and `aria-describedby`) that says what format is expected, and SHALL NOT call the Scan_Api.
5. WHEN the input is accepted, THE Api_Client SHALL send `POST /api/scan` with `content-type: application/json` and the body `{"repo":"<owner>/<repo>"}` plus `"ref"` only when a ref was given, and SHALL send no credentials, cookies or token.
6. THE Live_Scan_Form SHALL show, next to the submit button, the text "Live scans are limited to 10 per minute per visitor", that only public repositories are scanned, and that only `package.json` and `package-lock.json` are read. The number in that text SHALL come from one constant that a test compares with the Scan_Api default scan rate limit.
7. WHILE a scan request is in flight, THE Live_Scan_Form SHALL show a status message naming the repository and saying the scan can take up to a minute, SHALL show a Cancel button, SHALL ignore further submits, and SHALL mark the submit button `aria-disabled="true"` without removing it from the tab order.
8. WHEN the visitor activates Cancel, THE Api_Client SHALL abort the request, THE Graveyard_Page SHALL return to the Repo_Picker with the form values kept, and THE page SHALL NOT claim that the cancelled scan was free, because the server has already counted the request.

### Requirement 4: Request states and error display

**User Story:** As a visitor, I want to understand exactly why a scan did not happen and what I can do next, so that a rate limit or a bad repo never looks like a broken page.

#### Acceptance Criteria

1. THE Graveyard_Page SHALL be in exactly one of these phases at any time: `picker`, `loading`, `report`, `error`, and SHALL show one primary status region for the phase.
2. WHEN the Scan_Api returns an error body `{ "error": { "code", "message" } }`, THE Graveyard_Page SHALL map each of these codes to a distinct title, a plain-language explanation and a next action: `invalid_repo`, `invalid_ref`, `invalid_input`, `no_package_json`, `malformed_package_json`, `invalid_package_json_shape`, `too_many_dependencies`, `repo_fetch_failed`, `scan_timeout`, `internal_error`, `rate_limited`, `unsupported_media_type`, `body_too_large`, `invalid_demo_name`, `demo_not_found`, `not_found`, `method_not_allowed`.
3. WHEN the Scan_Api answers HTTP 429 with a `retry-after` header, THE Graveyard_Page SHALL show the number of seconds from that header (an integer clamped to 1 to 3600), SHALL show a countdown, and SHALL keep the scan button `aria-disabled="true"` until the countdown ends. IF the header is missing or not a positive integer, THEN THE page SHALL use 60 seconds.
4. WHILE a rate-limit countdown runs, THE Graveyard_Page SHALL leave the Demo_Repo cards usable, because demos have a separate limiter.
5. IF `fetch` rejects, THEN THE Graveyard_Page SHALL show the `network_unreachable` Ui_Error saying the scan service could not be reached, with a Retry action.
6. IF a request runs longer than the client timeout (75 seconds for a live scan, 15 seconds for a demo), THEN THE Api_Client SHALL abort it and THE Graveyard_Page SHALL show the `client_timeout` Ui_Error with a Retry action.
7. IF the response is HTTP 200 but its body does not parse as a Scan_Report, or an error response has no readable error body, THEN THE Graveyard_Page SHALL show the `bad_response` Ui_Error, SHALL show the parse failure category and path message as secondary detail, and SHALL render no field of the rejected body.
8. THE Graveyard_Page SHALL show the server's `message` as secondary text, written with `textContent` and cut to 300 characters, and SHALL never show a stack trace or a raw response body.
9. THE error screen SHALL always offer a way back to the Repo_Picker, and SHALL offer Retry when the Ui_Error is retryable.
10. WHEN a newer request starts, THE Graveyard_Page SHALL abort the older request, and a response that arrives for an older request SHALL NOT change the page.
11. THE Ui_Error builder SHALL be total: for any HTTP status, any body value and any headers, it SHALL return a Ui_Error with a non-empty title and a non-empty detail, and SHALL NOT throw.

### Requirement 5: Report intake

**User Story:** As a maintainer, I want every report validated before it is drawn, so that a corrupt or tampered file cannot break or abuse the page.

#### Acceptance Criteria

1. WHEN a Scan_Api or static response has status 200, THE Api_Client SHALL read the body as text and pass it to `parseReport`; IF `parseReport` returns an error, THEN criterion 4.7 applies.
2. WHEN `parseReport` returns a report, THE Graveyard_Page SHALL build the Graveyard_View from `report.dependencies` and SHALL NOT mutate the report or any of its parts.
3. THE Graveyard_Page SHALL treat the report as untrusted even after parsing: `parseReport` checks structure, not the content of strings or URLs, so Requirement 12 and Requirement 18 apply to every string and URL in it.
4. THE Graveyard_Page SHALL keep the parsed report in memory only and SHALL NOT write it to `localStorage`, `sessionStorage`, cookies or IndexedDB.

### Requirement 6: Grouping and ordering (Graveyard_View_Model)

**User Story:** As a visitor, I want the deadest packages first, in an order that never shuffles, so that I can trust what I see at the top.

#### Acceptance Criteria

1. WHEN the Graveyard_View_Model builds a Graveyard_View from a list of Grave_Records, THE Graveyard_View_Model SHALL place every record in exactly one Grade_Group, chosen by `death.grade`, so that the Graves across all groups are the input records, each exactly once (a partition), including records that share a name.
2. THE Graveyard_View SHALL always contain four Grade_Groups in Grade_Order, including empty ones.
3. THE Graveyard_View_Model SHALL order the Graves of each group by `death.score` descending, then by `name` ascending in UTF-16 code-unit order, then by input position ascending; and so the concatenation of the groups SHALL be ordered by Grade_Band in Grade_Order, then score descending, then name ascending, then input position ascending.
4. THE Graveyard_View_Model SHALL give every Grave a `key` that is unique within the view: the `name` for the first record with that name, and `<name>#<n>` for the n-th record with that name (n from 2) in input order.
5. THE Graveyard_View SHALL contain `counts[g]` equal to the number of Graves in the group `g` and `total` equal to the number of input records, so that the four counts sum to `total`.
6. THE Graveyard_View_Model SHALL be a pure function: the same input SHALL give a deep-equal output, a reordering of an input whose names are all distinct SHALL give a deep-equal output, and the input list and its records SHALL NOT be mutated.
7. WHEN the input is empty, THE Graveyard_View_Model SHALL return four empty groups, all counts 0 and `total` 0, and SHALL NOT throw.
8. THE Graveyard_View_Model SHALL mark only the `alive` group as `defaultCollapsed`.

### Requirement 7: Graveyard layout

**User Story:** As a visitor, I want dead packages to be impossible to miss and healthy ones out of the way, so that the screen tells the story at a glance.

#### Acceptance Criteria

1. THE The_Graveyard SHALL show the Grade_Groups in Grade_Order under one heading each, with the count in the heading, and SHALL omit the list (not the count) of a group with zero Graves.
2. THE The_Graveyard SHALL draw Dead_Tombstones expanded, first in the document and largest, and SHALL draw `dying` Tombstones expanded at standard size and `ailing` Tombstones expanded at compact size.
3. THE The_Graveyard SHALL show the `alive` group collapsed by default as one disclosure button reading the count (for example "113 alive packages") with `aria-expanded="false"` and `aria-controls`; WHEN the visitor activates it, THE page SHALL show the compact alive Tombstones, set `aria-expanded="true"`, and offer the same button to collapse them again.
4. THE page SHALL NOT render the alive Tombstones before the group is first expanded.
5. THE Tombstone SHALL show the package name, the score as a number, the grade as text, and a one-line summary: the Calibration_Row reason when the Grave has a calibration, otherwise the two signals with the most points written as "label raw-value", and, for any Grave with unknown signals, an "n unknown" badge.
6. WHEN the dead and dying groups are both empty, THE The_Graveyard SHALL show a message that no dead or dying packages were found, with the ailing and alive counts, instead of an empty area.
7. WHEN the report has zero dependencies, THE The_Graveyard SHALL show "No dependencies found" with the skipped count.
8. WHEN `report.skipped` is not empty, THE The_Graveyard SHALL show a collapsed "Skipped (n)" disclosure listing each name, specifier and reason as text.

### Requirement 8: Summary header

**User Story:** As a visitor, I want the headline numbers and any caveats on the first screen, so that I know how much to trust what follows.

#### Acceptance Criteria

1. THE Summary_Header SHALL show the repository (`owner/repo`), the ref ("default branch (HEAD)" when the ref is `HEAD`), the scan time as `YYYY-MM-DD HH:MM UTC` (the raw text when the time does not parse), the source kind ("Snapshot" or "Live scan"), the number of scanned dependencies and the number of skipped dependencies.
2. THE Summary_Header SHALL show four counts in Grade_Order, each taken from the Graveyard_View `counts`, each with a text label, and each being a control that moves focus to its group (for the collapsed alive group, to its disclosure button).
3. IF the `summary` of the report differs from the counts computed from its dependencies in any grade count or in `total`, THEN THE Summary_Header SHALL show a visible notice that the file's summary disagrees with its dependencies and that the computed counts are shown.
4. THE Summary_Header SHALL show every string of `report.warnings`, in order and unchanged, in one labelled list, and SHALL NOT show an empty list when there are no warnings.
5. WHEN `report.dependencies` is not empty and every dependency has `versionSource` equal to `range`, THE Summary_Header SHALL show a note that versions come from declared ranges because no `package-lock.json` was read, and that Yarn and pnpm lockfiles are not read in v1. The condition SHALL be computed from `versionSource`, not by matching warning text.
6. THE Summary_Header SHALL fit in at most 240 CSS pixels of height at the Recording_Viewport.

### Requirement 9: Tombstone detail and breakdown

**User Story:** As a visitor, I want to click a tombstone and see exactly why it is dead, so that the score is never a black box.

#### Acceptance Criteria

1. WHEN a visitor clicks a Tombstone, or presses Enter or Space while it has focus, THE Graveyard_Page SHALL open the Detail_Panel for that Grave and SHALL add `pkg=<key>` to the Route.
2. THE Detail_Panel SHALL show the package name, the version (`resolvedVersion` with the text "from lockfile", or `declaredRange` with the text "declared range"), the dependency kinds, the score as "n / 100", the grade as text with its score range, and the replacement (type and names) when the Grave has one.
3. THE Breakdown SHALL contain exactly one Signal_Row for each entry of `death.parts`, in the order of `death.parts`, each showing a label, a one-sentence explanation, the raw value, "points / weight", and whether the signal is known or unknown.
4. THE Breakdown SHALL end with a Total_Row showing `death.score`, and the sum of the points of all Signal_Rows plus the Calibration_Row (if any) SHALL equal that displayed score.
5. IF the sum of the row points differs from `death.score`, THEN THE Detail_Panel SHALL show a visible error row "Breakdown does not add up: rows sum to X, score is Y" and SHALL NOT change any displayed number to hide the difference.
6. IF `toGrade(death.score)` differs from `death.grade`, THEN THE Detail_Panel SHALL show a visible notice naming both grades.
7. WHEN the Grave has evidence warnings, THE Detail_Panel SHALL list each one as text.
8. THE Breakdown SHALL be a semantic table (caption, header cells with scope) and SHALL reflow into stacked labelled rows at the Narrow_Viewport.

### Requirement 10: Calibration row

**User Story:** As a visitor, I want to see why a package with a middling weighted sum is still dead, so that the declared-abandoned rule is visible, not hidden.

#### Acceptance Criteria

1. WHEN `death.calibration` is present, THE Breakdown SHALL contain exactly one Calibration_Row, placed after the Signal_Rows and before the Total_Row, labelled "Declared abandoned", showing the text "Declared abandoned: <reason>, +<points>" with the reason and points of the calibration unchanged.
2. WHEN `death.calibration` is absent, THE Breakdown SHALL contain no Calibration_Row and no placeholder for one.
3. THE Calibration_Row SHALL be visually distinct from Signal_Rows by a label and a border or marker (not by color alone) and SHALL carry an explanation that the package's own author or registry declared it abandoned, so its score was raised to the dead band.
4. THE Calibration_Row points SHALL count in the Breakdown sum of Requirement 9.4.

### Requirement 11: Unknown signals

**User Story:** As a visitor, I want to see which facts were missing and why, so that an unknown is never mistaken for a clean bill of health.

#### Acceptance Criteria

1. WHEN a part has `status` equal to `unknown`, THE Signal_Row SHALL show the word "Unknown" with a marker (not by color alone) in place of a known/unknown tick, and the raw value text from the part.
2. WHEN the Grave has an `unknownReasons` entry for that signal, THE Unknown_Row SHALL show its source, its category in plain words, and its message; OTHERWISE it SHALL show "No reason recorded".
3. THE Unknown_Row SHALL carry the explanation that an unknown signal is scored as partly dead and never as alive, and SHALL still show its points, which count in the Breakdown sum.
4. WHEN a Grave has one or more unknown parts, THE Tombstone SHALL show an "n unknown" badge with an accessible label.

### Requirement 12: Source links

**User Story:** As a visitor, I want every number to link to its real source, and I want those links to be safe, so that evidence is one click away and a tampered file cannot run code.

#### Acceptance Criteria

1. WHEN a Signal_Row has a `sourceUrl` that is a Safe_Url, THE Signal_Row SHALL show a link whose `href` is exactly that string, whose text names the host, which opens in a new tab with `rel="noopener noreferrer"`, and whose accessible name includes the signal label, the host and "opens in a new tab".
2. THE Graveyard_View_Model SHALL expose Safe_Url validation as a pure function `safeHttpUrl(value: unknown): string | undefined` that returns the input unchanged when it is a Safe_Url and `undefined` otherwise, for every input including non-strings.
3. IF a `sourceUrl` is present and is not a Safe_Url (for example `javascript:`, `data:`, `vbscript:`, `file:`, a protocol-relative `//host`, a relative path, a URL with leading whitespace or control characters, or a URL with userinfo), THEN THE Signal_Row SHALL create no anchor and no `href`, and SHALL show the text "Source link withheld: not an http or https URL" followed by the value cut to 80 characters as plain text.
4. IF a Signal_Row has no `sourceUrl`, THEN THE Signal_Row SHALL show "No source recorded".
5. THE Graveyard_Page SHALL create an element attribute that holds a URL (`href`, `src`, `action`, `formaction`, `xlink:href`, `srcset`) only from a Safe_Url or from a constant in the page source.

### Requirement 13: Proof slot

**User Story:** As a maintainer, I want a visible place and a fixed data shape for the future proof, so that the later exorcism spec only fills it in.

#### Acceptance Criteria

1. THE Graveyard_View_Model SHALL expose `proofSlotFor(grave)`, which returns a ProofSlot for a Grave whose grade is `dead` or `dying` and `undefined` for `ailing` and `alive`.
2. THE ProofSlot SHALL be `{ package: string; state: ProofState }`, where ProofState is the union of: `coming_soon`; `no_call_sites`; `running` (with a step); `failed` (with the failing leg and a counterexample holding seed, shrunk value and path); and `verified` (with an old leg, a new leg and a sabotage result). A leg SHALL hold the package, the version, the result (`green`, `red` or `not_run`), `numRuns` and the seed. The Graveyard_View_Model SHALL produce only `coming_soon` in this spec.
3. THE Detail_Panel of a dead or dying Grave SHALL contain a "Proof" section with the text "Exorcism coming", a short description saying that old-package and new-package pin tests and a sabotage check will appear there, and a control that has `aria-disabled="true"`, stays in the tab order, has an accessible description, and does nothing when activated.
4. THE Detail_Panel of an ailing or alive Grave SHALL contain no Proof section.
5. THE Proof section renderer SHALL handle every ProofState with an exhaustive `switch` whose default branch assigns the value to `never`, so that adding a state later is a compile error until it is rendered.
6. THE Graveyard_Ui SHALL NOT display any pass or fail result, test count or seed for a Proof_Slot in this spec, and SHALL make no network request for a Proof_Slot.

### Requirement 14: Keyboard and focus

**User Story:** As a keyboard user, I want to reach and operate everything without a mouse, so that the Graveyard is usable by anyone.

#### Acceptance Criteria

1. THE Graveyard_Page SHALL build every interactive element from a native `button`, `a`, `input`, `summary` or `select`, and SHALL NOT attach click handlers to non-interactive elements without a native interactive role.
2. THE Graveyard_Page SHALL put a "Skip to the dead packages" link first in the tab order of The_Graveyard, and the tab order SHALL follow the visual order.
3. THE Graveyard_Page SHALL show a focus indicator on every focusable element that is at least 3 CSS pixels thick and has a contrast ratio of at least 3:1 against the adjacent colors, and SHALL NOT set `outline: none` or `outline: 0` without an equivalent replacement.
4. WHEN the Detail_Panel opens, THE Graveyard_Page SHALL move focus to the panel heading, SHALL keep Tab and Shift+Tab inside the panel, SHALL mark the rest of the page `inert` and `aria-hidden="true"`, and SHALL give the panel `role="dialog"`, `aria-modal="true"` and `aria-labelledby`.
5. WHEN the visitor presses Escape, activates the Close button, or activates the backdrop, THE Graveyard_Page SHALL close the Detail_Panel, remove `pkg` from the Route, remove `inert` and `aria-hidden`, and return focus to the Tombstone that opened it; IF that Tombstone no longer exists, THEN focus SHALL go to the heading of its group.
6. WHEN the page changes phase (picker, loading, report, error), THE Graveyard_Page SHALL move focus to the new screen's `h1` (`tabindex="-1"`), so that assistive technology announces the change.
7. THE page SHALL contain no keyboard trap other than the open Detail_Panel.

### Requirement 15: Labels, tooltips and assistive technology

**User Story:** As a visitor using a screen reader or a touch screen, I want every score and tombstone explained, so that nothing depends on hovering.

#### Acceptance Criteria

1. THE Tombstone button SHALL have an accessible name of the form "<name>, <grade>, score <n> of 100" and an accessible description "Opens the score breakdown", and SHALL have a `title` with the same text as its name.
2. THE score element SHALL carry the accessible text "Death score <n> out of 100: <grade>. 0 is alive, 100 is dead." and a `title` with the same text.
3. THE grade label SHALL be shown as text, never as color alone, and the Summary_Header SHALL carry a legend that gives each Grade_Band its score range, derived from `toGrade` boundaries.
4. EACH Signal_Row label SHALL be followed by its one-sentence explanation as visible text, so that no explanation depends on hover or focus.
5. EACH icon-only control SHALL have an `aria-label`.
6. THE Graveyard_Page SHALL use landmarks (`header`, `main`, `nav` for the skip links and group links), one `h1` per screen, `h2` for groups and for the Detail_Panel title, and `lang="en"`.
7. THE Graveyard_Page SHALL announce loading, errors and the end of a rate-limit countdown through `role="status"` or `role="alert"` regions, and SHALL NOT announce the countdown every second.
8. THE Graveyard_Page SHALL set `document.title` to include `PRODUCT_NAME` and, for a loaded report, the repository.

### Requirement 16: Night theme, contrast, responsive layout, motion and recording legibility

**User Story:** As a viewer of the demo video and a user on a phone, I want a distinctive, readable night graveyard that works at any size, so that the product looks intentional and stays usable.

#### Acceptance Criteria

1. THE Night_Theme SHALL define all colors and font stacks as Theme_Tokens in `tokens.css`: a near-black blue-green ground, pale bone text, and ember (dead), amber (dying), lichen (ailing) and moss (alive) grade accents; no Theme_Token color with saturation above 15% SHALL have a hue from 250 to 335 degrees (no purple, violet or magenta); no background Theme_Token SHALL have a lightness above 25%; and no font stack SHALL contain a serif family (generic `sans-serif` and `monospace` only).
2. EVERY text and background Theme_Token pair used together SHALL have a contrast ratio of at least 4.5:1, or at least 3:1 for text of 24 CSS pixels and above (or 19 and above when bold), for the focus ring, and for component borders; the pairs SHALL be listed in one place and a test SHALL compute their ratios from `tokens.css`.
3. THE layout SHALL show no horizontal scroll at the Narrow_Viewport (375 and 320 CSS pixels): grid tracks use `minmax(0, 1fr)`, long names use `overflow-wrap: anywhere`, the Breakdown table stacks, and the Detail_Panel is a full-height sheet.
4. WHERE Reduced_Motion is set, THE Graveyard_Page SHALL run no animation or transition and SHALL scroll with `behavior: auto`; all motion CSS SHALL be inside `@media (prefers-reduced-motion: no-preference)`.
5. EVERY interactive element SHALL have a target at least 44 by 44 CSS pixels on the Narrow_Viewport.
6. AT the Recording_Viewport, THE page SHALL use a base text size of at least 18 CSS pixels, Dead_Tombstone names of at least 24 CSS pixels, Dead_Tombstone scores of at least 56 CSS pixels, and Breakdown row text of at least 18 CSS pixels; and, for a report with at most 6 dead packages, the Summary_Header and every Dead_Tombstone SHALL be visible without scrolling.
7. THE Dead_Tombstone SHALL differ from other Tombstones by shape and by the text "DEAD" as well as by color.
8. THE page SHALL declare `color-scheme: dark`, SHALL use only system font stacks, and SHALL keep borders visible under `forced-colors: active`.
9. THE built page SHALL carry a Content-Security-Policy `<meta>` that allows only same-origin scripts, styles, images and connections, and forbids `base` and cross-origin form actions.

### Requirement 17: Routes and deep links

**User Story:** As a presenter, I want to share a link straight to a package breakdown and use the back button, so that the demo video can start anywhere.

#### Acceptance Criteria

1. THE Graveyard_Page SHALL use hash routes: `#/` (picker), `#/demo/<name>` with an optional `?pkg=<key>`, and `#/live?repo=<owner/repo>` with optional `&ref=<ref>` and `&pkg=<key>`, with every value percent-encoded.
2. THE Route parser SHALL be total: any string, including `#`, the empty string, a wrong prefix, bad percent-encoding or a name that does not match `^[a-z0-9][a-z0-9-]{0,63}$`, SHALL give the `picker` Route and SHALL NOT throw.
3. FOR ALL valid Routes, parsing the formatted hash SHALL give back the same Route (round trip), including package keys that contain `/`, `@`, `#`, `%`, `&`, `?`, spaces and non-ASCII characters.
4. WHEN the page loads on a `demo` Route, THE Graveyard_Page SHALL load that demo and, when `pkg` is present and names a Grave, open its Detail_Panel.
5. WHEN the page loads on a `live` Route, THE Graveyard_Page SHALL NOT start a scan; it SHALL show the Repo_Picker with the form prefilled and a message that live scans are not re-run on reload.
6. WHEN `pkg` names no Grave of the loaded report, THE Graveyard_Page SHALL show the report with a non-blocking notice "No package named <name> in this scan" and no Detail_Panel.
7. WHEN the visitor uses the browser Back or Forward buttons, THE Graveyard_Page SHALL show the Route of that history entry, including opening and closing the Detail_Panel.

### Requirement 18: Output safety

**User Story:** As a maintainer, I want strings from a scanned repo to be unable to inject markup or script, so that scanning a hostile repo is safe.

#### Acceptance Criteria

1. THE Graveyard_Page SHALL write every string from a report, an API error body or the URL into the DOM only through `textContent`, `createTextNode`, or `setAttribute` of a non-URL, non-event, non-style attribute.
2. THE Graveyard_Page source SHALL contain none of `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`, `new Function` or `setAttribute("on…`, and a test SHALL scan the source for them.
3. THE Graveyard_Page SHALL build class names, element ids and CSS custom property names from fixed vocabularies and index-based ids (for example `grave-3`), never from report strings.
4. THE Graveyard_Page SHALL never use a report string as a CSS selector; lookups by package key SHALL compare strings in code.
5. WHEN a report string is longer than 200 characters, THE Graveyard_Page SHALL wrap it inside its container without widening the page, and SHALL cut it to 200 characters with an ellipsis in a Tombstone.

### Requirement 19: Correctness properties

**User Story:** As a maintainer, I want the pure view-model proven by properties that can actually fail, so that green tests mean something.

#### Acceptance Criteria

1. THE test suite SHALL include one fast-check property for each of these subjects, each with `numRuns` 100 and the Fast_Check_Runner seed policy: grouping is a partition (Property 1); ordering is grade band, then score descending, then name, stable and deterministic (Property 2); Breakdown rows sum to the displayed score (Property 3); header counts equal the grouped list sizes (Property 4); source links are only ever http or https URLs (Property 5). Three additive properties cover the route codec (Property 6), the Repo_Input parser (Property 7) and Ui_Error totality (Property 8).
2. Property 1 SHALL assert, for generated lists of 0 to 60 Grave_Records with colliding names and scores, that the multiset of input positions across the four groups equals the set of all input positions exactly once, that every Grave is in the group of its `death.grade`, that `key` values are unique, and that the input is unchanged afterwards.
3. Property 2 SHALL assert that the Graves, concatenated, equal the stable sort of the input under the Requirement 6.3 order computed by an independent reference comparator, that the order is the same when the input is shuffled and all names are distinct, and that two calls give deep-equal results.
4. Property 3 SHALL assert, for Grave_Records built with the real `scoreDeath` over generated signals (including all-unknown, declared-abandoned, and abandoned-floor configurations), that the Signal_Row points plus the Calibration_Row points equal the Total_Row score, that the Calibration_Row exists if and only if `death.calibration` exists, that there is one Signal_Row per part in part order, and that for a tampered record whose parts do not sum to its score the Breakdown reports `consistent: false`.
5. Property 4 SHALL assert that for every grade the header count equals the length of that group's list and equals an independent recount of the input by `death.grade`, and that the four counts sum to the number of records; it SHALL run through the Summary_Header builder of the page as well as through the Graveyard_View.
6. Property 5 SHALL assert, for generated source URL strings drawn from a hostile corpus (`javascript:`, `JaVaScRiPt:`, `data:`, `vbscript:`, `file:`, `//host`, leading whitespace and control characters, embedded tabs and newlines, userinfo, backslashes, very long strings, valid http and https URLs in mixed case) and from arbitrary strings, that `safeHttpUrl` returns either `undefined` or the input unchanged with an `http://` or `https://` prefix, and that every Signal_Row `href` produced by `buildBreakdown` satisfies the same.
7. Property 6 SHALL assert the Route round trip of Requirement 17.3 and totality of Requirement 17.2. Property 7 SHALL assert that every accepted Repo_Input yields an owner, repo and ref that satisfy the Requirement 3.3 patterns, that every `owner/repo` pair matching those patterns is accepted, and that no other host is accepted. Property 8 SHALL assert Requirement 4.11.
8. IF a property fails, THEN THE test suite SHALL print the fast-check seed and the shrunk counterexample.

### Requirement 20: Sabotage checks

**User Story:** As a maintainer, I want each property to be shown to fail against a deliberately wrong implementation, so that no property is trivially green.

#### Acceptance Criteria

1. FOR each of Properties 1 to 8, THE test suite SHALL contain a sabotage list in `test-support/sabotage/`, each entry a deliberately wrong implementation with a name, and each property file SHALL export a `build(impl)` function so that a central sabotage test can run the property against each entry.
2. THE sabotage lists SHALL include at least these wrong implementations. Property 1: dropping a record that shares a name with another; dropping the alive group; putting a boundary-score record in two groups; non-unique keys. Property 2: score ascending; no name tiebreak; reversed Grade_Order; name before score; `localeCompare` for names; comparing the score as a string. Property 3: omitting the Calibration_Row; counting the calibration twice; showing the weight in place of the points; excluding unknown rows from the sum; computing the total from the parts only. Property 4: counts taken from `report.summary`; `dying` counted as `dead`; the total including skipped dependencies; an off-by-one in the alive count. Property 5: no check; a `javascript:` denylist only; a case-sensitive denylist; `startsWith("http")`; accepting `//host`; accepting userinfo; validating a trimmed copy and returning the untrimmed value. Property 6: not encoding `/` in package keys; not encoding `&`; dropping `ref`; lower-casing the repo. Property 7: accepting extra path segments; accepting any host; accepting `..` in a ref; rejecting an underscore in a repo; changing letter case. Property 8: throwing on an unknown error code; an empty detail; an unclamped or negative `retryAfterSeconds`.
3. THE central sabotage tests SHALL fail with the message `Sabotage "<name>" stayed green for "<property>"` when an entry does not make its property fail, SHALL assert that every list is non-empty, and SHALL assert that the real implementations pass every property under the same fixed seed 20261113.

### Requirement 21: DOM tests

**User Story:** As a maintainer, I want the detail view and the keyboard flow tested in a DOM, so that accessibility behavior does not regress.

#### Acceptance Criteria

1. THE test suite SHALL run DOM tests in a `jsdom` environment selected per file (`// @vitest-environment jsdom`), with the DOM library installed as an exact-pinned dev dependency, and SHALL leave the default Node environment for all other test files.
2. A DOM test SHALL open the Detail_Panel of a calibrated dead package from a trimmed parse-server Fixture_Report and assert: one Signal_Row per part; one Calibration_Row with the text "Declared abandoned: <reason>, +<points>"; a Total_Row equal to the score; and the sum of the displayed row points equal to the displayed score.
3. A DOM test SHALL render a synthetic Fixture_Report with unknown signals and assert that each Unknown_Row shows "Unknown", its source, category and message, and the "n unknown" badge on the Tombstone.
4. A DOM test SHALL render a Fixture_Report with tampered source URLs (`javascript:alert(1)`, `data:text/html,x`) and assert that no anchor in the page has such an `href`, that the withheld text is shown, and that a valid https URL renders as an anchor with `rel="noopener noreferrer"`.
5. A DOM test SHALL drive the keyboard flow: Tab reaches the skip link then the first Dead_Tombstone; Enter opens the Detail_Panel; focus is on the panel heading; Tab and Shift+Tab stay inside; Escape closes it; focus returns to the same Tombstone; Space also opens it.
6. A DOM test SHALL assert the Proof section on a dead Grave (disabled control with `aria-disabled="true"`, focusable, activation does nothing and triggers no fetch) and its absence on an ailing and an alive Grave.
7. A DOM test SHALL assert that the alive group is collapsed by default with a count, that its button toggles `aria-expanded` from the keyboard, and that alive Tombstones do not exist in the DOM before the first expansion.
8. A DOM test SHALL assert the rate-limit state: a 429 response with `retry-after: 42` shows 42 seconds, keeps the scan button `aria-disabled="true"`, leaves Demo_Repo cards usable, and re-enables the scan button when the fake clock reaches the end.
9. A DOM test SHALL assert that a response arriving for a superseded request does not change the page (Requirement 4.10).
10. THE tests SHALL assert Theme_Token contrast (Requirement 16.2), the hue and serif rules (Requirement 16.1), the reduced-motion rule (Requirement 16.4) and the absence of forbidden APIs in the page source (Requirement 18.2) by reading the CSS and source files.

### Requirement 22: Zero-network tests and fixtures

**User Story:** As a maintainer, I want the UI tested on real recorded data with no network, so that the tests are fast and honest.

#### Acceptance Criteria

1. THE test suite SHALL make zero real network requests; THE Api_Client SHALL receive its `fetch` by injection, and every test SHALL supply a fake `fetch` that records its calls and fails the test on any unexpected URL.
2. THE test suite SHALL load the existing `no-network.setup.ts` for every test file, so that a stray global `fetch` call fails the test.
3. THE test suite SHALL store trimmed copies of `/demo` snapshots under `apps/exorcist-web/src/__fixtures__/` (a calibrated dead package from parse-server, the single dead package from prettier, a report with no dead packages from jest, and the small pump report), plus a README naming the source files and the trimming rule.
4. THE test suite SHALL parse all four `/demo/*.json` files with `parseReport` and SHALL assert that the Graveyard_View invariants of Requirement 6 hold on each, so that the tests track re-snapshots without hard-coded counts.
5. THE test suite SHALL use synthetic Fixture_Reports built with the real `scoreDeath` for dying packages, unknown signals, tampered URLs and tampered sums, because the demo snapshots contain none of these.
6. THE Graveyard_Ui SHALL make zero calls to a large language model and SHALL declare no LLM client dependency in any `package.json` it adds or changes.

### Requirement 23: Run, build and documentation

**User Story:** As a developer, I want one command to see the Graveyard locally and one to build it, so that the demo is easy to start.

#### Acceptance Criteria

1. THE root `package.json` SHALL provide `npm run dev`, which starts the Scan_Api (the existing `serve` script of `exorcist-npm`, loopback port 24817) and the Vite dev server for `apps/exorcist-web`, stops both when interrupted, and prints the page URL.
2. THE Vite dev server SHALL proxy `/api` to `http://127.0.0.1:24817`, so that the page uses same-origin paths and the Scan_Api needs no CORS headers.
3. THE package `apps/exorcist-web` SHALL provide `build` (Vite production build into `dist/`), `typecheck` (`tsc --noEmit`) and `dev` scripts; `npm test` and `npm run typecheck` at the root SHALL NOT start a server or a build.
4. THE production build SHALL be static files that nginx can serve with `/api/` proxied to the loopback Scan_Api; this spec SHALL NOT add an nginx file.
5. THE final task SHALL append a dated entry to `docs/kiro-log.md` with the properties, the sabotage results, the manual visual checks of Requirement 16 that could or could not be run, and the judgment calls that matter.

### Requirement 24: Verification

**User Story:** As a maintainer, I want the whole repo green at the end, so that this spec cannot leave the build broken.

#### Acceptance Criteria

1. WHEN all tasks are complete, `npm run typecheck` SHALL pass with zero errors across all workspaces, including `apps/exorcist-web`.
2. WHEN all tasks are complete, `npm test` SHALL pass, including all existing suites unchanged in behavior.
3. THE verification SHALL state which parts of Requirement 16 (layout at 375 and 1920 by 1080 pixels, focus visibility, reduced motion in a browser) were checked in a real browser and which were checked only through CSS and DOM tests.
