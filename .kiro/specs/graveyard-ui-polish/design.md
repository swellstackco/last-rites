# Bugfix Design

## Overview

The Graveyard_Page renders correct data with seven presentation defects (D1-D7, `docs/review/2026-11-13-ui-visual-check.md`). The fixes are small edits in `apps/exorcist-web/src/views/{tombstone,breakdown}.ts`, the closed `ClassName` vocabulary in `dom/h.ts`, and the four stylesheets. Nothing in `skeleton/`, `report-view.ts`, the controller, the router or the API changes, so the data and the Rendered_Facts cannot change.

Tests run in jsdom/Node with no browser. Two kinds of check are used, both runnable there:

1. **DOM structure checks** on pages mounted by `mountPage` (one Grade_Label, bullet-less Layout_Lists, calibration source text, one Total_Row without empty cells, headings still focused).
2. **Static CSS checks** on the Stylesheet text (container, gutters, list reset, arch rules, word-break rules, `:focus:not(:focus-visible)`), using the declaration parser that `theme/theme.test.ts` already has (moved to a shared helper in task 2.2).

jsdom computes no layout, so neither check proves how a browser draws or breaks anything. They prove the cause is removed (the rule or element that produced the defect is gone and the intended rule is present). A manual browser check (task 6.4) covers the rest and is reported separately.

## Bug Details

### Bug Condition

Let X be a rendered page (a Scan_Report mounted as the report Screen, the Detail_Panel open on one package) together with the Stylesheet. The defect predicates, one per defect:

```
FUNCTION isBugCondition(X)                       // C(X)
  RETURN C1(X) OR C2(X) OR C3(X) OR C4(X) OR C5(X) OR C6(X) OR C7(X)

C1 (D1)  := NOT hasContentColumn(Stylesheet)
            // no rule on .screen with margin-inline auto, max-width in [960px, 1280px],
            // padding-inline >= 16px; or .app still declares its own max-width
C2 (D2)  := EXISTS ul in rendered DOM with class in {counts, grid*, demo-cards}
            WHERE NOT stylesheetResetsList(ul.class)       // list-style: none AND padding 0
C3a (D3) := EXISTS tombstone WHERE count(visibleGradeLabels(tombstone)) <> 1
C3b (D3) := Stylesheet has a background-image/linear-gradient on .tombstone-dead
            OR .tombstone-dead/.tombstone-dying outline is border-top only
            OR some ancestor rule (.grid, .group, .screen, .app) sets overflow hidden|clip
C4 (D4)  := Stylesheet has overflow-wrap: anywhere | word-break: break-all on bare td/th
            OR a Short_Cell/Source_Cell selector lacks overflow-wrap: normal
C5 (D5)  := EXISTS calibration row WHERE its Source_Cell text = "No source recorded"
C6 (D6)  := count(tfoot tr.total) <> 1 OR EXISTS empty td/th in tfoot tr.total
            OR (stacked CSS gives a border-top to each tfoot cell instead of the row)
C7 (D7)  := Stylesheet lacks a ':focus:not(:focus-visible)' rule with outline: none
```

C1, C3b, C4 and part of C6 and C7 are Stylesheet predicates; C2 (DOM class plus Stylesheet), C3a, C5 and C6 are DOM predicates.

### Expected Behavior Property

```
FOR ALL X WHERE isBugCondition(X) DO
  X' := render'(X)                               // after the fix
  ASSERT NOT C(X')
  ASSERT each tombstone has exactly one visible Grade_Label, equal to GRADE_INFO[grade].label
  ASSERT each calibration row Source_Cell text = "Engine rule: " + death.calibration.rule
  ASSERT tfoot has exactly one tr.total, no empty cell in it, and its text contains "{score} / 100"
  ASSERT every Layout_List ul is bullet-less in the Stylesheet; prose ul keep their bullets
  ASSERT Stylesheet has the container, gutter, arch, word-break and focus rules listed in bugfix.md 2.1-2.8
END FOR
```

### Preservation Goal

```
FOR ALL X WHERE NOT isBugCondition(X) OR the observed aspect is data (not presentation) DO
  ASSERT renderedFacts(render'(X)) deep-equals renderedFacts(renderV1(X))
END FOR
```

`renderedFacts` is defined below. `renderV1` is the Reference_Renderer. In practice every Scan_Report is a bug-condition input (the defects are structural), so preservation is stated on the facts, not on the whole DOM.

### Hypothesized Root Cause

Verified by reading the source on 2026-11-13 unless marked otherwise:

1. **D1.** `controller.ts` builds `div.screen > div.picker.stack` (home), `div.status.stack` (loading/error), `div.app.stack` (report). Only `.app` has a container rule (`max-width: 90rem; margin: 0 auto; padding: ... var(--space-4) ...`). So the picker, loading and error Screens have no container. For the report Screen `.app` should give an 18px-or-more gutter, yet the review saw none: **not explained by reading the CSS**. Task 1.3 must confirm the cause (candidates: the built `dist` CSS being stale, a later rule overriding padding, or the review's graveyard observation being the unwrapped phases). Either way the fix moves the container to `.screen`, which covers every phase, and 90rem is also too wide (1620px at the 18px root).
2. **D2.** `views/header.ts` renders `ul.counts > li > button`. `base.css` resets only `ul, ol { margin: 0; padding-left: 1.25rem }`, and `.counts` is `display: grid` without `list-style: none`/`padding: 0`. `.grid` and `.demo-cards` already have `list-style: none; padding: 0`; `.counts` was missed.
3. **D3a.** `renderTombstone` emits both `span.tomb-label.chip` and `span.tomb-grade`.
4. **D3b.** `.tombstone-dead` has `background-image: linear-gradient(to bottom, transparent 2.25rem, var(--edge) 2.25rem, ...)`: a 1px line at 2.25rem, which lies inside the arch because the 999px top radii are scaled down to a roughly 160px-tall curve on a 20rem card. The arch itself is a 4px `border-top` with 1px side borders and a huge radius, so the curve is a tapering crescent. The cause of the clip at the very top is **not established by reading**; candidates are the crescent border plus the pulsing `box-shadow`, or the `li`/`.grid` box cropping the stone. Task 1.3 inspects it in a browser if available; the fix is a uniform border and no clipping ancestor, and 6.4 checks it by eye.
5. **D4.** `base.css` has `.tomb-name, .tomb-summary, dd, td, th { overflow-wrap: anywhere }`. For `overflow-wrap: anywhere` the min-content width counts soft wrap opportunities, so the automatic table layout may shrink Status, Points and Source to a few characters and the long description column wins. Hence "Statu/s".
6. **D5.** `calibrationBody` hardcodes `"No source recorded"` in the Source cell. `CalibrationRow` (skeleton) has no `rule` field, but `renderBreakdown` receives `record.death`, which has `calibration.rule`.
7. **D6.** The Total_Row is `th "Total"`, `td ""`, `td ""`, `td Total`, `td ""`. In the Stacked_Layout every `td`/`th` is `display: block` and `.breakdown tfoot td, th, .total td, .total th` all get `border-top: 3px solid`, so each empty cell is a bar.
8. **D7.** `phaseHeading?.focus()` and `#detail-title.focus()` focus a `tabindex="-1"` element. The only focus style is `:focus-visible`. Browsers apply UA default focus outlines (and `:focus-visible` can match for script focus when there was no prior pointer interaction), so a box shows. **Open risk:** `:focus:not(:focus-visible)` only hides the box when the browser does not match `:focus-visible` for that focus. Chrome's heuristic can match it for a script focus that happens on page load with no earlier focus. The required rule is implemented as specified; task 6.4 checks it in a real browser, and task 3.8 has a recorded contingency if the box persists (see Fix Implementation 8).

Tasks 1.1-1.3 turn these into evidence: the exploratory tests must fail on the unfixed code for the reasons named here; if a failure points elsewhere, this section is revised before the fix.

## Fix Implementation

### Changes

1. **`dom/h.ts`** (closed vocabulary): add `col-signal`, `col-value`, `col-status`, `col-points`, `col-source`, `total-label`; remove `tomb-label` (no longer used). The type and the Stylesheet stay in sync (an existing test checks class usage; task 6.1 extends it to the new names).
2. **`views/tombstone.ts`**: remove the `span.tomb-label.chip` child. Keep `span.tomb-grade` (under the score; it is the grade label in the compact ailing/alive layouts too). Everything else (id, aria, `data-*`, score spans, summary, unknown badge) is unchanged.
3. **`views/breakdown.ts`**:
   - add `col-*` classes to the cells of every row and the `th` of the header (`Signal` -> `col-signal`, and so on);
   - Source_Cell for a link: build the hostname with `<wbr>` after each `.` (text content is unchanged, `wbr` carries no text); `aria-label` unchanged. If `h()` has a closed tag vocabulary, add `wbr` to it in this task;
   - Calibration_Row Source cell: `Engine rule: ${record.death.calibration?.rule ?? "calibration"}` (the fallback is unreachable when a Calibration_Row exists; it keeps the function total);
   - Total_Row: `tr.total` = `th scope=row colspan=3 "Total"` + `td data-label="Total" colspan=2 > span.num "{score} / 100"`. No empty cells. The mismatch rows are unchanged.
4. **`styles/graveyard.css`** (D1, D2, D3):
   - `.screen { max-width: 1200px; margin-inline: auto; padding-inline: var(--space-4); }` and `@media (min-width: 40rem) { .screen { padding-inline: var(--space-6); } }`. The `.app` rule loses `max-width`, `margin` and horizontal padding and keeps its background and vertical padding. (`px` for the max width on purpose: at 1200px and up the root is 18px, so a `rem` value would grow.)
   - `.counts { list-style: none; padding: 0; margin: 0; }` (the existing grid stays: 2 columns on phones, 4 from `40rem`).
   - Remove the `.tomb-label` rules. Remove `background-image` from `.tombstone-dead`. Replace `border-top: 4px solid var(--ember)` with `border: 2px solid var(--edge); border-top: 4px solid var(--ember);` on dead and the amber equivalent on dying, so all sides draw. Add `padding-top` room on `.grid-dead` / `.grid-dying` if the glow needs it (no `overflow: hidden|clip` anywhere in these rules).
5. **`styles/base.css`** (D4, D7):
   - Replace `.tomb-name, .tomb-summary, dd, td, th { overflow-wrap: anywhere }` with `.tomb-name, .tomb-summary, dd { overflow-wrap: anywhere }` and `.breakdown .col-signal { overflow-wrap: anywhere }`. Other tables (none today) get the browser default.
   - Add `:focus:not(:focus-visible) { outline: none; }` after the `:focus-visible` rule. The `forced-colors` block is untouched.
6. **`styles/detail.css`** (D4, D6):
   - `.breakdown .col-value, .col-status, .col-points, .col-source { overflow-wrap: normal; word-break: normal; }` and `.breakdown .col-status, .breakdown .col-points { white-space: nowrap; width: 1%; }` (shrink to content; `.col-signal` takes the rest). `.col-source { overflow-wrap: normal; word-break: normal; }` with the `<wbr>` hostnames.
   - Stacked_Layout (inside `@media (max-width: 40rem)`): `.breakdown tfoot th, .breakdown tfoot td { border-top: 0; }` and `.breakdown tfoot .total { border-top: 3px solid var(--moon); }`; `.breakdown td[data-label]::before` stays so the Total cell reads "Total: 75 / 100". The wide-screen rule keeps `border-top: 3px solid` on the cells of `tfoot .total`.
7. **Tests**: new tests listed under Testing Strategy; `Reference_Renderer` under `src/__reference__/views-v1/` (header comment: FROZEN, test-only, never imported by production code or `main.ts`).
8. **Contingency for D7.** If task 6.4 shows the box still appears in Chrome, add a second, narrower rule `h1[tabindex="-1"]:focus { outline: none; }` (the page heading is never reached by Tab, so no keyboard user loses a ring) and extend the Stylesheet check to allow exactly that selector. This is recorded as a judgement call in `docs/kiro-log.md`; it is not applied unless the manual check demands it.

### Why the existing properties and tests still hold

- **Data.** No change touches `report-view.ts`, the controller, `buildBreakdown` or the death-score engine. The views print `death.score`, `death.grade`, part points and weights from the same fields as before.
- **Accessible name and ids.** The removed `tomb-label` span was `aria-hidden`, so the accessible name (`aria-label`) and the described-by text do not depend on it.
- **Focus.** `.focus()` calls are untouched; the new CSS rule only affects the outline of non-keyboard focus. `:focus-visible` keeps its ring, so the existing "never removes an outline without a `:focus-visible` replacement" check still passes.
- **Word wrap.** `overflow-wrap: anywhere` stays in the Stylesheet (existing "layout-safety" check) on `.tomb-name`, `.tomb-summary`, `dd` and `.col-signal`, so long names and the signal text still wrap on 320px screens.
- **Detail selectors.** `tfoot tr.total td[data-label='Total']`, `tfoot .total` text, `tbody.calibration tr th` text, and `td[data-label='Points']` remain.

## Correctness Properties

All run with fast-check `numRuns: 100`, the `fc-runner` seed policy from `@last-rites/skeleton/graveyard/testing` (`FC_SEED` wins, `CI` fixes seed 20261113, otherwise random and recorded on failure), via `assertProperty` / `checkProperty`. Each has sabotage variants per `proof-rules.md`; the property builders live in `src/test-support/properties/p9.ts` and `p10.ts` and export `build(impl)`, wrong implementations in `src/test-support/sabotage/p9.ts` and `p10.ts`. Properties 6-8 already exist in this app.

New generators (`test-support/arbitraries.ts`):
- `scanReportArb`: a Scan_Report built with `buildReport` from `packageSignalsArb` (skeleton testing subpath), 1-12 dependencies; biased to include declared-abandoned packages (calibration present), packages with unknown signals, all four grades, `file:` skipped entries, hostile and long names (`hostileUrlArb`, 47-char scoped names), and tampered `sourceUrl`s. Names are unique; the duplicate-name case is covered by an example test.
- `openPackageArb`: an index into the report's dependencies (the package whose Detail_Panel is opened).

`renderedFacts(root)` (`test-support/rendered-facts.ts`): reads only stable data hooks, not layout classes: Tombstones (`.tombstone` -> `data-key`, `data-grade`, score from the `aria-label` pattern `name, grade, score N of 100`), and for an open panel each `table.breakdown` row in order: row label, `td[data-label=Value]` text, Status text, Points text (`points / weight` or `+points`), plus the Total text. Source cell text and wrapper elements are NOT facts (D5 changes the calibration Source text on purpose). Result is a plain JSON-comparable object.

### Property 9: Fix checking (DOM)

**Validates: Requirements 2.3, 2.6, 2.7, 2.2 (DOM part), 3.2, 3.3**

- Arbitrary: `scanReportArb` x `openPackageArb`. Mount with `mountPage` and the fake fetch, open the package.
- Assert for every Tombstone: exactly one Grade_Label (descendants whose trimmed text equals the grade label case-insensitively, excluding `.visually-hidden`), `.tomb-label` absent, accessible name unchanged (equals `${name}, ${grade}, score ${score} of 100`).
- Assert in the open panel: if `death.calibration` is present, the Calibration_Row Source_Cell text is exactly `Engine rule: ${rule}`; no Calibration_Row Source_Cell says "No source recorded"; signal rows without a URL still say it.
- Assert `tfoot` contains exactly one `tr.total`; it has no empty `td`/`th`; its text contains `${score} / 100`; `th` + `td` colspans sum to the column count (5).
- Assert every rendered `ul` whose class is in the Layout_List set has a bullet-less rule in the Stylesheet (`list-style: none` and zero padding, from the CSS check in Property 11 below); every prose `ul` (`.warnings`, `.skipped`) has none.
- Assert the programmatic focus is kept: after mount `document.activeElement` is the screen `h1`; after opening the panel it is `#detail-title`.

### Property 10: Preservation checking

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.6**

- Arbitrary: `scanReportArb` x `openPackageArb`.
- Assert `renderedFacts(fixed) deep-equals renderedFacts(reference)`, where the reference is the Reference_Renderer mounted by the same harness; and also deep-equals the facts expected from the report itself (packages, `death.score`, `death.grade`, `parts[].points` and `weight`, `calibration.points`, `score`), so a wrong reference cannot hide a regression.
- Assert the set of Tombstone keys equals the set of dependency names (with `#n` for duplicates), per grade group, and the group counts equal the header counts.
- Assert unsafe URLs are still withheld (no `a[href]` with a non-http(s) scheme) and no element was created from report text (names appear only as text).
- Baseline: run against the unfixed code first (expected PASS: reference and current are the same code), then after the fix (still PASS).
- Sabotages caught: see below.

### Property 11: Fix checking and preservation of the Stylesheet (static)

Not random, so it is an example-based check function `checkStylesheet(css): Violation[]` (in `test-support/css-checks.ts`), run on the real Stylesheet (expects `[]`) and on mutated copies (each expects a non-empty list). It uses the shared declaration parser (`theme/css-parse.ts`, moved from `theme.test.ts` in task 2.2) which yields `{ prop, value, preludes }` with the selector and at-rule chain.

Checks (each maps to a clause):
- S1 container (2.1): a rule whose selector list contains `.screen` sets `max-width` in px (or rem x 16) within [960, 1280], `margin-inline: auto` or `margin: 0 auto`, `padding-inline` >= 16px outside media queries, and `padding-inline` >= 24px inside `(min-width: 40rem)`. `.app` has no `max-width` and no horizontal `padding`.
- S2 lists (2.2): for each class in `counts`, `grid`, `demo-cards` there is a rule with `list-style: none` and `padding: 0` (or `padding-left: 0`). `ul.warnings`/`.skipped ul` have no such rule (their bullets are kept).
- S3 arch (2.4): no `background-image`/`linear-gradient` in any `.tombstone-dead` rule; `.tombstone-dead` and `.tombstone-dying` declare a uniform `border` before the `border-top` override; no rule for `.grid`, `.group`, `.screen`, `.app`, `.tombstone*` sets `overflow` to `hidden` or `clip`.
- S4 words (2.5): no `overflow-wrap: anywhere` and no `word-break: break-all|break-word` on a selector that is bare `td`, `th` or `.breakdown td/th`; `.col-signal` has `overflow-wrap: anywhere`; `.col-value`, `.col-status`, `.col-points`, `.col-source` have `overflow-wrap: normal` and `word-break: normal`; `.col-status` and `.col-points` have `white-space: nowrap`.
- S5 footer (2.7): inside `(max-width: 40rem)`, `.breakdown tfoot th/td` have `border-top: 0|none`, and a `.total` row rule has the `border-top`.
- S6 focus (2.8): exactly one `outline: none|0` declaration exists and its selector is `:focus:not(:focus-visible)`; the `:focus-visible` rule still has `var(--ring-width)` and `var(--focus)`; the `forced-colors` block still sets `outline-color: Highlight`; no `:focus { outline... }` rule.
- S7 preserved rules (3.5, 3.7): `min-width: 0` on the grid children, `overflow-wrap: anywhere` present, 44px target, 18px at `min-width: 1200px`, 56px dead score, motion only in `prefers-reduced-motion: no-preference`, nothing remote. (These are the existing `theme.test.ts` checks; they keep running unchanged.)

### Sabotage harness

`sabotage.test.ts` gains the entries below; each must be caught by at least one property or by `checkStylesheet` at seed 20261113, and the real implementation passes under the same seed.

DOM sabotages (against Properties 9 and 10), implemented as wrong view implementations in `test-support/sabotage/p9.ts` / `p10.ts`:
- (a) tombstone keeps both `tomb-label` and `tomb-grade` (Property 9);
- (b) calibration Source stays "No source recorded" (Property 9);
- (c) Total_Row keeps empty cells (Property 9);
- (d) two `tr.total` rows (Property 9);
- (e) wrong rule text, for example `Engine rule: calibration` or a missing `declared_abandoned` (Property 9);
- (f) fix drops the focus call (Property 9);
- (g) fix drops one Breakdown row, or prints `points` instead of `points / weight`, or prints the grade lowercased in `data-grade` (Property 10);
- (h) fix drops the calibration row or its `+points` (Property 10);
- (i) fix hides tombstones of the alive group or changes their order of keys per group (Property 10);
- (j) fix renders an `a[href]` for an unsafe URL (Property 10).

CSS sabotages: string mutations of the real Stylesheet, applied before `checkStylesheet`:
- (k) delete `.screen`'s `max-width`; (l) set it to `90rem`; (m) set `padding-inline: 0`;
- (n) delete `.counts`'s `list-style: none`;
- (o) re-add the gradient `background-image` to `.tombstone-dead`; (p) add `overflow: hidden` to `.grid`;
- (q) restore `td, th { overflow-wrap: anywhere }`; (r) drop `white-space: nowrap` from `.col-status`;
- (s) drop the `tfoot` mobile `border-top: 0`;
- (t) delete `:focus:not(:focus-visible)`; (u) replace it with a blanket `:focus { outline: none }`; (v) change the `:focus-visible` outline to `none`.

## Testing Strategy

- **Exploratory (before the fix):** write the DOM checks of Property 9 and `checkStylesheet` first; run them against the unfixed code. They must FAIL, one named violation per defect D1-D7 (S1 fails because the container is on `.app` and 90rem; S2 because `.counts` has no reset; 9 because two Grade_Labels; S3 because of the gradient; S4 because of `td, th { overflow-wrap: anywhere }`; 9 for the calibration text and for the Total_Row; S6 because there is no rule). Record the violation list and the seed in `docs/kiro-log.md` and compare with the hypotheses above. For D1 (graveyard page) and the clipped arch, the exploratory step cannot explain what the review saw; a note in the log says so, and the manual check (6.4) is the evidence.
- **Preservation baseline:** freeze the Reference_Renderer; write Property 10 and the existing-rule checks (S7); run on the unfixed code (PASS).
- **Fix checking:** Properties 9 and `checkStylesheet` on the fixed code, `numRuns: 100`.
- **Preservation checking:** Property 10 and S7 on the fixed code (PASS, same seed as the baseline).
- **Example tests:** the ldapjs panel (calibration `+3`, Total `75 / 100`, source text "Engine rule: declared_abandoned") from the existing `parse-server.trim.json` fixture; a long scoped name (47 chars); duplicate names; a report with no calibration; hostile name; a lockfile-less (range) report.
- **Existing tests:** update the assertions that pinned defects (6.2).
- **Integration:** `npm run typecheck` and `npm test` green across the repo; `npm run build -w @last-rites/exorcist-web` succeeds.
- **Not covered by automation (reported, not claimed):** the actual look of the arch (full outline, no line), the real word breaks in the table at 1352px, the Stacked_Layout total at 375px, the absence of the focus box in Chrome, the D1 gutter at 1352px. These are checked by hand (6.4) with the same viewports as the review, or reported as unverified.
- Tests never touch the network; fixtures are inline or under `__fixtures__/`.
