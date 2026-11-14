# Bugfix Design

## Overview

The Toe Tag redesign renders correct data with seven defects T1-T7 (`docs/review/2026-11-13-toe-tag-visual-check.md`). The fixes are small edits in `app/controller.ts` (`proofFor`, the picker phase), `views/{detail,tombstone,header,picker,live-form}.ts`, one new view helper `views/masthead.ts`, `constants.ts`, the closed `ClassName` vocabulary in `dom/h.ts`, and `styles/{base,graveyard,detail}.css`. Nothing in `skeleton/`, `report-view.ts`, the router, the Api_Client, the scanner or the engine changes, so the data and the Rendered_Facts cannot change. The steering file `.kiro/steering/graveyard-ui.md` is updated where the fix changes a rule it states (narrow grid, name wrapping, wordmark element).

The design source is `docs/design/toe-tag.md`, the mockup `docs/design/toe-tag-mockup-desktop.png` (full-width colored band with the grade word left and one fact right; every field left-aligned on ruled lines; hanging tags with string and punched hole; the examiner subtitle on one line), `.kiro/steering/graveyard-ui.md` and `.kiro/specs/toe-tag-redesign/`.

Tests run in jsdom/Node with no browser. Three kinds of check are used, all runnable there:

1. **DOM checks** on pages mounted by `mountPage` (Proof_Section by grade, subtitle structure, home Masthead, hanging Demo_Cards and their dead counts, `<wbr>` Split_Points).
2. **Static CSS checks** on the Stylesheet text through `checkToePolish(css)` (new, in `test-support/css-checks.ts`), using the declaration parser `theme/css-parse.ts` (groups S-T2 to S-T7).
3. **Preservation** against the frozen `views-v3` copy of today's views and `toeFacts`.

jsdom computes no layout, so these checks prove the cause is removed (the rule or element that produced the defect is gone and the intended rule is present), not how a browser draws or wraps anything. The manual browser check (task 9.1) covers the rest and is reported separately.

## Bug Details

### Bug Condition

Let X be a rendered page (home, or a Scan_Report mounted as the report Screen with the Detail_Panel open on one package), the demo Proof_Report served for that package (if any), and the Stylesheet.

```
FUNCTION isBugCondition(X)                       // C(X)
  RETURN C1(X) OR C2(X) OR C3(X) OR C4(X) OR C5(X) OR C6(X) OR C7(X)

C1 (T1) := X.source is demo AND X.package.grade IN {ailing, alive}
           AND a valid Proof_Report exists for X.package
           AND NOT proofRequested(X.package)  OR  Proof_Section absent after the report settled
C2 (T2) := Stylesheet gives .tombstone no explicit align-items (so the global `button` rule's
           align-items:center applies) OR .tag-band is not a full-width flex row
           (grade word first, Band_Fact last, justify-content space-between)
C3 (T3) := C2's align-items cause
           OR some .tag-field is not closed by a Field_Line (border-bottom 1px Ink)
           OR a tag rule centers text (text-align:center / margin-inline:auto on a field or score)
C4 (T4) := Form_Subtitle is one text node (no Subtitle_Phrase wrapper) OR Stylesheet has no
           white-space:nowrap on .subtitle-phrase
C5 (T5) := home DOM has p.meta eyebrow OR the h1 is not the wordmark
           OR no .form-subtitle OR Pitch_Line text differs
           OR EXISTS demo-card without .tag-hole (not hung) OR li without string rule
           OR a demo snapshot with Dead_Count n is read AND card text lacks "n dead"
C6 (T6) := Optional_Ref_Summary resolves to the global `summary` box (border/background/radius)
           i.e. no `.live-form details > summary` rule resets border and background
           and sets font-family var(--font-label)
C7 (T7) := Stylesheet makes the tag grid 2-up below 32.5rem
           OR .tomb-name has overflow-wrap:anywhere
           OR EXISTS tombstone whose .tomb-name has no <wbr> after a "/" or "-" in its text
```

C2, C3 (part), C4 (part), C6 and C7 (part) are Stylesheet predicates; C1, C4 (part), C5 and C7 (part) are DOM predicates.

### Expected Behavior Property

```
FOR ALL X WHERE isBugCondition(X) DO
  X' := render'(X)                               // after the fix
  ASSERT NOT C(X')
  ASSERT for a valid report and any grade: Proof_Section present, facts equal the proof view of the report
  ASSERT for no readable report and grade IN {ailing, alive}: no section.proof at all
  ASSERT subtitle textContent = FORM_SUBTITLE AND "Form LR-1" is inside one nowrap Subtitle_Phrase
  ASSERT home: one h1 "Last Rites" (tabindex -1, class wordmark), p.form-subtitle, p.pitch = Pitch_Line, no p.meta
  ASSERT each demo-card has span.tag-hole, and "N dead" iff its snapshot was read, N = recount by grade
  ASSERT tomb-name has <wbr> exactly after each "/" and "-" of its text and its textContent is unchanged
  ASSERT Stylesheet has the band, field, subtitle, summary and grid rules of bugfix.md 2.2-2.7
END FOR
```

### Preservation Goal

```
FOR ALL X WHERE the observed aspect is data (not presentation, not the T1 and T5 additions) DO
  ASSERT toeFacts(render'(X)) deep-equals toeFacts(renderV3(X))
END FOR
```

`renderV3` is the Reference_Renderer (frozen copy of today's `tombstone`, `header`, `breakdown`, `proof-slot`, `picker`). The T1 and T5 additions are the only allowed differences: the Proof_Section of an ailing or alive package with a valid report, and the home page texts and dead counts.

### Hypothesized Root Cause

Verified by reading the source on 2026-11-13 unless marked otherwise:

1. **T1.** `controller.ts` `proofFor` returns `undefined` unless `grade` is `dead` or `dying`, so `getProof` is never called for `intersect`. Even if it were, `detail.ts` `renderContent` builds the slot from `proofSlotFor(grave)` (skeleton: dead and dying only) and `updateProof` returns when there is no slot or no `section.proof`. So the controller gate and the detail slot gate both hide the report; fixing only the first would still show nothing.
2. **T2 and T3 (one root cause, two symptoms).** `base.css` gives every `button` `display: inline-flex; align-items: center; justify-content: center`. `.tombstone` (`graveyard.css`) sets `display: flex; flex-direction: column; align-content: start` and never sets `align-items`, so in the column direction `center` centers each child on the cross axis and shrinks it to its content: the Band becomes a small chip (T2), short names and the SCORE block are centered, while a name or cause wider than the tag fills the line and so looks left-aligned (T3). **Confirmed only by reading the cascade;** task 3.2 checks it in a browser if one is available. The Field_Lines are drawn by `.tag-field + .tag-field { border-top }`, so there is no line between the last field and the Band and none under the first field's value (T3).
3. **T4.** `header.ts` writes `p.form-subtitle` as one text node (`FORM_SUBTITLE`); a browser wraps it at any space, and at 1352px the right column (`minmax(0, auto)` meta line) leaves the subtitle area narrow enough that "LR-1" falls to a second line (mobile: the line is wider than 358px).
4. **T5.** `views/picker.ts` renders `header.header > p.meta (SCREEN_NAME) + h1 (PRODUCT_NAME, 20px) + p (intro)`; it does not use the Masthead of `header.ts`. `.demo-card` is drawn with one chamfer and has no hole, and `.demo-cards > li` has no string rule (only `.grid > li` hangs). The picker is rendered before any report is read, so it has no counts.
5. **T6.** `live-form.ts` writes the optional ref as `details > summary "Branch or tag (optional)"`. `base.css` styles every `summary` as a bordered Paper control (`border: var(--rule) solid var(--ink)`, `background: var(--paper)`, radius, flex), and `.live-form details > summary` only sets `min-height`. Next to `.field > label` (typewriter caption, no box) it reads as a broken input.
6. **T7.** `.grid` is `repeat(2, ...)` from the start and becomes one column only at `max-width: 22.4375rem` (359px); `.tomb-name` has `overflow-wrap: anywhere` (base.css), so a browser may break at any character before it prefers a "/" or "-" and "@saithodev/sem|antic-release-backmerge" splits inside "semantic". **Not established by reading:** whether the review's four-line wrap also comes from the 163px column width alone; the 1-up grid changes the width to 343px, task 9.1 checks the 47-character scoped name in a browser.

Tasks 1.x and each group's fail-first run turn these into evidence: the new tests must fail on the unfixed code for the reasons named here; if a failure points elsewhere, this section is revised before the fix.

## Fix Implementation

### Changes

1. **T1: `app/controller.ts`.** `proofFor` keeps its guard `source.kind !== "demo"` and the `isProofName` checks and drops the grade test. The request code (the `proofsStarted` / `proofsSettled` maps, the abort controller, the retry on a thrown error) is unchanged and runs for any grade. What it returns depends on the grade:
   - dead or dying: exactly as today (settled value, else `{ state: { status: "loading" } }`);
   - ailing or alive: the settled value only when its state is `report`; otherwise `undefined` (no loading placeholder, so the panel does not flash a section and then remove it).
   The `.then` handler calls `detail?.updateProof(grave.key, shown)` for every grade (unchanged call).
2. **T1: `views/detail.ts`.** `renderContent` builds `slot` as: `baseSlot` with `proof.state` when both exist (today's rule); else, when `baseSlot` is undefined and `proof?.state.status === "report"`, `{ package: dep.name, state: proof.state }`; else `baseSlot`. `updateProof` computes the slot the same way; when `section.proof` is missing and the slot exists (the report arrived after the panel opened for an ailing or alive package), it appends `renderProofSlot(slot, id)` as the last child of the panel; when the section exists it replaces its content as today. `skeleton/src/graveyard/proof-slot.ts` (`proofSlotFor`: dead and dying only) is NOT changed; its tests keep pinning that the placeholder is for dead and dying.
3. **T2, T3: `styles/graveyard.css`.**
   - `.tombstone { align-items: stretch; }` (explicit, next to `flex-direction: column`). This removes the cause of both symptoms.
   - `.tag-band`: `align-self: stretch; margin: 0;` kept `display: flex; justify-content: space-between`; the Band is the last block, flush with the bottom of the Manila layer (the Toe_Tag padding is `var(--rule)` on the sides and bottom, so the Band runs edge to edge inside the border).
   - `.tag-field`: `margin-inline: var(--space-3); padding: var(--space-2) 0; border-bottom: var(--rule-thin) solid var(--ink);` replacing the sibling rule `.tag-field + .tag-field { border-top }`. Every field is closed by a Field_Line, inset from the tag edge like the mockup; the last Field_Line sits directly above the Band.
   - `.tombstone, .tag-field, .tomb-score { text-align: left; }`. No tag rule uses `text-align: center` or `margin-inline: auto`.
   DOM unchanged (the Band already has the grade word first and the Band_Fact last).
4. **T4: `constants.ts`, `views/masthead.ts`, `views/header.ts`, `dom/h.ts`, `styles/graveyard.css`.**
   - `constants.ts`: `FORM_SUBTITLE_PARTS = ["Office of the Dependency Examiner ·", "Form LR-1"] as const` and `FORM_SUBTITLE = FORM_SUBTITLE_PARTS.join(" ")`. The string value is unchanged ("Office of the Dependency Examiner · Form LR-1"); the middle dot stays with the first phrase so a break never starts a line with a dot.
   - `views/masthead.ts` (new): `renderFormSubtitle(): HTMLElement` returns `p.form-subtitle > span.subtitle-phrase + " " + span.subtitle-phrase`, `textContent === FORM_SUBTITLE`.
   - `ClassName`: add `subtitle-phrase`, `pitch`, `demo-dead`.
   - CSS: `.subtitle-phrase { white-space: nowrap; }`, and `@media (max-width: 22.4375rem) { .subtitle-phrase:first-child { white-space: normal; } }` (first phrase may wrap at its spaces below 360px so there is no horizontal scroll; "Form LR-1" never wraps). The subtitle in the 40rem masthead grid gets `min-width: 0`.
5. **T5: `views/picker.ts`, `views/masthead.ts`, `app/controller.ts`, `styles/graveyard.css`.**
   - Picker header: `header.header > div.masthead > [h1.wordmark[tabindex=-1] "Last Rites" (PRODUCT_NAME), renderFormSubtitle()]`, then `p.pitch` with `PITCH_LINE` (new constant in `constants.ts`). The `p.meta` eyebrow and the old intro sentence are removed. The wordmark is the `h1` on the home page (so there is exactly one `h1`, no duplicated "Last Rites" for screen readers); on the loading and error screens it stays a `p`. CSS: `.masthead h1.wordmark { text-align: left; }` so it does not inherit the right-aligned graveyard `h1` rule.
   - Demo_Card DOM: `li > button.btn.demo-card` gains a first child `span.tag-hole[aria-hidden]`; everything else stays (name, repo, blurb, snapshot line, `data-demo`, click). `PickerHandle` gains `setDemoDead(name: string, dead: number): void`, which appends or updates `span.demo-dead` ("N dead", last child of the card) and does nothing for an unknown name.
   - Counts: after the picker phase mounts, the controller reads the four snapshots with `deps.api.getDemo(name, signal)` (same endpoint and static fallback as opening a demo), one request per demo not yet settled, with an `AbortController` aborted in `teardownScreen`. On success it takes `buildReportView(result.report, "demo").header.counts.dead` (the header's recount by `death.grade`), stores the number in a session map (`demoDead`, so a return to the picker paints at once and does not refetch), and calls `picker.setDemoDead`. A failed, cancelled or unreadable read is ignored silently (no error, no notice, the card keeps today's text); a failed demo is retried on the next picker render. Counts are computed from `death.grade` of the dependencies (the same recount the header uses), not from `report.summary`.
   - CSS: `.grid > li, .demo-cards > li { position: relative; padding-top: var(--string-height); }` with the shared string `::before`; `.demo-card` uses the two-sided chamfer polygon of the Toe_Tag (copied, not tokenized), top padding clears the hole; `.demo-dead` in the display font, uppercase, `--track-band`, `--ink`, with a `var(--rule-thin)` Ink rule above it. Hover shadow, focus ring (button unclipped) and the 2-column / 4-column layout stay.
   - Decision: the counts are read from the snapshots (4 small requests, one-time per session) rather than baked into `demo-repos.ts` (would drift from a re-snapshot, which the file comment already warns against) or into a new index file (new build step). If it proves wrong in review, only `controller.ts` and `picker.ts` change.
6. **T6: `styles/graveyard.css`.** `.live-form details > summary` resets `background: none; border: 0; border-radius: 0; padding: 0;` and takes the Field_Label font rules (`font-family: var(--font-label); font-size: var(--size-label); letter-spacing: var(--track-label); text-transform: uppercase; font-weight: 400; color: var(--ink-soft)`), keeps `min-height: var(--target)` and `cursor: pointer`, and draws the marker with `::before { content: "+"; }` / `details[open] > summary::before { content: "−"; }` (a CSS character, not report text). The global `:focus-visible` ring applies. No DOM change.
7. **T7: `views/tombstone.ts`, `views/wrap-points.ts`, `styles/graveyard.css`, `styles/base.css`.**
   - `views/wrap-points.ts` (new): `withSplitPoints(text: string): Array<string | HTMLElement>` splits `text` after every "/" and "-" and inserts `h("wbr")` between the pieces. It never changes the text; `renderTombstone` writes `h("span", { class: "tomb-name" }, withSplitPoints(cutText(name)))`.
   - `base.css`: `.tomb-name` leaves the `overflow-wrap: anywhere` group and gets `overflow-wrap: break-word` (last resort for a segment wider than the tag). `.tomb-summary` and `dd` keep `anywhere`.
   - `graveyard.css`: `.grid` is `minmax(0, 1fr)` (1 column) by default, `repeat(2, ...)` from `min-width: 32.5rem`, 3 from `48rem`, 4 from `64rem`; the `max-width: 22.4375rem` rule is removed.
   - Judgment call (recorded in the log and the steering file): the redesign steering says "2-column tag grid at 375 (1 column below 22.5rem)" and `.tomb-name` `overflow-wrap: anywhere`; the visual check shows both produce mid-word breaks at 390px, so the steering is updated to 1-up below 520px and `break-word` after Split_Points.
8. **Steering (`.kiro/steering/graveyard-ui.md`).** Narrow rules: "1 column below 32.5rem, 2 from 32.5rem, 3 from 48rem, 4 from 64rem"; type scale: tag name `overflow-wrap: break-word` after Split_Points; wordmark: "a `p`, except the `h1` on the home page"; Band: "full width, edge to edge"; add "Demo cards hang like tags (string, hole) and show the dead count when known". Presentation text only.
9. **Tests**: new tests listed under Testing Strategy; `Reference_Renderer` under `src/__reference__/views-v3/` (header comment: FROZEN, test-only, never imported by production code or `main.ts`).

### Why the existing properties and tests still hold

- **Data.** No change touches `report-view.ts`, the router, the Api_Client, `buildBreakdown` or the engine. The views print the same fields as before; `<wbr>` and the subtitle spans add no text; the home counts are an addition read from the same snapshots.
- **Accessible names.** `aria-label`, `aria-describedby`, `title` of the Toe_Tag do not depend on the name's DOM; `toeFacts` reads `.tomb-name` `textContent` (unchanged with `<wbr>`). The grade word is still the single `.tomb-grade` leaf.
- **Proof.** For dead and dying packages `proofFor` and `renderContent` take the same branches as before. For ailing and alive the section appears only with a valid report, so panels without a report are byte-identical.
- **Focus and layout safety.** `.focus()` calls are untouched; the Toe_Tag, Demo_Card and `summary` stay unclipped; `min-width: 0` on grid children stays; the new 1-up grid cannot add horizontal scroll; `.tomb-name` keeps a last-resort `break-word`.
- **Guards.** Properties 4 to 8 of `toe-tag-redesign` read the Stylesheet; the changes add no color literal, no motion and no `overflow` on focusable elements. The tests that pin the changed rules (2-column at 375, `anywhere` on `.tomb-name`) are updated in the group that changes them.

## Correctness Properties

All run with fast-check `numRuns: 100`, the Fast_Check_Runner seed policy from `@last-rites/skeleton/graveyard/testing` (`FC_SEED` wins, `CI` fixes seed 20261113, otherwise random and recorded on failure), via `assertProperty` / `checkAsyncProperty`. Each has sabotage variants per `proof-rules.md`; the property builders live in `src/test-support/properties/tp1.ts` to `tp7.ts` and export `build(impl)`, the wrong implementations in `src/test-support/sabotage/tp1.ts` to `tp7.ts`. Properties 1 to 8 (`tt1` to `tt8`) and the polish properties (`p9`, `p10`) already exist in this app and stay.

New generators (`test-support/arbitraries.ts`):
- `demoPackageArb`: a Scan_Report built with `scanReportArb` constrained to include at least one package of each requested grade, and an index of the package to open.
- `proofLoadArb`: one of `valid` (a `proofReportArb` report), `absent` (404), `failed` (network error / 5xx), `invalid` (unparseable body), together with an `order` flag (`before` or `after` the panel opened).
- `packageNameArb`: scoped, hyphenated, slashed, 1 to 80 characters, with 47-character scoped names, names without any "/" or "-", hostile strings (`<img src=x onerror=...>`) and leading/trailing "-" or "/".
- `snapshotSetArb`: for the four demos, each of `ok(report)`, `failed`, `invalid`, plus a permutation of response order.

`toeFacts` (existing) is extended in task 1.2 with `proofPresent: boolean` for the open panel and a `picker` reader (`pickerFacts(root)`: per card `data-demo`, name, repo, blurb, snapshot line, dead text or null; form field ids and labels). It reads Fact_Hooks and text only.

### Property TP1: Fix checking, Proof for any grade (T1)

**Validates: Requirements 2.1, 3.3, 3.4**

- Arbitrary: `demoPackageArb` (grade drawn from all four) x `proofLoadArb`. Mount the demo, open the package, serve the proof from the fake fetch (`GET` of the proof route), settle it before or after the open as the arbitrary says.
- Assert the proof request was made exactly once per package for a demo source, and never for a live source.
- Assert for `valid`, any grade: `section.proof` exists in the panel and its facts deep-equal the facts computed from the report through the skeleton's proof view (badge label, runs and seed, sabotage line, call sites, per-attempt fields, counterexample input/old/new byte for byte; reuse `expectedProofFacts` of `tt2`).
- Assert for `absent`, `failed`, `invalid`, grade ailing or alive: no `section.proof` and no "Exorcism coming" / "Loading proof" text; grade dead or dying: the same facts as the Reference_Renderer (placeholder, plus the unreadable line for `invalid`).
- Assert that while the request is pending an ailing or alive panel has no `section.proof`, and a dead or dying panel shows the loading line.
- Assert the `.sheet-tag` node is the same before and after the report arrives (only the Proof_Section changed).
- Example: the demo `parse-server`, package `intersect`: Proof_Section shows attempt 1 COUNTEREXAMPLE and attempt 2 PROVED, from the file under `demo/proofs/parse-server/intersect.json`.

### Property TP2: Fix checking, Subtitle (T4)

**Validates: Requirements 2.4, 3.2**

- Arbitrary: `scanReportArb` (the graveyard page) and the picker (home).
- Assert on both pages: `p.form-subtitle` `textContent === FORM_SUBTITLE`; it has exactly two `span.subtitle-phrase` children whose texts are `FORM_SUBTITLE_PARTS`; the last one's text is exactly "Form LR-1" and contains no element; the first ends with " ·".
- Assert (static, S-T4) `.subtitle-phrase` has `white-space: nowrap` and the only rule that turns it off is `.subtitle-phrase:first-child` inside `(max-width: 22.4375rem)`.
- Constant example: `FORM_SUBTITLE === "Office of the Dependency Examiner · Form LR-1"`.

### Property TP3: Fix checking, Home Masthead and hanging Demo_Cards (T5)

**Validates: Requirements 2.5, 3.7**

- Arbitrary: `snapshotSetArb` (each demo ok with a generated report, failed, or invalid; response order permuted), repeated visits to the picker (the session map).
- Assert the home page has exactly one `h1`, text "Last Rites", `tabindex="-1"`, class `wordmark`, inside `div.masthead`; it has `p.form-subtitle` (TP2 structure), `p.pitch` with text `PITCH_LINE`, no `p.meta` and no element with the text "The Graveyard" or the old intro sentence; `document.activeElement` is the `h1` after mount.
- Assert each Demo_Card: `li > button.demo-card[data-demo]` in `DEMO_REPOS` order, first child `span.tag-hole[aria-hidden]`, the name, repo, blurb and snapshot line unchanged, click still navigates.
- Assert for each demo with `ok(report)`: the card's last child is `span.demo-dead` with text `${n} dead`, `n` = recount of `death.grade === "dead"` over the report's dependencies; for `failed` or `invalid` there is no `.demo-dead`, no `[role=alert]`, no `.error`, no `.notice` added by the counts; leaving the picker before a response arrives paints nothing and aborts the requests (no unhandled rejection).
- Assert the Live_Scan_Form facts (ids, labels, hints) equal the Reference_Renderer's.

### Property TP4: Fix checking, Split_Points (T7)

**Validates: Requirements 2.7, 3.2**

- Arbitrary: `packageNameArb`, rendered as a Toe_Tag through `renderTombstone`.
- Assert `.tomb-name` `textContent === cutText(name)`; its children are only text nodes and `wbr` elements; a `wbr` follows each "/" and "-" of the cut text that has a character after it, and no other position has one; names without "/" or "-" have no `wbr`; no element other than `wbr` is created from the name (hostile names stay text); the Toe_Tag `aria-label`, `title` and `data-key` are unchanged.
- Assert `withSplitPoints(text)` joined back (text nodes only) equals `text`, for any string.

### Property TP5: Fix checking, Stylesheet (T2, T3, T4, T6, T7)

Not random, so it is an example-based check function `checkToePolish(css): Violation[]` (in `test-support/css-checks.ts`), run on the real Stylesheet (expects `[]`) and on mutated copies (each expects a non-empty list). It uses `theme/css-parse.ts`.

Checks (each maps to a clause):
- S-T2 band (2.2): `.tombstone` declares `align-items: stretch` (or `normal`) and no rule of `.tombstone`, `.tag-band` or `.tag-field` sets `align-items`/`align-self`/`justify-self` to `center`; `.tag-band` is `display: flex` with `justify-content: space-between`, `align-self: stretch` and no `margin-inline`, `max-width` or `width` below 100%; `.tomb-grade` is `--font-display`, uppercase; per-grade `--band-color` rules unchanged.
- S-T3 fields (2.3): `.tag-field` has `border-bottom: var(--rule-thin) solid var(--ink)`; no `.tag-field + .tag-field` rule; `.tombstone`, `.tag-field` and `.tomb-score` have `text-align: left`; no `text-align: center` and no `margin-inline: auto` in any `.tombstone`, `.tag-*` or `.tomb-*` rule.
- S-T4 subtitle (2.4): see TP2.
- S-T5 hang (2.5): `.demo-cards > li` has `position: relative` and `padding-top` using `--string-height`, with a `::before` string rule (`width: var(--rule)`, Ink); `.demo-card` has the two-sided `clip-path` only on `::before`/`::after`; `.demo-card` has no `clip-path` or `overflow` itself.
- S-T6 summary (2.6): `.live-form details > summary` sets `border: 0|none`, `background: none|transparent`, `font-family: var(--font-label)`, `text-transform: uppercase`, `min-height: var(--target)`; it has `::before` content for both states.
- S-T7 grid and names (2.7): `.grid` default has one `minmax(0, 1fr)` track; `repeat(2, ...)` appears only inside `(min-width: 32.5rem)`; `repeat(3, ...)` inside `(min-width: 48rem)`, `repeat(4, ...)` inside `(min-width: 64rem)`; no `max-width: 22.4375rem` rule on `.grid`; `.tomb-name` has `overflow-wrap: break-word` and no rule gives `.tomb-name` `anywhere` or `word-break: break-all`.
- S-keep (3.5, 3.6): the existing guards run unchanged (Properties 4 to 8, `theme.test.ts`, S1 to S7 of the polish check).

### Property TP6: Preservation checking

**Validates: Requirements 3.1, 3.2, 3.3, 3.8**

- Arbitrary: `scanReportArb` x `openPackageArb` (scan side), `proofLoadArb` for the open package (proof side).
- Assert `toeFacts(fixed) deep-equals toeFacts(reference)` for the whole report page (header, groups, tags, open Breakdown, skipped list) and equals `expectedFacts(report, openName)` from `tt1`.
- Assert the proof facts of a dead or dying package equal the Reference_Renderer's for every `proofLoadArb` state; for an ailing or alive package with no valid report there is no `section.proof` in either renderer; with a valid report the only difference is the added `section.proof` (the rest of the panel facts are equal).
- Assert `pickerFacts` equal the reference except for the allowed set: the removed eyebrow and intro, the added pitch, the added `.demo-dead` text.
- Baseline: run against the unfixed code first (expected PASS: reference and current are the same code), then after each group (still PASS).

### Property TP7: Fix checking and preservation, no horizontal growth and focus (T5, T6, T7)

**Validates: Requirements 3.5**

Static, over the Stylesheet: no `clip-path`, `mask` or `overflow: hidden|clip` on `.demo-card`, `.demo-cards`, `.demo-cards > li`, `summary`, `.live-form`; every focusable control keeps the `:focus-visible` ring; `.grid`, `.demo-cards` children keep `min-width: 0`. This reuses Property 8 of `toe-tag-redesign` (focus) and extends its selector list with `.demo-card` and `summary`; sabotage: add `overflow: hidden` to `.demo-cards > li` must be caught.

### Sabotage harness

`toetag.sabotage.test.ts` (existing) gains the entries below under the new property names; each must be caught by at least one property or by `checkToePolish` at seed 20261113, every CSS mutation must really change the text (assert the mutated string differs), and the real implementation passes under the same seed.

DOM sabotages:
- (a) T1: the controller still gates on `dead`/`dying` (TP1); (b) the controller requests the proof but `detail.updateProof` ignores a missing section (TP1, report arrives after open); (c) `renderContent` ignores the proof for ailing/alive (TP1, report arrives before open); (d) the placeholder "Exorcism coming" is shown for an ailing package without a report (TP1/TP6); (e) a "Loading proof…" section is shown for ailing while pending (TP1); (f) the proof is requested for a live source (TP1);
- (g) the subtitle is one text node (TP2); (h) "Form LR-1" is split across two phrase spans (TP2); (i) the subtitle text changes ("Form LR1") (TP2);
- (j) the home page keeps the `p.meta` eyebrow (TP3); (k) the h1 is not the wordmark, or a second "Last Rites" `p` is added (TP3); (l) the Pitch_Line is the old sentence (TP3); (m) a Demo_Card has no `.tag-hole` (TP3); (n) the dead count counts `dying` as dead, or reads `report.summary.dead` instead of recounting (TP3); (o) a failed snapshot shows "0 dead" or an error notice (TP3); (p) the picker still paints counts after the user left (TP3);
- (q) `<wbr>` after every character (TP4); (r) no `<wbr>` after "-" (TP4); (s) the name is written through a template that changes the text (for example inserts a zero-width space) (TP4); (t) the name is cut after the `wbr` pass so `textContent` differs (TP4);
- (u) the fix drops a Breakdown row, changes the cause text, or shows `toGrade(score)` instead of `death.grade` on the Band (TP6).

CSS sabotages: string mutations of the real Stylesheet, applied before `checkToePolish`:
- (v) delete `align-items: stretch` from `.tombstone` (S-T2); (w) add `align-self: center` to `.tag-band` (S-T2); (x) set `.tag-band` `margin-inline` to `var(--space-3)` (S-T2); (y) delete the `.tag-field` `border-bottom` (S-T3); (z) re-add `.tag-field + .tag-field { border-top }` only (S-T3); (aa) add `text-align: center` to `.tomb-score` (S-T3);
- (ab) delete `white-space: nowrap` from `.subtitle-phrase` (S-T4); (ac) make the `.subtitle-phrase:first-child` normal rule unconditional (S-T4);
- (ad) delete the `.demo-cards > li` `padding-top` or string `::before` (S-T5); (ae) add `overflow: hidden` to `.demo-cards > li` (S-T5, TP7);
- (af) delete the `border: 0` reset of the Optional_Ref_Summary (S-T6); (ag) set its `font-family` to `var(--font-body)` (S-T6);
- (ah) restore `repeat(2, ...)` as the default `.grid` columns (S-T7); (ai) move the 2-column rule to `min-width: 22.5rem` (S-T7); (aj) restore `overflow-wrap: anywhere` on `.tomb-name` (S-T7).

## Testing Strategy

- **Exploratory (before each fix):** each group writes its fix-check tests first and runs them against the unfixed code; they must FAIL, one named violation per defect, for the reasons in "Hypothesized Root Cause" (T1: no request and no section for `intersect`; T2: `.tombstone` has no `align-items`; T3: no Field_Line and the same cause; T4: one text node; T5: eyebrow present, no hole, no count; T6: `summary` takes the global box; T7: 2-up and `anywhere`). The failing assertion names and the seed are appended to `docs/kiro-log.md` BEFORE the fix, in a dated entry per group ("toe-tag-polish Tn fail-first"). If a test passes on unfixed code, or fails for another reason, stop and revise this design before touching a view or a stylesheet.
- **Suite stays green between groups:** the fail-first run is local to the group; the group lands only when its tests, its sabotage entries, the updated old assertions and the full suite (`npm test`, `npm run typecheck`) are green together. No group leaves a failing or skipped test behind.
- **Preservation baseline:** freeze the Reference_Renderer (`views-v3`), extend `toeFacts` and write TP6 first; run on the unfixed code (PASS) and again at the end of every group.
- **Fix checking:** TP1 to TP5 on the fixed code, `numRuns: 100`.
- **Example tests:** `parse-server` / `intersect` proof panel; the four demo snapshots' dead counts recomputed from `demo/*.json` (no hard-coded numbers); the 47-character scoped name `@saithodev/semantic-release-backmerge` (split points after "@saithodev/", "semantic-", "release-"); a name without separators; a hostile name; the 320px subtitle (first phrase wraps, "Form LR-1" does not).
- **Existing tests:** update the assertions that pinned a defect, nothing else, in the group that changes the rule: grade-gated proof (`proof.controller.dom.test.ts`, `proof.update.dom.test.ts` if they open ailing or alive packages), the 2-column grid and the `anywhere` rule (`toetag.layout.test.ts`, `tt6.ts`, `theme/theme.test.ts` if they pin them), the old home texts (`states.dom.test.ts`, `setup.dom.test.ts`, `smoke.test.ts`), the Demo_Card DOM, and the fake-fetch default for the proof route (opening an ailing or alive demo package now requests its proof; the harness answers 404 for an unregistered proof route so existing tests do not fail on an unexpected fetch).
- **Integration:** `npm run typecheck` and `npm test` green across the repo; `npm run build -w @last-rites/exorcist-web` succeeds.
- **Not covered by automation (reported, not claimed):** how the Band fills the tag and how fields align in a browser (T2, T3), the real wrap of the subtitle at 1352px, 390px and 320px (T4), the look of the hanging Demo_Cards and the home Masthead height (T5), the Optional_Ref_Summary next to the REPOSITORY label (T6), the wrap of the 47-character name in a 343px tag (T7), and the late-arriving Proof_Section on `intersect` (T1). These are checked by hand (task 9.1) with the same viewports as the review, or reported as unverified.
- Tests never touch the network; fixtures are inline or under `__fixtures__/`; the demo snapshots and proofs come from `demo/` read by the test, not fetched.
