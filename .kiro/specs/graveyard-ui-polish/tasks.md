# Implementation Plan: graveyard-ui-polish (bugfix)

## Overview

Fixes the seven presentation defects D1-D7 of the Graveyard_Page found in `docs/review/2026-11-13-ui-visual-check.md`, without changing any data. Order follows the bugfix workflow: explore the bug on unfixed code, capture the preservation baseline, implement, re-verify, sabotage, update fallout, document, checkpoint. Commits reference task numbers (for example `graveyard-ui-polish 3.4: ...`). Only `apps/exorcist-web` changes; do not touch `skeleton/`, `report-view.ts`, the controller or the router. Checks are DOM structure and static CSS text (jsdom/Node, no browser); what they cannot show is covered by the manual check in 6.4 and reported separately.

## Tasks

### Phase 1: Explore the bug on unfixed code

- [x] 1.1 Exploratory DOM test (expected to FAIL on unfixed code)
  - Add `scanReportArb` and `openPackageArb` to `test-support/arbitraries.ts` (see design.md) and `test-support/rendered-facts.ts` (`renderedFacts(root)`).
  - Write the DOM half of Property 9 in `test-support/properties/p9.ts` and `polish.dom.test.ts` (`numRuns: 100`, `fc-runner` seed policy): one Grade_Label per Tombstone, calibration Source text, one Total_Row without empty cells, heading focus kept.
  - Run against the UNFIXED code. Confirm it FAILS for D3 (two labels), D5, D6 and passes the focus assertion. _Requirements: 1.3, 1.6, 1.7, 2.3, 2.6, 2.7_
- [x] 1.2 Exploratory Stylesheet test (expected to FAIL on unfixed code)
  - Move the declaration parser out of `theme/theme.test.ts` into `theme/css-parse.ts` (same behavior; `theme.test.ts` imports it) and add `test-support/css-checks.ts` with `checkStylesheet(css)` implementing S1-S7 from design.md. `theme.test.ts` keeps its existing checks unchanged.
  - Run `checkStylesheet` on the unfixed Stylesheet. Confirm it reports violations for S1 (container on `.app`, 90rem, picker/status have none), S2 (`.counts`), S3 (gradient line, border-top only), S4 (`td, th` anywhere), S5 (every tfoot cell has a border), S6 (no `:focus:not(:focus-visible)`), and none for S7. _Requirements: 1.1, 1.2, 1.4, 1.5, 1.7, 1.8, 2.1, 2.2, 2.4, 2.5, 2.7, 2.8_
- [x] 1.3 Record the violation lists and the seed in `docs/kiro-log.md` (dated entry) and compare with the hypothesized root causes in design.md. Add what the tests cannot explain: why D1 showed no gutter on the graveyard page although `.app` has padding, and what clips the arch (look at the built `dist` CSS and, if a browser is available, at the page). If the evidence points elsewhere, revise design.md "Hypothesized Root Cause" before continuing.

### Phase 2: Preservation baseline on unfixed code

- [x] 2.1 Freeze the original views as `apps/exorcist-web/src/__reference__/views-v1/{tombstone,breakdown,header}.ts` (byte copies, imports adjusted to `../../`, header "FROZEN, test-only, never import from production code or main.ts"). Add a harness option so `mountPage` can render with the reference views (an injected view set in test code only; production `controller.ts` is not changed). _Requirements: 3.1, 3.2, 3.3_
- [x] 2.2 Write Property 10 in `test-support/properties/p10.ts` and `polish.preserve.dom.test.ts`: `renderedFacts(fixed)` deep-equals `renderedFacts(reference)` and the facts expected from the report; keys per group and header counts; unsafe URLs withheld; names written as text. Add the S7 checks as an explicit group in `checkStylesheet` (the existing `theme.test.ts` checks stay too).
- [x] 2.3 Run Property 10 and S7 against the UNFIXED code. Confirm they PASS (baseline) and note the seed in `docs/kiro-log.md`. _Requirements: 3.1-3.8_

### Phase 3: Implement the fix

- [x] 3.1 `dom/h.ts`: add `col-signal`, `col-value`, `col-status`, `col-points`, `col-source`, `total-label` to `ClassName`; remove `tomb-label` after 3.2 (do not leave unused names); add `wbr` to the tag vocabulary if it is closed. Update `dom/h.test.ts` if it lists the vocabulary.
- [x] 3.2 `views/tombstone.ts` (D3a): remove the `span.tomb-label.chip` child; keep `span.tomb-grade`. Do not change ids, aria, `data-*`, score spans, summary or badge. _Requirements: 2.3, 3.2_
- [ ] 3.3 `views/breakdown.ts` (D4, D5, D6):
  - add the `col-*` classes to the header `th` and to every signal and calibration cell;
  - hostname in the Source_Cell with `<wbr>` after each dot (text unchanged, `aria-label` unchanged);
  - Calibration_Row Source cell `Engine rule: ${record.death.calibration?.rule ?? "calibration"}`;
  - Total_Row as `th scope=row colspan=3` plus `td data-label="Total" colspan=2`, no empty cells; mismatch rows unchanged.
  _Requirements: 2.5, 2.6, 2.7, 3.3, 3.4_
- [ ] 3.4 `styles/graveyard.css` (D1): add `.screen` as the Content_Column (`max-width: 1200px`, `margin-inline: auto`, `padding-inline: var(--space-4)`, and `var(--space-6)` from `min-width: 40rem`); remove `max-width`, `margin` and horizontal padding from `.app` (keep its background and vertical padding). _Requirements: 2.1, 3.5_
- [ ] 3.5 `styles/graveyard.css` (D2): `.counts { list-style: none; padding: 0; margin: 0 }`, keep the 2/4-column grid. Confirm `.grid` and `.demo-cards` keep their resets; prose lists untouched. _Requirements: 2.2_
- [ ] 3.6 `styles/graveyard.css` (D3): delete the `.tomb-label` rules; remove `background-image` from `.tombstone-dead`; give dead and dying a uniform `border` with the grade-colored `border-top`; add top room (`padding-top` on `.grid-dead` / `.grid-dying`) only if needed; no `overflow: hidden|clip` on ancestors. Keep the radius, glow, `min-height` and the reduced-motion pulse. _Requirements: 2.4, 3.7_
- [ ] 3.7 `styles/base.css` and `styles/detail.css` (D4, D6): replace `td, th { overflow-wrap: anywhere }` with the scoped `.col-signal` rule (keep `.tomb-name, .tomb-summary, dd`); add the Short_Cell / Source rules (`overflow-wrap: normal`, `word-break: normal`, `white-space: nowrap; width: 1%` on Status and Points); in the `max-width: 40rem` block set `border-top: 0` on `tfoot` cells and put the 3px border on the `.total` row. _Requirements: 2.5, 2.7, 3.5_
- [ ] 3.8 `styles/base.css` (D7): add `:focus:not(:focus-visible) { outline: none; }` after the `:focus-visible` rule. Do not touch the `.focus()` calls, the ring, or the `forced-colors` block. Do NOT add the `h1[tabindex="-1"]:focus` contingency here; it is decided in 6.4. _Requirements: 2.8, 3.6_

### Phase 4: Re-verify

- [ ] 4.1 Re-run Property 9 (DOM) and `checkStylesheet` against the fixed code: PASS, no violations. Record the result in `docs/kiro-log.md`.
- [ ] 4.2 Re-run Property 10 and S7 against the fixed code: PASS (same seed as 2.3). Run the existing `apps/exorcist-web` suite (`theme.test.ts` included).
- [ ] 4.3 Run the `apps/exorcist-web` suite with `CI=1` (seed 20261113) and with two random seeds; confirm green.

### Phase 5: Sabotage

- [ ] 5.1 Add the DOM sabotages (a)-(j) from design.md to `test-support/sabotage/p9.ts` and `p10.ts` as wrong view implementations, and the CSS sabotages (k)-(v) as string mutations in `test-support/sabotage/css.ts`. Add all to the suites in `sabotage.test.ts` with their `required` names.
- [ ] 5.2 Extend `sabotage.test.ts` so every sabotage is caught by at least one property or by `checkStylesheet` at seed 20261113 (message `Sabotage "<name>" stayed green for "<property>"`), every CSS mutation really changed the text (assert the mutated string differs from the original), and the real implementation passes under the same seed. If one stays green, fix the generator or the check, not the sabotage, and record it.
- [ ] 5.3 Record the shrunk counterexamples (DOM sabotages) and the violation names (CSS mutations) in `docs/kiro-log.md`.

### Phase 6: Fallout and manual check

- [ ] 6.1 Extend the existing class-vocabulary test (every `ClassName` is used by a view or the Stylesheet, every class used by a view is in `ClassName`) to the new names and the removed `tomb-label`.
- [ ] 6.2 Update the assertions that pinned a defect, nothing else: any test that expects `.tomb-label`, empty footer cells, or "No source recorded" on the Calibration_Row (`grep` in `apps/exorcist-web/src/*.test.ts`). Do not weaken the other assertions. Add the ldapjs example (calibration `+3`, Total `75 / 100`, "Engine rule: declared_abandoned") and the long-name, duplicate-name, hostile-name and no-calibration examples.
- [ ] 6.3 Rebuild: `npm run build -w @graveyard-kit/exorcist-web`; confirm one JS and one CSS asset in `dist/`, and that the built CSS contains `.screen`, `:focus:not(:focus-visible)` and no `.tomb-label`.
- [ ] 6.4 Manual browser check (by Claude or the user; no browser is available to the test run): Chrome 1352x761 and 375x812 on the demo parse-server, package ldapjs: centered column with gutter (D1), no bullets (D2), one grade label, full arch, no line (D3), no mid-word breaks (D4), "Engine rule: declared_abandoned" (D5), one Total line at 375px (D6), no focus box on the `h1` after load and navigation, with Tab still showing the ring elsewhere (D7). If the focus box still appears, apply the contingency `h1[tabindex="-1"]:focus { outline: none }`, extend S6 to allow exactly that selector, add a sabotage for it, and record the judgement call. Record in `docs/kiro-log.md` each item as checked or NOT RUN.

### Phase 7: Documentation

- [ ] 7.1 `apps/exorcist-web/src/__fixtures__/README.md` or the app README: add one sentence if they describe the Tombstone or Breakdown markup. Skip if they do not.
- [ ] 7.2 `.kiro/specs/graveyard-ui/design.md`: add a pointer section "Polish (bugfix)" linking to `.kiro/specs/graveyard-ui-polish/`, noting that the Tombstone has one grade label, the Content_Column lives on `.screen`, the Total_Row has no empty cells and the calibration Source reads "Engine rule: <rule>". Do not rewrite the rest.
- [ ] 7.3 Append the final dated entry to `docs/kiro-log.md`: defects, root causes confirmed or revised (D1 graveyard page and the arch clip especially), fix, properties, sabotage results, manual check status, judgement calls.

### Phase 8: Checkpoint

- [ ] 8.1 Run `npm run typecheck` across the repo: green.
- [ ] 8.2 Run `npm test` across the repo: green (all workspaces, `numRuns: 100`, no network), with and without `CI=1`.
- [ ] 8.3 Final check against bugfix.md: each clause 2.1-2.8 and 3.1-3.9 maps to a passing test or to a manual-check line in the log; list every clause that is only manually checked or unverified in `docs/kiro-log.md`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": "wave-1", "tasks": ["1.1", "1.2", "2.1"] },
    { "id": "wave-2", "tasks": ["1.3", "2.2"] },
    { "id": "wave-3", "tasks": ["2.3", "3.1"] },
    { "id": "wave-4", "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8"] },
    { "id": "wave-5", "tasks": ["4.1", "4.2", "5.1", "6.1", "6.2", "6.3"] },
    { "id": "wave-6", "tasks": ["4.3", "5.2"] },
    { "id": "wave-7", "tasks": ["5.3", "6.4", "7.1", "7.2"] },
    { "id": "wave-8", "tasks": ["7.3", "8.1"] },
    { "id": "wave-9", "tasks": ["8.2"] },
    { "id": "wave-10", "tasks": ["8.3"] }
  ],
  "dependencies": {
    "1.3": ["1.1", "1.2"],
    "2.2": ["2.1", "1.2"],
    "2.3": ["2.2"],
    "3.1": ["1.3", "2.3"],
    "3.2": ["3.1"],
    "3.3": ["3.1"],
    "3.4": ["3.1"],
    "3.5": ["3.1"],
    "3.6": ["3.2"],
    "3.7": ["3.3"],
    "3.8": ["3.1"],
    "4.1": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8"],
    "4.2": ["4.1"],
    "4.3": ["4.1", "4.2"],
    "5.1": ["4.1"],
    "5.2": ["5.1"],
    "5.3": ["5.2"],
    "6.1": ["3.6"],
    "6.2": ["3.3", "3.2"],
    "6.3": ["4.1"],
    "6.4": ["6.3"],
    "7.1": ["4.3"],
    "7.2": ["4.3"],
    "7.3": ["5.3", "6.4", "7.2"],
    "8.1": ["6.1", "6.2"],
    "8.2": ["8.1", "5.3"],
    "8.3": ["8.2", "7.3"]
  }
}
```

## Notes

- Tests never hit the network; fixtures are inline or under `__fixtures__/`. jsdom does no layout, so DOM and CSS-text checks prove the cause is gone, not how a browser draws it; 6.4 is the only visual evidence and must be reported as checked or NOT RUN.
- Task 1.1 and 1.2 must FAIL and 2.3 must PASS on unfixed code; if either is reversed, stop and revisit design.md before touching a view or a stylesheet.
- Per `proof-rules.md`, every new property and static check has sabotage coverage; a check that cannot fail is rejected.
- Do not change `skeleton/`, `report-view.ts`, the controller, the router, or any score, grade, point or weight text.
- The D7 rule is `:focus:not(:focus-visible)` as specified; it may not hide the box for a script focus in every browser (design.md "Open risk"), which is why 6.4 decides the contingency.
