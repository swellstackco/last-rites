# Implementation Plan: toe-tag-polish (bugfix)

## Overview

Fixes the seven defects T1-T7 of the Toe Tag redesign found in `docs/review/2026-11-13-toe-tag-visual-check.md`, without changing any data. Order follows the bugfix workflow, one defect group at a time: baseline first, then for each group the fix-check test, its recorded fail-first run on unfixed code, the fix, the sabotage entries, the updated old assertions and a checkpoint. **Each group (a Phase) lands whole: its fix-check tests and its fix are in the same group, so `npm test` and `npm run typecheck` are green at every group checkpoint.** The only red state allowed is the fail-first window inside a group (between the "write tests" task and the "fix" task), and it is never left behind. Commits reference task numbers (for example `toe-tag-polish 3.3: ...`). Do not commit as part of this plan unless the owner asks.

Phases: 1 baseline (green on unchanged code), 2 T1 proof for any grade, 3 T2 and T3 tag band and fields (one root cause, two fix-check tests), 4 T4 subtitle, 5 T5 home Masthead and hanging demo cards, 6 T6 scan-form label, 7 T7 one-up tags and word breaks, 8 documentation and full verification, 9 manual browser check.

Only `apps/exorcist-web` changes (`skeleton/` only if a task proves it necessary; the design says it is not). Do not touch `report-view.ts`, the router, the Api_Client, the scanner or any score, grade, point or weight text. Checks are DOM structure, static CSS text and recorded fixtures (jsdom/Node, no browser, no network); what they cannot show is covered by the manual check in 9.1 and reported separately.

## Tasks

### Phase 1: Preservation baseline on the unchanged code

- [x] 1.1 Freeze today's production views as `apps/exorcist-web/src/__reference__/views-v3/{tombstone,breakdown,header,proof-slot,picker,detail}.ts` (byte copies, imports adjusted to `../../`, header "FROZEN, test-only, never import from production code or main.ts"). Extend `test-support/reference-render.ts` (or add `toe-reference-v3.ts`) so `mountPage` can render with the v3 view set (an injected view set in test code only; production `controller.ts` is not changed by this task). _Requirements: 3.1, 3.2, 3.7_
- [x] 1.2 Extend `test-support/toe-facts.ts`: `proofPresent` for the open panel and `pickerFacts(root)` (per Demo_Card `data-demo`, name, repo, blurb, snapshot line, dead text or null; the Live_Scan_Form field ids, labels and hints). Add the generators `demoPackageArb`, `proofLoadArb`, `packageNameArb` and `snapshotSetArb` to `test-support/arbitraries.ts` (see design.md) with a generator example test (every generated proof text parses with `parseProofReport`, names are within the cut limit and include the 47-character scoped name, hostile names and names without "/" or "-"). _Requirements: 3.1, 3.7_
- [x] 1.3 Write Property TP6 in `test-support/properties/tp6.ts` and `toetag.polish.preserve.dom.test.ts` (`numRuns: 100`, `fc-runner` seed policy): `toeFacts(current)` deep-equals `toeFacts(reference v3)` and the facts expected from the report; proof facts for dead and dying packages equal the reference for every `proofLoadArb` state; `pickerFacts` equal the reference (the allowed-difference list starts empty and is extended only by the T1 and T5 groups). Add the sabotage entry (u) to `test-support/sabotage/tp6.ts` and register `tp6` in `toetag.sabotage.test.ts`. Run it against the UNCHANGED code: it must PASS.
- [x] 1.4 Record the baseline in `docs/kiro-log.md` (dated entry "toe-tag-polish baseline": seed, property names, counts). Checkpoint: run `npm run typecheck` and `npm test` (plain and with `CI=1`): green.

### Phase 2: T1 Proof for any grade (fix-check test and fix together)

- [x] 2.1 Write Property TP1 in `test-support/properties/tp1.ts` and `toetag.polish.proof.dom.test.ts` (jsdom, `checkAsyncProperty`, `numRuns: 100`): the assertions of design.md TP1 (request once per demo package and never for live; section facts equal the proof view for `valid` at any grade and any arrival order; no section and no placeholder for `absent`, `failed`, `invalid` at ailing and alive; dead and dying identical to the reference; pending ailing has no section; same `.sheet-tag` node before and after). Add the example for `parse-server` / `intersect` read from `demo/proofs/parse-server/intersect.json` (attempt 1 COUNTEREXAMPLE, attempt 2 PROVED). Extend the allowed-difference list of TP6 with "added `section.proof` for ailing/alive with a valid report". _Requirements: 1.1, 2.1, 3.3, 3.4_
- [x] 2.2 Run TP1 and the `intersect` example against the UNCHANGED code. Confirm they FAIL for the reasons in design.md "Hypothesized Root Cause" 1 (no `getProof` call for `intersect`; no `section.proof`). Append a dated entry to `docs/kiro-log.md` ("toe-tag-polish T1 fail-first": failing test names, the assertion messages, the seed) BEFORE changing any source file. If it passes or fails for another reason, stop and revise design.md.
- [x] 2.3 Fix T1. `app/controller.ts` `proofFor`: drop the grade test, keep the demo-only, `isProofName`, maps, abort and retry code; return per design.md change 1 (dead/dying as today; ailing/alive only a settled `report`). `views/detail.ts`: `renderContent` and `updateProof` build the slot per design.md change 2, and `updateProof` appends the section when the report arrives after the panel opened. `test-support/dom-harness.ts`: unregistered proof routes answer 404 (explicit routes win) so existing tests that open ailing or alive packages do not fail on an unexpected fetch. Do not change `skeleton/`. _Requirements: 2.1, 3.3, 3.4_
- [x] 2.4 Add sabotage entries (a)-(f) to `test-support/sabotage/tp1.ts` and register them in `toetag.sabotage.test.ts` (each caught at seed 20261113; the real code passes under the same seed). Update the assertions that pinned the grade gate (grep `proof.controller.dom.test.ts`, `proof.update.dom.test.ts`, `proof.dom.test.ts`, `tt2.ts` for tests that open an ailing or alive package or assert no request), nothing else. Run TP1, TP6 and the whole `apps/exorcist-web` suite: green.
- [x] 2.5 Checkpoint after Phase 2: `npm run typecheck` and `npm test` pass (TP1 and TP6 green, plain and `CI=1`). Record the TP1 result and the T1 sabotage names in `docs/kiro-log.md`.

### Phase 3: T2 band and T3 field alignment (one root cause, two fix-check tests)

- [x] 3.1 Add `checkToePolish(css)` to `test-support/css-checks.ts` (groups S-T2 and S-T3 of design.md TP5; later groups add S-T4 to S-T7 to the same function) and the DOM example test `toetag.polish.tag.dom.test.ts`: a Toe_Tag has the Band as its last visible block, with exactly two element children (the `.tomb-grade` word first, then `.tomb-badge` or `.tag-range`), three Tag_Fields in order PACKAGE, SCORE, CAUSE, exactly one visible Grade_Label. Write the two fix-check tests as separate named groups (`T2 band`, `T3 fields`) so each failure is reported on its own. _Requirements: 1.2, 1.3, 2.2, 2.3, 3.2_
- [x] 3.2 Run `checkToePolish` (S-T2, S-T3) and the DOM example against the UNCHANGED code. Confirm S-T2 fails because `.tombstone` has no `align-items` (the global `button` rule's `center` applies), and S-T3 fails because of the missing Field_Lines (`.tag-field + .tag-field` only) and the same cause; the DOM example passes. If a headless browser is available (`playwright-core` from the npx cache, as in `docs/review/2026-11-13-toe-tag-check.md`), also read `getComputedStyle(.tombstone).alignItems` and the Band's `offsetWidth` against the tag's `clientWidth` at 1352x800 and record them. Append a dated entry "toe-tag-polish T2/T3 fail-first" to `docs/kiro-log.md` BEFORE the fix, saying which of the two symptoms the evidence explains and whether the cascade hypothesis is confirmed, unconfirmed (no browser) or revised.
- [x] 3.3 Fix T2 and T3 in `styles/graveyard.css`: `.tombstone { align-items: stretch }`; `.tag-band { align-self: stretch; margin: 0 }`; `.tag-field` with `margin-inline: var(--space-3)`, `padding: var(--space-2) 0` and `border-bottom: var(--rule-thin) solid var(--ink)`, replacing `.tag-field + .tag-field`; `text-align: left` on `.tombstone`, `.tag-field`, `.tomb-score`. No DOM change. Keep the sizes (56 / 44 / 32px), the hole, the chamfer layers and the unclipped button. _Requirements: 2.2, 2.3, 3.5, 3.6_
- [x] 3.4 Add sabotage entries (v)-(aa) to `test-support/sabotage/tp5.ts` as string mutations of the real Stylesheet, register them in `toetag.sabotage.test.ts` (each caught by `checkToePolish`; assert each mutated string differs from the original). Update the assertions that pinned the old field rule (grep `toetag.layout.test.ts`, `tt6.ts`, `css-checks.ts` S3 for `.tag-field + .tag-field`), nothing else. Run the whole suite: green; Properties 4 to 8 (contrast, banned looks, layout, motion, focus) unchanged.
- [x] 3.5 Checkpoint after Phase 3: `npm run typecheck` and `npm test` pass (plain and `CI=1`); TP6 still PASS. Record results and the T2/T3 sabotage names in `docs/kiro-log.md`.

### Phase 4: T4 Subtitle without an orphan

- [x] 4.1 Write Property TP2 in `test-support/properties/tp2.ts` and `toetag.polish.subtitle.dom.test.ts`: the structure assertions of design.md TP2 on the graveyard page (generated reports) and on the home page, the `FORM_SUBTITLE` constant example, and S-T4 in `checkToePolish`. _Requirements: 1.4, 2.4, 3.2_
- [x] 4.2 Run TP2 and S-T4 against the UNCHANGED code: confirm they FAIL (one text node, no `.subtitle-phrase`, no `nowrap`). Append a dated entry "toe-tag-polish T4 fail-first" to `docs/kiro-log.md` BEFORE the fix.
- [x] 4.3 Fix T4: `constants.ts` (`FORM_SUBTITLE_PARTS`, `FORM_SUBTITLE` as the join; value unchanged), new `views/masthead.ts` `renderFormSubtitle()`, use it in `views/header.ts`, add `subtitle-phrase` to `ClassName`, and the CSS of design.md change 4 in `styles/graveyard.css` (`nowrap`, the below-360px exception for the first phrase, `min-width: 0` in the masthead grid). _Requirements: 2.4, 3.2, 3.5_
- [x] 4.4 Add sabotage entries (g)-(i) to `test-support/sabotage/tp2.ts` and (ab)-(ac) to `sabotage/tp5.ts`; register them. Update the assertions that read the subtitle as one text node (grep `toetag.header.dom.test.ts`), nothing else. Run the whole suite: green.
- [x] 4.5 Checkpoint after Phase 4: `npm run typecheck` and `npm test` pass (plain and `CI=1`); TP6 PASS. Record results in `docs/kiro-log.md`.

### Phase 5: T5 Home Masthead, hanging demo cards and dead counts

- [ ] 5.1 Write Property TP3 in `test-support/properties/tp3.ts` and `toetag.polish.home.dom.test.ts`: the assertions of design.md TP3 (one `h1` "Last Rites" as the wordmark, subtitle, Pitch_Line, no eyebrow and no old intro; each card hangs with a `.tag-hole`; `${n} dead` iff the snapshot was read, recounted by grade; failed and invalid snapshots add nothing and show no error; leaving the picker aborts the reads; the session map avoids a refetch; the Live_Scan_Form facts equal the reference). Add S-T5 to `checkToePolish` and the example that recomputes the four dead counts from `demo/*.json`. Extend the allowed-difference list of TP6 with "home eyebrow and intro removed, pitch added, `.demo-dead` added". _Requirements: 1.5, 2.5, 3.7, 3.8_
- [ ] 5.2 Run TP3 and S-T5 against the UNCHANGED code: confirm they FAIL (eyebrow present, no hole, no `.demo-dead`, no `string` rule on `.demo-cards > li`). Append a dated entry "toe-tag-polish T5 fail-first" to `docs/kiro-log.md` BEFORE the fix.
- [ ] 5.3 Fix T5, markup and style: `constants.ts` `PITCH_LINE`; `dom/h.ts` add `pitch` and `demo-dead`; `views/picker.ts` renders `div.masthead > h1.wordmark[tabindex=-1] + renderFormSubtitle()` then `p.pitch`, removes the eyebrow and old intro, adds `span.tag-hole[aria-hidden]` as the first child of each card, and exposes `setDemoDead(name, dead)` on `PickerHandle`; `styles/graveyard.css` per design.md change 5 (`h1.wordmark` left-aligned, `.grid > li, .demo-cards > li` string, two-sided chamfer on `.demo-card`, `.demo-dead`). Keep `data-demo`, click handler, ids, labels, hints, and the demo note. _Requirements: 2.5, 3.5, 3.7_
- [ ] 5.4 Fix T5, counts: in `app/controller.ts` picker phase, after mount read the four snapshots with `deps.api.getDemo` (`AbortController` aborted in `teardownScreen`, session map `demoDead`, settled demos not refetched, failures ignored silently and retried on the next picker render), take the count from `buildReportView(...).header.counts.dead`, and call `picker.setDemoDead`. Update `test-support/dom-harness.ts` so the picker's snapshot reads are answered from fixtures by default (explicit routes win; a test may make them fail). Change nothing else in the controller. _Requirements: 2.5, 3.8_
- [ ] 5.5 Add sabotage entries (j)-(p) to `test-support/sabotage/tp3.ts` and (ad)-(ae) to `sabotage/tp5.ts` (and the TP7 selector extension for `.demo-card`); register them. Update the assertions that pinned the old home (grep `states.dom.test.ts`, `setup.dom.test.ts`, `smoke.test.ts`, `unknown.dom.test.ts`, `links.dom.test.ts` for "The Graveyard" eyebrow, the old intro sentence, the picker `h1` and `.demo-card` structure), nothing else. Run the whole suite: green.
- [ ] 5.6 Checkpoint after Phase 5: `npm run typecheck` and `npm test` pass (plain and `CI=1`); TP6 PASS with the allowed differences only. Record results, the four dead counts and the decision on reading snapshots in `docs/kiro-log.md`.

### Phase 6: T6 Scan-form label

- [ ] 6.1 Add S-T6 to `checkToePolish` and `toetag.polish.form.dom.test.ts`: the Optional_Ref_Summary is a native `summary` inside the `details`, text unchanged, still `Branch or tag (optional)`, the `details` opens when `ref` has a value, and the form's ids, `for`, `aria-*` and validation behavior equal the reference (TP6 `pickerFacts`). Extend TP7's selector list with `summary` and `.live-form`. _Requirements: 1.6, 2.6, 3.5, 3.7_
- [ ] 6.2 Run S-T6 against the UNCHANGED code: confirm it FAILS (the global `summary` box is not reset; no Field_Label font). The DOM test passes. Append a dated entry "toe-tag-polish T6 fail-first" to `docs/kiro-log.md` BEFORE the fix.
- [ ] 6.3 Fix T6 in `styles/graveyard.css` per design.md change 6 (reset the box, take the Field_Label font, keep the 44px target and the ring, CSS-drawn `+` / `−` marker). No DOM change; do not touch `live-form.ts`. _Requirements: 2.6, 3.5, 3.6_
- [ ] 6.4 Add sabotage entries (af)-(ag) to `test-support/sabotage/tp5.ts`, register them, run the whole suite: green. Properties 4 to 8 (contrast: `--ink-soft` on Paper; focus: ring on `summary`) must pass without a new color pair.
- [ ] 6.5 Checkpoint after Phase 6: `npm run typecheck` and `npm test` pass (plain and `CI=1`); TP6 PASS. Record results in `docs/kiro-log.md`.

### Phase 7: T7 One-up tags and breaks only at Split_Points

- [ ] 7.1 Write Property TP4 in `test-support/properties/tp4.ts` and `toetag.polish.names.dom.test.ts` (design.md TP4: `<wbr>` exactly after "/" and "-", `textContent` unchanged, hostile names stay text, `withSplitPoints` round-trip) and S-T7 in `checkToePolish`. Add the examples: `@saithodev/semantic-release-backmerge`, a name without separators, a hostile name. _Requirements: 1.7, 2.7, 3.2_
- [ ] 7.2 Run TP4 and S-T7 against the UNCHANGED code: confirm they FAIL (no `<wbr>`, 2-column default, `anywhere` on `.tomb-name`). Append a dated entry "toe-tag-polish T7 fail-first" to `docs/kiro-log.md` BEFORE the fix.
- [ ] 7.3 Fix T7: new `views/wrap-points.ts` `withSplitPoints`, use it in `renderTombstone` for `.tomb-name`; `styles/base.css` `.tomb-name` leaves the `anywhere` group and gets `overflow-wrap: break-word`; `styles/graveyard.css` `.grid` default one `minmax(0, 1fr)` column, `repeat(2, ...)` from `min-width: 32.5rem`, remove the `max-width: 22.4375rem` rule. _Requirements: 2.7, 3.2, 3.5_
- [ ] 7.4 Add sabotage entries (q)-(t) to `test-support/sabotage/tp4.ts` and (ah)-(aj) to `sabotage/tp5.ts`; register them. Update the assertions that pinned the old rules (grep `toetag.layout.test.ts`, `tt6.ts`, `polish.css.test.ts`, `css-checks.ts` S7 and `theme/theme.test.ts` for `22.4375`, "2 columns at 375" and `overflow-wrap: anywhere` on `.tomb-name`; the `anywhere` layout-safety check stays satisfied by `.tomb-summary`, `dd` and `.col-signal`), nothing else. Update the Toe_Tag DOM tests that read `.tomb-name` children (text content is unchanged). Run the whole suite: green.
- [ ] 7.5 Checkpoint after Phase 7: `npm run typecheck` and `npm test` pass (plain and `CI=1`); TP6 PASS; Properties 4 to 8 pass. Record results and the judgment call (1-up below 32.5rem, `break-word` last resort) in `docs/kiro-log.md`.

### Phase 8: Documentation and full verification

- [ ] 8.1 Update `.kiro/steering/graveyard-ui.md` per design.md change 8 (narrow grid breakpoints, tag name wrapping, wordmark is the `h1` on the home page, full-width Band, hanging Demo_Cards with the dead count). Presentation rules only; do not touch the tokens table, the BANNED looks or any other steering file.
- [ ] 8.2 Add a pointer section "Polish (bugfix)" to `.kiro/specs/toe-tag-redesign/design.md` linking to `.kiro/specs/toe-tag-polish/` and listing the rules it changes (Band full width, Field_Lines, 1-up below 32.5rem, `<wbr>` Split_Points, home Masthead, Proof for any grade). Do not rewrite the rest. Skip `apps/exorcist-web` README text unless it describes the tag grid or the home page.
- [ ] 8.3 Rebuild: `npm run build -w @graveyard-kit/exorcist-web`; confirm one JS and one CSS asset in `dist/`, the seven woff2 files in `dist/fonts/`, the unchanged CSP meta, and that the built CSS contains `32.5rem`, `.subtitle-phrase` and `.demo-dead`.
- [ ] 8.4 Run `npm run typecheck` across the repo (green) and `npm test` across the repo (green: all workspaces, `numRuns: 100`, no network) with `CI=1` (seed 20261113), plain, and with two random seeds. Record counts and any counterexample in `docs/kiro-log.md`.
- [ ] 8.5 Final check against bugfix.md: each clause 2.1-2.7 and 3.1-3.9 maps to a passing test or to a manual-check line in the log; list every clause that is only manually checked or unverified in `docs/kiro-log.md` (2.2, 2.3, 2.4, 2.5, 2.6, 2.7 depend on layout and are covered by 9.1 only for the visual part). Append the final dated entry "toe-tag-polish done": defects, root causes confirmed or revised, fixes, properties, sabotage results, judgment calls, and what is unverified until 9.1.

### Phase 9: Manual browser check

- [ ] 9.1 Manual browser check (to be run by Claude with a headless Chromium or Chrome through `playwright-core` from the npx cache, as in `docs/review/2026-11-13-toe-tag-check.md`; add no dependency; no browser is available to the test run). Serve the built `dist/` plus the `demo/` snapshots and proofs the same way the earlier check did, and check at 1352x800, 390x844 and 320x700, saving screenshots under `docs/review/2026-11-13-toe-tag-polish-shots/` and writing `docs/review/2026-11-13-toe-tag-polish-check.md` with one line per item as checked, failed or NOT RUN:
  - T1: demo `parse-server`, package `intersect` (ailing, 35): the panel shows a Proof_Section with attempt 1 COUNTEREXAMPLE and attempt 2 PROVED; open it again after reload (report arriving after open); an ailing or alive package of `prettier` or `jest` (no report) has no Proof_Section and no placeholder; `request` or `deep-diff` (dead, dying) still show their proof.
  - T2: every tag's Band runs edge to edge along the bottom inside the border, grade word left in condensed caps, Band_Fact right; compare with `docs/design/toe-tag-mockup-desktop.png`.
  - T3: PACKAGE, SCORE, CAUSE are left-aligned on one edge for a short name, a long name and a scoped name, ruled by Field_Lines, the last one above the Band; the score number is large and left.
  - T4: the subtitle never leaves "LR-1" alone, on the graveyard page and on the home page, at 1352, 390 and 320 (no horizontal scroll at 320).
  - T5: the home page shows the big LAST RITES masthead, the subtitle and the pitch line; the four Demo_Cards hang with string and hole, show "N dead" matching each demo's graveyard header, and the page looks right with the snapshot requests blocked (cards show today's text, no error).
  - T6: "Branch or tag (optional)" reads as a typewriter label like "REPOSITORY", opens and closes with Enter and Space, shows the focus ring on Tab, and its marker changes.
  - T7: at 390 the tags are one column; `@saithodev/semantic-release-backmerge` breaks only after "/" or "-"; at 520px and up the grid is two columns, three from 768, four from 1024; no horizontal scroll at 390 and 320.
  - Regression: no console errors, no cross-origin request, the focus ring on tags and controls, the Sheet_Tag swing still runs once, the mockup comparison for the desktop graveyard.
  If any item fails, record it as a defect with a screenshot and fix it in a new task inside the matching group; do not mark 9.1 done while an item is failed. Record in `docs/kiro-log.md` each item as checked or NOT RUN.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": "wave-1", "tasks": ["1.1", "1.2"] },
    { "id": "wave-2", "tasks": ["1.3"] },
    { "id": "wave-3", "tasks": ["1.4"] },
    { "id": "wave-4", "tasks": ["2.1"] },
    { "id": "wave-5", "tasks": ["2.2"] },
    { "id": "wave-6", "tasks": ["2.3"] },
    { "id": "wave-7", "tasks": ["2.4"] },
    { "id": "wave-8", "tasks": ["2.5", "3.1"] },
    { "id": "wave-9", "tasks": ["3.2"] },
    { "id": "wave-10", "tasks": ["3.3"] },
    { "id": "wave-11", "tasks": ["3.4"] },
    { "id": "wave-12", "tasks": ["3.5", "4.1"] },
    { "id": "wave-13", "tasks": ["4.2"] },
    { "id": "wave-14", "tasks": ["4.3"] },
    { "id": "wave-15", "tasks": ["4.4"] },
    { "id": "wave-16", "tasks": ["4.5", "5.1"] },
    { "id": "wave-17", "tasks": ["5.2"] },
    { "id": "wave-18", "tasks": ["5.3"] },
    { "id": "wave-19", "tasks": ["5.4"] },
    { "id": "wave-20", "tasks": ["5.5"] },
    { "id": "wave-21", "tasks": ["5.6", "6.1"] },
    { "id": "wave-22", "tasks": ["6.2"] },
    { "id": "wave-23", "tasks": ["6.3"] },
    { "id": "wave-24", "tasks": ["6.4"] },
    { "id": "wave-25", "tasks": ["6.5", "7.1"] },
    { "id": "wave-26", "tasks": ["7.2"] },
    { "id": "wave-27", "tasks": ["7.3"] },
    { "id": "wave-28", "tasks": ["7.4"] },
    { "id": "wave-29", "tasks": ["7.5", "8.1", "8.2"] },
    { "id": "wave-30", "tasks": ["8.3"] },
    { "id": "wave-31", "tasks": ["8.4"] },
    { "id": "wave-32", "tasks": ["8.5"] },
    { "id": "wave-33", "tasks": ["9.1"] }
  ],
  "dependencies": {
    "1.3": ["1.1", "1.2"],
    "1.4": ["1.3"],
    "2.1": ["1.4"],
    "2.2": ["2.1"],
    "2.3": ["2.2"],
    "2.4": ["2.3"],
    "2.5": ["2.4"],
    "3.1": ["2.5"],
    "3.2": ["3.1"],
    "3.3": ["3.2"],
    "3.4": ["3.3"],
    "3.5": ["3.4"],
    "4.1": ["3.5"],
    "4.2": ["4.1"],
    "4.3": ["4.2"],
    "4.4": ["4.3"],
    "4.5": ["4.4"],
    "5.1": ["4.5"],
    "5.2": ["5.1"],
    "5.3": ["5.2"],
    "5.4": ["5.3"],
    "5.5": ["5.4"],
    "5.6": ["5.5"],
    "6.1": ["5.6"],
    "6.2": ["6.1"],
    "6.3": ["6.2"],
    "6.4": ["6.3"],
    "6.5": ["6.4"],
    "7.1": ["6.5"],
    "7.2": ["7.1"],
    "7.3": ["7.2"],
    "7.4": ["7.3"],
    "7.5": ["7.4"],
    "8.1": ["7.5"],
    "8.2": ["7.5"],
    "8.3": ["7.5"],
    "8.4": ["8.1", "8.2", "8.3"],
    "8.5": ["8.4"],
    "9.1": ["8.5"]
  }
}
```

## Notes

- Tests never hit the network; fixtures are inline or under `__fixtures__/`, and the demo snapshots and proofs are read from `demo/` by the test. jsdom does no layout, so DOM and CSS-text checks prove the cause is gone, not how a browser draws or wraps it; 9.1 is the only visual evidence and must be reported as checked or NOT RUN.
- Every fail-first task (2.2, 3.2, 4.2, 5.2, 6.2, 7.2) must FAIL on unfixed code and be recorded in `docs/kiro-log.md` before its fix task starts; the baseline (1.3) must PASS. If either is reversed, stop and revisit design.md before touching a view or a stylesheet.
- Per `proof-rules.md`, every new property and static check has sabotage coverage in the same group; a check that cannot fail is rejected.
- Do not change `skeleton/`, `report-view.ts`, the router, the Api_Client, or any score, grade, point or weight text.
- Judgment calls to record in `docs/kiro-log.md`: T2 and T3 share one fix (`align-items: stretch`) and so one group; the 1-up breakpoint (32.5rem) and `break-word` replace two redesign steering rules; the home dead counts are read from the demo snapshots at runtime, not baked in; `skeleton/proofSlotFor` stays dead/dying only and the app composes the ailing/alive slot.
