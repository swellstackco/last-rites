# Bugfix Design

## Overview

Three defects (B1 to B3, `bugfix.md`) have one cause: the web app assumes every report is npm. The fix gives the app an ecosystem switch in four small places and moves one pure function so the browser can use it.

1. **One name function.** `actionProofName` moves to `skeleton/src/proof/names.ts` (kit code, pure, no `node:crypto`), exported from `skeleton/src/proof/index.ts`. `apps/exorcist-actions/src/proof/names.ts` re-exports it and keeps `repoProofName`. Its SHA-256 is a small pure implementation (`skeleton/src/proof/sha256.ts`, UTF-8 via `TextEncoder`) because the web bundle must not import `node:crypto`. A property compares it with `node:crypto` for arbitrary strings, so the output of every existing report name is unchanged.
2. **One resolver.** `proofNameFor(ecosystem, name)` in `skeleton/src/proof/names.ts`. `controller.ts` (`proofFor`) uses it instead of `isProofName(pkg)` on the raw name, and passes the result to `deps.api.getProof`. The Proof_Key (`<demo>/<proofName>`) replaces the raw name in the `proofsStarted`/`proofsSettled` keys.
3. **Ecosystem in the view model.** `SummaryHeader` gains `ecosystem: "npm" | "github-actions"` and `lockfileNote`; the header view renders the note it is given. The Detail_Panel receives the ecosystem and renders the Package_Link and the labels.
4. **Proof kinds.** `buildProofView` gains optional fields per attempt (kind line, coverage text, rewrite) filled only for Pin_Kind and Contract_Kind attempts, so npm attempts keep their view unchanged.

Nothing changes in the codec, the scanner, the demo files, the score engine or the vite plugin (the plugin is only tested against the two new paths).

## Bug Details

### Root causes (hypotheses, confirmed or revised by tasks 1.1 to 1.4)

- **B1.** `controller.ts` `proofFor`: `const pkg = grave.record.name; if (!isProofName(source.name) || !isProofName(pkg)) return undefined;`. `"actions/checkout"` fails the pattern, so `proofFor` returns `undefined` and `slotFor` falls back to `proofSlotFor`'s `coming_soon`. Even a lower-cased, slashless name would miss, because the file is named with the hash suffix. `vite.config.ts` `isProofName` is a copy of the pattern and accepts `actions-checkout-728eabd6` (55 + 1 + 8 chars at most, so within 64). The built `demo/proofs/nixpacks-actions/*.json` files are already emitted by the plugin loop (task 1.1 asserts it).
- **B1 view.** `proof-view.ts` has no notion of shapes: `attemptView` maps status, runs, seed, sabotage and the counterexample only. `shapes[].id`, `shapes[].coverage` and `candidate.source` are not shown.
- **B2.** `report-view.ts`: `rangesOnly = dependencies.length > 0 && every versionSource === "range"`; `header.ts` maps `rangesOnly` to the npm sentence regardless of ecosystem. `ScanReport.ecosystem` is never read by the web app.
- **B3.** Not proven (see bugfix.md). Candidates, in the order task 1.4 checks them on the unfixed page: (a) a name-derived link in a deployed build that differs from source; (b) the label "Deprecated on npm" (`SIGNAL_INFO.deprecated.label`, rendered by `buildBreakdown`); (c) an `aria-label` or title built from the name. If (a) is not reproducible from a clean build of this commit, the fix still adds the github Package_Link (2.7) and removes (b); the log records that no npm link was found in source.

### Formal Bug Condition

See the summary in `bugfix.md`. In test terms, X is a mounted Graveyard_Page for a report R (the committed `demo/nixpacks-actions.json`, or an arbitrary github-actions report) with a proof file store S.

```
FUNCTION proofShownFor(X, dep)         // the ProofState after the panel settles
  RETURN settled state of Proof_Section for dep, S answering GET /demo/proofs/<demo>/<n>.json
FOR ALL dep in R WHERE X.ecosystem = github-actions AND S has actionProofName(dep.name):
  ASSERT proofShownFor(X, dep).status = "report"        // fails today: coming_soon
```

## Fix Design

### Names (`skeleton/src/proof/names.ts`)

```ts
export function actionProofName(actionName: string): string   // moved verbatim; sha256 from ./sha256.js
export type Ecosystem = "npm" | "github-actions";
/** The Proof_Name of one dependency, or undefined when it has none. Pure and total. */
export function proofNameFor(ecosystem: Ecosystem | undefined, name: string): string | undefined {
  if (ecosystem === "github-actions") return typeof name === "string" && name !== "" ? actionProofName(name) : undefined;
  return isProofName(name) ? name : undefined;
}
```

`actionProofName` always returns a Proof_Name (`<=55 slug + "-" + 8 hex`), so the existing guards still hold downstream. The exorcist-actions P12 properties (`actions-p12.ts` has a hand-written model of the name) keep passing and become the oracle for the move: the model is the independent `node:crypto` implementation.

`skeleton/src/proof/index.ts` stays "Pure entry: no fast-check, no Node": `sha256.ts` uses no Node module (uint32 arithmetic, `TextEncoder`).

### Controller

```ts
const pkg = proofNameFor(report.ecosystem, grave.record.name);
if (!isProofName(source.name) || pkg === undefined) return undefined;
const key = `${source.name}/${pkg}`;
```

`report` is the report of the current phase (`phase.tag === "report"`). Everything after is unchanged (loading state, abort, settle, `reportOnly` for ailing/alive). A name shared by npm and an action cannot collide: keys are per demo.

### Proof view (skeleton `graveyard/proof-view.ts`)

`AttemptView` gains optional fields, present only when `kindOf(attempt)` is `pin` or `contract`:

```ts
kind?: "pin" | "contract";
kindLine?: string;        // fixed strings below
coverageText?: string;    // "5 files, 11 uses" / "dropped.override 6, dropped.profile 6, ..."
rewrite?: { lines: string[]; moreCount: number };   // candidate.source split on "\n", first MAX_REWRITE_LINES = 40
```

- `kindOf(a)` = `"pin"` when `a.shapes.length === 1 && a.shapes[0].id === "pin"`, `"contract"` likewise, else undefined (npm shapes and mixed shapes are untouched).
- `kindLine`: pin `"Pin check: refs pinned to a commit"`; contract `"Swap contract: inputs of the old action mapped to the replacement"`.
- `coverageText`: keys of `shape.coverage` in the report's sorted order, `"<key> <n>"` joined by `", "`; for pin the keys `files` and `uses` are shown as `"5 files, 11 uses"` (value then word). Empty coverage gives no line.
- `rewrite`: from `candidate.source` when present. The candidate name is already shown by `candidateName` ("Attempt 1: swap-actions-rs-toolchain-a103c84e"). The diff is not parsed; its lines are shown as written, so the replacement (`dtolnay/rust-toolchain@master`) is visible in the rewrite block.
- The page view (`views/proof-slot.ts`) renders `kindLine`, `coverageText` (muted) and a `pre.proof-pre` (`tabindex=0`, text only) with the rewrite lines and "and N more lines". The headline `ProofView` is unchanged; `buildProofView` only adds the attempt fields.

### Header and labels

`buildSummaryHeader` adds:

```ts
ecosystem: "npm" | "github-actions";      // report.ecosystem ?? "npm"
lockfileNote?: string;                    // npm: the existing sentence when rangesOnly; actions: "Refs come from workflow uses: lines." when rangesOnly
```

`rangesOnly` keeps its meaning and value (preservation). `header.ts` renders `lockfileNote` in `p.note` instead of the inline string; the npm sentence moves to `constants.ts`/the model unchanged, byte for byte.

`buildBreakdown(dep, options?: { labels?: Partial<Record<SignalName, string>> })` in skeleton: an optional override of row labels, default none (identical output). The Detail_Panel passes `{ deprecated: "Deprecated" }` for github-actions.

### Package link

`apps/exorcist-web/src/model/package-link.ts`, pure:

```ts
export function packageHref(ecosystem, name): { href: string; host: string } | undefined
```

github-actions: split on `/`; `owner` and `repo` must match `^[A-Za-z0-9][A-Za-z0-9._-]*$`, `repo` not `.` or `..`; result `https://github.com/${owner}/${repo}`. Any other shape (a `./local`, `docker://`, empty, over 200 chars, whitespace, `@ref` left in) gives `undefined`. npm: `undefined` (no link is added to npm; the npm page is preserved). The Detail_Panel renders a "Repository" fact with an `a` (`safeHref`, `target=_blank`, `rel="noopener noreferrer"`, `aria-label="Repository for <name>: github.com, opens in a new tab"`) only when `packageHref` returns a value; names are text.

## Correctness Properties

Property 1 (B1, fail-first). For every github-actions report in which each name is an Action_Name and a store S holding `demo/proofs/<demo>/<actionProofName(name)>.json` for a random subset, after the panel opens and settles: dead/dying shows `report` for names in S and `coming_soon` otherwise; ailing/alive shows a section exactly for names in S; the requested URL is `/demo/proofs/<demo>/<actionProofName(name)>.json` and the request count is one per name. Examples: `actions-rs/toolchain` shows Proved and `actions/checkout` shows Proved from the two committed files (read from disk by the test, served by a fake API).

Property 2 (one definition, 2.3). For every string s (arbitrary unicode incl. empty, upper-case, lone surrogates, `/` and `@`, long): `actionProofName(s)` from the skeleton equals an independent model written with `node:crypto` (test-only, in the actions P12 oracle), is a Proof_Name of at most 64 characters, and equals the value exported by `@last-rites/exorcist-actions`. A static check asserts that `grep "function actionProofName"` over `apps/` and `skeleton/` finds one definition and that no file under `apps/exorcist-web/src` (non-test) names `createHash` or `node:crypto`. Examples: the two committed hashes `a103c84e` and `728eabd6`.

Property 3 (preservation of npm paths, 3.1). For every name n and `ecosystem` in {absent, `npm`}: `proofNameFor(ecosystem, n) = (isProofName(n) ? n : undefined)`; on the committed parse-server demo the requested URLs equal the Reference path (`demo/proofs/parse-server/<name>.json` for the three committed names, none for scoped names).

Property 4 (B1 view). For every generated Pin_Kind or Contract_Kind attempt: the view has `kind`, `kindLine` equal to the fixed string, `coverageText` listing every coverage key once, and `rewrite.lines.length + rewrite.moreCount = number of lines of candidate.source`, with at most 40 shown. The committed reports give "Pin check ...", "5 files, 11 uses", and "Sabotage: 2 of 2 broken migrations caught"; "Swap contract ...", "dropped.override 6" and "12 of 12". For every attempt of any other shape set, every field that exists today is equal to the Reference_Views result and the new fields are absent. Rendering: every added string is in the DOM as text; a hostile rewrite (`<img src=x onerror=...>`) creates no element.

Property 5 (B2). For every report (arbitrary dependencies, versionSource, ecosystem): the header never contains `package-lock.json` or `pnpm` when `ecosystem = github-actions`; it contains exactly one Lockfile_Note "Refs come from workflow uses: lines." iff `dependencies.length > 0` and all `versionSource = "range"`, else none. For `npm` the header's text equals the Reference header (Property 7).

Property 6 (B3). For every github-actions report and each Action_Name n: `packageHref("github-actions", n)` is `https://github.com/<o>/<r>` for names of the form `o/r[/p...]` with valid `o`, `r`, and `undefined` for every other string (generated hostile: `javascript:`, `//evil`, `a/b c`, `../x`, `docker://alpine`, `./local`, empty, 10 000 chars). The mounted page for the committed `nixpacks-actions` demo (every package opened in turn) has no `href` or `aria-label` containing `npmjs.com`, no text "Deprecated on npm", and every Package_Link has host `github.com`.

Property 7 (preservation, 3.2 to 3.5). For arbitrary npm reports (the existing `scanReportArb`) and for the committed npm demos: the rendered header facts, tombstones, detail panel facts, breakdown rows and proof state facts deep-equal those of the Reference_Views. The npm detail panel has no `Repository` fact and the label "Deprecated on npm" is present when the deprecated row is. Unsafe URLs are still withheld; hostile names stay text.

## Sabotage_Lists (proof-rules.md)

Each is a deliberately wrong implementation that the named property must catch (at least one failing check), in `test-support/sabotage/`.

- **P1:** (a) `proofFor` passes the raw name (today's bug); (b) uses `repoProofName` instead of `actionProofName`; (c) lower-cases without the hash; (d) requests the right file but starts no request for ailing/alive; (e) requests twice per name (key uses the raw name); (f) shows `report` for a name not in S (swallows the 404).
- **P2:** (a) hash of the original-case name (not lower-cased); (b) slug cut at 56; (c) first 7 hex; (d) a copy of the function left in the web app (static check); (e) `node:crypto` import in skeleton (static check); (f) sha256 wrong for inputs over 55 bytes (padding bug; the length strategy must reach multi-block input).
- **P3:** (a) `proofNameFor` for npm returns `actionProofName(n)`; (b) accepts names the pattern rejects (scoped names get a request).
- **P4:** (a) kind read from `candidate.name` prefix; (b) `kindLine` swapped; (c) coverage dropped; (d) rewrite unbounded; (e) rewrite inserted with `innerHTML`; (f) new fields filled for npm attempts.
- **P5:** (a) always the npm sentence; (b) never a note; (c) note when dependencies are empty; (d) note when only some versionSources are `range`; (e) npm sentence for `npm` changed by one character.
- **P6:** (a) link to `https://www.npmjs.com/package/<name>`; (b) uses the whole name including the sub path; (c) accepts `docker://`; (d) skips `safeHref`; (e) leaves "Deprecated on npm"; (f) adds a link for npm.
- **P7:** (a) the label override applied to every ecosystem; (b) `buildBreakdown` options default changes the output; (c) the header note appended for npm lockfile reports.

## Testing Strategy

- jsdom/Node only, no network: proof files are read from `demo/proofs/**` by the test and served by a fake API (existing `test-support` harness of `proof.controller.dom.test.ts`). fast-check with `numRuns: 100`, seed policy of the existing `fc-runner`. Fail-first tests (1.1 to 1.4) are expected to fail on the unfixed code and are kept as the regression tests.
- Reference_Views: byte copies of `views/header.ts`, `views/proof-slot.ts`, `report-view.ts` header part, `proof-view.ts` and the controller's `proofFor` key logic as they are now, frozen under `__reference__/` (test-only).
- What jsdom cannot show (how the new proof block and the note look in a browser, link focus) is covered by one manual check (task 5.3) reported as checked or NOT RUN.
