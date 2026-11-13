# Implementation Plan: toe-tag-redesign

## Overview

This plan redesigns the whole visual layer of `apps/exorcist-web` to the Toe Tag direction (`docs/design/toe-tag.md`, mockups in `docs/design/`). It changes stylesheets, presentation-only DOM wrappers, fonts, copy constants and tests. It does not change behavior, routes, data, accessibility rules, the API, `skeleton/`, the scanner, the engine or the proof harness.

Order follows the preservation-first rule: foundations (steering, fonts, tokens), then a preservation baseline written and run green against the UNCHANGED page, then the visual phases (base, masthead and tabs, Toe Tags, Breakdown, sheet and Proof, home and status and empty states), then the one motion, then the static guard properties and sabotage lists, then verification and the manual browser check. Each CSS phase also updates the old tests and sabotage mutations that its CSS invalidates, so `npm test` is green at every checkpoint.

TypeScript strict, ESM, Vitest + fast-check, jsdom for DOM tests, zero network. Commits reference task numbers (for example `toe-tag-redesign 5.3: ...`). Do not commit as part of this plan unless the owner asks. Do not write more than a task asks. Test sub-tasks are not optional: proof over claims.

Ground rules for every task: `ClassName` entries are added in the task that first uses them (the class-vocabulary test fails on an unused name); colors, font stacks and sizes are written only in `tokens.css` (and font files in `fonts.css`) from Phase 3 on; a new color pair is added to the Pair_Registry (task 10.1) before it is used, and until that task exists it must come from the pair table in design.md.

## Tasks

### Phase 1: Steering, fonts and tokens

- [x] 1.1 Create `.kiro/steering/graveyard-ui.md` with front matter `inclusion: fileMatch` and `fileMatchPattern: "apps/exorcist-web/**"`. Body in this order: the concept in three sentences; the token table (every token of design.md "Tokens" with value, role and where allowed, including "Manila on tag objects only" and "Rust is the DYING band only"); the type scale table; the component rules (Toe_Tag, Band, Form_Grid, Stamp, Compare_Box, Sheet_Tag, controls, notices, focus ring, motion, narrow rules); and the BANNED looks list with exactly the six looks and one avoidance line each (design.md "Steering file"). State that Special Elite is for tiny field labels only and Apache-2.0. Do not edit any other steering file.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
- [x] 1.2 Obtain the fonts. In a temporary directory run `npm pack` for `@fontsource/barlow-condensed`, `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono` and `@fontsource/special-elite`, each at an exact version you record; extract; copy unchanged these Latin, normal-style woff2 files into `apps/exorcist-web/public/fonts/`: Barlow Condensed 600 and 700, IBM Plex Sans 400 and 600, IBM Plex Mono 400 and 600, Special Elite 400. Keep the Fontsource file names. Do not add any Fontsource package to a `package.json`. Delete the temporary directory. Confirm the total size is at most 300 KB.
  - _Requirements: 4.1, 4.2, 4.7, 1.2_
- [x] 1.3 Add `apps/exorcist-web/public/fonts/licenses/`: copy (do not retype) the license text shipped in each package or upstream repository as `OFL-Barlow-Condensed.txt`, `OFL-IBM-Plex-Sans.txt`, `OFL-IBM-Plex-Mono.txt` and `Apache-2.0-Special-Elite.txt`. Open each file and confirm it names the right license and copyright holder (The Barlow Project Authors; IBM Corp.; the Apache License 2.0 with "Copyright (c) 2010 by Brian J. Bonislawsky DBA Astigmatic (AOETI)"). If a package lacks a license file, take it from the family's upstream repository and say so in the README.
  - _Requirements: 4.3_
- [x] 1.4 Add `public/fonts/README.md`: a table of file, family, weight, source package and version, SHA-256 (from `shasum -a 256`), and the license per family, stating that Special Elite is Apache-2.0 and the other three are SIL OFL 1.1. Write `src/fonts.test.ts` (Node): every listed file exists and starts with the bytes `wOF2`; the README lists exactly the woff2 files present with matching SHA-256; the four license files exist, are non-empty and contain "SIL OPEN FONT LICENSE" (three) or "Apache License" (one); the woff2 total is at most 300 KB.
  - _Requirements: 4.3, 4.4, 4.7_
- [x] 1.5 Create `src/styles/fonts.css`: seven `@font-face` rules with `font-display: swap`, `src: url("/fonts/<file>.woff2") format("woff2")` and the Latin `unicode-range` from the Fontsource CSS. Import it first in `src/main.ts`. Extend `fonts.test.ts`: every `url()` in `fonts.css` is an absolute path under `/fonts/` and points at an existing file in `public/fonts/`; every rule has `font-display: swap`; there is no `http:`, `https:` or `//` URL and no `@import`; the declared family names are exactly `Barlow Condensed`, `IBM Plex Sans`, `IBM Plex Mono`, `Special Elite`. Confirm `vite-config.test.ts` still passes with the CSP string untouched.
  - _Requirements: 4.5, 1.3, 1.4_
- [x] 1.6 Rewrite `src/styles/tokens.css` additively: add every new token of design.md "Tokens" (colors, four font stacks, type scale, tracking, rules, radius, ring, tag geometry, motion) with `color-scheme: light` removed until task 8.5 (the legacy `color-scheme: dark` and legacy tokens stay until then so the unmigrated stylesheets keep working). Keep `--target: 44px`, `--ring-width`, `--ring-offset` and the spacing scale as they are. Choose `--rust` so that `--on-band` on it is at least 4.5:1 (start from `#9A3F12`) and note the value.
  - _Requirements: 3.1, 3.4, 17.1_
- [x] 1.7 Run `npm run build -w @graveyard-kit/exorcist-web` once. Confirm `dist/fonts/` holds the seven woff2 files and `dist/index.html` carries the unchanged CSP meta; do not commit `dist/`.
  - _Requirements: 1.4, 24.1_
- [x] 1.8 Checkpoint after Phase 1 - Ensure `npm run typecheck` and `npm test` pass, ask the user if questions arise.

### Phase 2: Preservation baseline on the unchanged page

- [ ] 2.1 Freeze the current post-polish production views as `src/__reference__/views-v2/{tombstone,breakdown,header,proof-slot}.ts` (byte copies, imports adjusted to `../../`, header "FROZEN, test-only, never import from production code or main.ts"). Leave `views-v1/` as it is.
  - _Requirements: 14.2, 15.1_
- [ ] 2.2 Create `src/test-support/toe-facts.ts` with `toeFacts(root)` reading only the Fact_Hooks: header (counts, total, meta line, legend, warnings, notices), per tag (key, grade, aria-label, `.tomb-name`, `.tomb-score` visually hidden text, `.tomb-summary`, `.tomb-badge`), group order, skipped list, the open Breakdown (every body and calibration row: label, explanation, value, status, points, source text, `href` or withheld text; calibration text; total; mismatch rows) and the Proof section (`.proof-badge` text, runs/seed line, sabotage line, recommendation, `.proof-sites li` texts, `.proof-attempts > li` fields, each `pre.proof-pre` `textContent` byte for byte, placeholder and unreadable lines). It never reads layout classes, Tag_Labels or decorative spans. Add a small example test with a hand-built DOM.
  - _Requirements: 15.2, 16.3_
- [ ] 2.3 Add `proofReportArb` and `proofKindArb` to `src/test-support/arbitraries.ts`, built with `build-proof-report.ts` and the real `serializeProofReport`: five kinds, 0 to 80 call sites, 1 to 3 attempts, multi-line, unicode and hostile strings in every free-text field, counterexamples with arbitrary shrunk input and outputs. Example test: every generated text parses with the real `parseProofReport`.
  - _Requirements: 16.1_
- [ ] 2.4 Write Property 1 in `src/test-support/properties/tt1.ts` and `src/toetag.preserve.scan.dom.test.ts` (jsdom, `checkAsyncProperty`, `numRuns` 100, Fast_Check_Runner seed): mount the page for `scanReportArb`, expand the alive group, open `openPackageArb`'s package; assert `toeFacts(page)` deep-equals `toeFacts` of the Reference_Views render and equals `expectedFacts(report, openName)` computed independently (keys per grade in view-model order, `"<points> / <weight>"`, `"+<points>"`, `"<score> / 100"`, header recount by `death.grade`). Export `build(impl)`; print seed and shrunk report on failure.
  - _Requirements: 15.1, 15.2, 15.3, 23.1_
- [ ] 2.5 Add the real-data example tests for Property 1: parse the four `/demo/*.json` with `parseReport` and assert the same equality for the first dead package of each (or the first package if none), without hard-coded counts.
  - _Requirements: 15.4_
- [ ] 2.6 Write Property 2 in `src/test-support/properties/tt2.ts` and `src/toetag.preserve.proof.dom.test.ts`: mount a dead package whose proof is served from the fake fetch (`GET /demo/proofs/<repo>/<package>.json`), wait for the proof, and assert the proof facts deep-equal those of the Reference_Views `renderProofSlot` and equal the facts computed from the report through the skeleton's proof view (badge label, runs and seed, sabotage line, recommendation, first 50 call sites plus `and <n> more`, per-attempt fields, counterexample input/old/new byte for byte). Cover the states `absent`, `failed` and `invalid` (placeholder, and the unreadable line for `invalid`).
  - _Requirements: 16.2, 16.3, 16.4, 16.6, 23.1_
- [ ] 2.7 Add the real-data example tests for Property 2: every `demo/proofs/**/*.json` that parses is rendered for its package and compared the same way; no hard-coded values.
  - _Requirements: 16.5_
- [ ] 2.8 Write Property 3 in `src/test-support/properties/tt3.ts` and `src/toetag.safety.dom.test.ts`: hostile corpus in every free-text field of generated Scan_Reports and Proof_Reports, page mounted, package opened; assert no `img`, `script`, `iframe`, `object`, `embed`, `svg` or `style` element from report text, no `on*` attribute, no `style` attribute other than a points-bar width of the form `<number>%`, every `a[href]` is `https?://` or `#…`, no `a` inside `section.proof` or inside a tag field, and decorative elements contain no report text (the decorative class list is a constant that later tasks extend).
  - _Requirements: 14.3, 15.1, 16.2, 23.1_
- [ ] 2.9 Add the DOM sabotage lists `src/test-support/sabotage/tt1.ts`, `tt2.ts`, `tt3.ts` with the entries named under Properties 1 to 3 in design.md (each a wrong view or a post-render mutation, as in `sabotage/dom.ts`), and create `src/toetag.sabotage.test.ts` running them with seed 20261113: fails with `Sabotage "<name>" stayed green for "<property>"`, asserts every list is non-empty, and asserts the real implementation passes each property under the same seed.
  - _Requirements: 23.2, 23.3_
- [ ] 2.10 Run Properties 1 to 3 and the sabotage test against the UNCHANGED page: all green (baseline). Run once with `CI=1` and once with a random seed. Append a dated entry to `docs/kiro-log.md` "toe-tag-redesign baseline" with the seeds and the property names.
  - _Requirements: 15.5, 16.6_
- [ ] 2.11 Checkpoint after Phase 2 - Ensure `npm run typecheck` and `npm test` pass, ask the user if questions arise.

### Phase 3: Wall, type and controls (base styles)

- [ ] 3.1 Rewrite `src/styles/base.css` top part with new tokens only: `html` font-size 16px at every width (delete the 1200px rule), `body` with `--wall` background and one `repeating-linear-gradient` ruled-lines layer in `--wall-rule`, `--ink` text, `--font-body`, line-height 1.5; headings in `--font-display`, uppercase, tracked, sizes from the type scale; `.num`, `code` in `--font-mono`; `.muted` in `--ink-soft`; links in `--steel-ink`, underlined; `.visually-hidden` unchanged.
  - _Requirements: 5.1, 5.2, 5.3, 5.5, 6.1, 17.5_
- [ ] 3.2 `base.css` controls: `button`, `.btn`, `input`, `summary` as Paper faces with a `--rule` Ink edge, `min-height`/`min-width: var(--target)`, body-font 600; `.btn-primary` as an Ink face with Paper text; hover as an offset hard shadow; `[aria-disabled="true"]` and `:disabled` as dashed border, `--paper-grid` face, `--ink-soft` text, `cursor: not-allowed`, no opacity; inputs as `--paper-grid` fields with a `--rule` edge; `.skip-link` as a Paper box with a `--rule` edge.
  - _Requirements: 7.4, 6.6, 19.3_
- [ ] 3.3 `base.css` focus and forced colors: keep `:focus-visible { outline: var(--ring-width) solid var(--focus); outline-offset: var(--ring-offset) }`, `:focus:not(:focus-visible)` and `h1[tabindex="-1"]:focus` exactly; keep the layout-safety rules (`min-width: 0` on grid children, `overflow-wrap: anywhere` on names, summaries and `dd`, `.breakdown .col-signal`); rewrite the `forced-colors: active` block with `CanvasText` borders for buttons, `.btn`, inputs and `.tombstone`, and `outline-color: Highlight`; keep the no-preference block (smooth scroll and control color transitions) as the only motion in the file.
  - _Requirements: 21.1, 21.4, 14.5_
- [ ] 3.4 `graveyard.css` top part: `.screen` max-width 1280px, `margin-inline: auto`, gutters `--space-4` and `--space-6` from 40rem; `.app` with vertical padding only and no background (the Wall is on `body`); `.stack`, `.row`, `.notice` (Paper, `--rule` edge, 6px amber left border) and `.error` (same with `--red-ink`) using new tokens; `.header` closed by a `--rule` Ink rule.
  - _Requirements: 6.2, 7.5, 8.2, 22.1_
- [ ] 3.5 Update the old tests that Phase 3 invalidates, nothing else: `css-checks.ts` S1 (the max-width range stays 960 to 1280; the sabotage text for (k), (l), (m) in `sabotage/css.ts` is re-pointed at the new `.screen` text, (l) becomes `max-width: 90rem`), S7 (replace "18px at min-width 1200px" with "root font-size is 16px with no min-width rule"; keep the 56px check for now), and `theme/theme.test.ts` "has the recording sizes" (same replacement). Run the CSS tests; justify each change in the task notes and in `docs/kiro-log.md` at task 11.2.
  - _Requirements: 22.1, 22.2, 22.4_
- [ ] 3.6 Checkpoint after Phase 3 - Ensure `npm run typecheck` and `npm test` pass, ask the user if questions arise.

### Phase 4: Masthead and group tabs

- [ ] 4.1 `constants.ts`: add `FORM_SUBTITLE`. `dom/h.ts`: add `masthead`, `wordmark`, `form-subtitle` to `ClassName`. `views/header.ts`: wrap wordmark (`p.wordmark` with `PRODUCT_NAME`), `p.form-subtitle`, the unchanged `h1` and the unchanged meta `p` in `div.masthead`; remove the `PRODUCT_NAME` `p.meta`; delete `COUNT_BORDER` and the inline `style.borderTopColor`. Do not change any text, `aria-label`, `data-grade`, `id`, handler or order of the skip link, nav, h1 and counts. Add `src/toetag.header.dom.test.ts`: the `h1` text is `SCREEN_NAME: <repo>` and is the first heading, the wordmark is a `p`, the meta line text equals `buildReportView`'s, the four count buttons keep their `aria-label`s and click behavior.
  - _Requirements: 6.2, 6.3, 1.6, 14.1_
- [ ] 4.2 `graveyard.css` masthead: wordmark (display font, `--size-wordmark`, tracked, Ink), subtitle (label font, `--ink-soft`, 0.8125rem), meta line (mono, right-aligned from 40rem, stacked below), a `--rule` Ink rule closing the masthead; at most 200px tall at the Desktop_Viewport for a report without warnings.
  - _Requirements: 6.2, 6.7, 6.8_
- [ ] 4.3 `graveyard.css` tabs and notes: `ul.counts` as a stamped-tab row (flex, wrapping, 2 by 2 at 375), `button.count` with display-font label, mono number, `min-height`/`min-width: var(--target)`, a 3px bottom rule from `[data-grade]` (dead `--red`, dying `--rust`, ailing `--amber`, alive `--steel`), no inline style; `.legend`, `.warnings`, `.note` as typewriter notes on the Wall in `--ink-soft`; skip link focused state.
  - _Requirements: 6.4, 6.5, 6.6, 19.3_
- [ ] 4.4 Checkpoint after Phase 4 - Ensure `npm run typecheck` and `npm test` pass (Properties 1 to 3 green), ask the user if questions arise.

### Phase 5: Toe Tags

- [ ] 5.1 `constants.ts`: add `TAG_LABELS`. `dom/h.ts`: add `tag-hole`, `tag-field`, `tag-package`, `tag-score`, `tag-cause`, `tag-label`, `tag-band`, `tag-range` to `ClassName`. `views/tombstone.ts`: restructure the button children into hole, three Tag_Fields (aria-hidden Tag_Label then the existing `.tomb-name`, `.tomb-score` with its unchanged inner spans, `.tomb-summary`), the Band (`.tomb-grade`, then `.tomb-badge` when unknown > 0 else `.tag-range` with the grade's `min-max` from `GRADE_INFO`, aria-hidden), and the hidden description. `id`, `title`, `aria-label`, `aria-describedby`, `data-key`, `data-grade`, text and cut rules unchanged. Extend the decorative class list of Property 3.
  - _Requirements: 9.2, 9.3, 9.4, 1.6, 1.7_
- [ ] 5.2 Write `src/toetag.tag.dom.test.ts` (jsdom): DOM order of a tag (hole, package, score, cause, band, description); Tag_Labels are `aria-hidden` and read PACKAGE, SCORE, CAUSE; exactly one leaf equals the grade word; the accessible name and description are unchanged for dead, dying, ailing and alive records; a record with unknown signals shows `.tomb-badge` and no `.tag-range`, a record without shows `.tag-range` with `min-max` and no badge; a 200-character name is cut as before.
  - _Requirements: 9.2, 9.3, 9.4_
- [ ] 5.3 `graveyard.css` tag shape: delete the Night_Theme tombstone rules (arch, glow, `ember-pulse` and its keyframes). Add `.grid > li` (relative, `padding-top: var(--string-height)`, `::before` 2px Ink string), `.tombstone` (`isolation: isolate; position: relative; background: none; border: 0`, text left-aligned), `.tombstone::before` (Ink layer) and `::after` (Manila layer inset by `--rule`) both with the chamfered `clip-path` polygon from `--tag-chamfer`, `.tag-hole` (0.875rem circle, 2px Ink border, `--wall` fill), `.tag-field`, `.tag-label` (label font, `--ink-soft`, uppercase), field rules (1px Ink rule between fields), `.tomb-name` (mono 600), `.tomb-score` (display 700), `.tomb-summary` (mono, `--ink`). No `clip-path` or `overflow` on the button or any ancestor.
  - _Requirements: 9.5, 9.6, 9.12, 21.2_
- [ ] 5.4 `graveyard.css` Band: `.tag-band` (flex, space-between, display font `--size-band`, uppercase, `--track-band`, `padding`, bottom of the tag inside the Ink edge); per grade `--band-color` and `--band-text` (dead `--red`/`--on-band`, dying `--rust`/`--on-band`, ailing `--amber`/`--ink`, alive `--steel`/`--on-band`); `.tomb-badge` and `.tag-range` as mono 0.8125rem in the band's text color with a currentColor outline for the badge.
  - _Requirements: 9.7, 17.4, 21.5_
- [ ] 5.5 `graveyard.css` sizes and grid: dead min-height 15rem with score `--size-score-dead` and name 1.0625rem; dying 13rem with `--size-score-dying`; ailing and alive 9rem with `--size-score-compact`; `.grid` as `repeat(2, minmax(0, 1fr))` with gap `--space-4`, 3 columns from 48rem, 4 from 64rem, 1 column below 22.5rem; `.group-title` as a stamped label (display font, 2px Ink bottom rule, count in mono); the alive disclosure button as a Paper bar with a `--rule` edge; `.skipped` and `.disclosure` spacing.
  - _Requirements: 5.6, 9.8, 9.9, 9.11, 13.4_
- [ ] 5.6 `graveyard.css` interaction: `.tombstone:hover` thickens the Ink layer or adds a hard `3px 3px 0 var(--ink)` shadow on the `li` (no blur); `:active` moves nothing; no transition outside the no-preference block; the focus ring is the global one on the unclipped button.
  - _Requirements: 9.10, 20.6, 21.3_
- [ ] 5.7 Update the old tests that Phase 5 invalidates: `css-checks.ts` S3 becomes "no gradient on any tombstone rule, no `clip-path`/`overflow` on `.tombstone` or its ancestors, `.tombstone::before` and `::after` carry the clip-path" (replacing the arch/`border-top` order check), S7 56px check resolves `var(--size-score-dead)` through the token resolver and still requires 56px; re-point the (o) and (p) mutations in `sabotage/css.ts` (and their `polish.sabotage.css.test.ts` name list if names change); `theme/theme.test.ts` 56px assertion resolves the token the same way.
  - _Requirements: 22.1, 22.4_
- [ ] 5.8 Checkpoint after Phase 5 - Ensure `npm run typecheck` and `npm test` pass (Properties 1 to 3 green), ask the user if questions arise.

### Phase 6: Breakdown Form_Grid

- [ ] 6.1 `detail.css` table frame: `table.breakdown` with a `--rule` Ink outer edge and 1px Ink grid lines; `caption` as a black bar (Ink background, Paper text, display font, uppercase, tracked) attached to the top; header cells as typewriter labels (label font, `--ink-soft`, `--paper-grid` face); body cells on `--paper`, values in `--font-mono` `--size-value`; `.col-signal` keeps `overflow-wrap: anywhere` with the explanation in body font `--size-small`; `.col-value`, `.col-status`, `.col-points`, `.col-source` keep `overflow-wrap: normal`, `word-break: normal`; `.col-status`, `.col-points` keep `white-space: nowrap` and `width: 1%`.
  - _Requirements: 10.1, 10.2, 10.9_
- [ ] 6.2 `detail.css` special rows: Calibration_Row `tbody` on `--paper-grid`, italic, with `.calibration-label` as a bordered chip; `.unknown` rows with a dashed cell border; `tfoot tr.total` with a `--rule-heavy` Ink top rule, display-font score and grade word, no empty cells; `.mismatch` rows with a `--rule` `--red-ink` border and a text prefix; Source_Link in `--steel-ink` underlined; the points bar as a 0.5rem Ink-outlined bar with an Ink fill and a hatched-by-border fill for the calibration row (no gradient).
  - _Requirements: 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_
- [ ] 6.3 `detail.css` narrow reflow at or below 40rem: each `tr` becomes a boxed record (`display: grid`, two columns; signal cell spanning both, then value and status, then points and source), `td::before { content: attr(data-label) }` in the label font, `tfoot` cells without borders and one `--rule-heavy` border on `.total`, no horizontal scroll at 375 and 320.
  - _Requirements: 10.10, 19.1_
- [ ] 6.4 Update the old tests that Phase 6 invalidates: `css-checks.ts` S4 and S5 (selectors and values changed to the new rules, same intent: no mid-word breaks in short cells, one border in the stacked footer) and the (q), (r), (s) mutations in `sabotage/css.ts` re-pointed at the new text.
  - _Requirements: 22.1, 22.4_
- [ ] 6.5 Checkpoint after Phase 6 - Ensure `npm run typecheck` and `npm test` pass (Properties 1 to 3 green), ask the user if questions arise.

### Phase 7: Detail sheet and Proof

- [ ] 7.1 `dom/h.ts`: add `sheet-tag` to `ClassName` (`tag-hole` and `tag-band` exist). `views/detail.ts`: build the head as `div.sheet-head > [div.sheet-tag[data-grade] > span.tag-hole[aria-hidden], h2#detail-title[tabindex=-1], span.tag-band[aria-hidden]] + Close button`. The `h2` text, id, `tabindex`, the focus call, the Close button, the facts, the Breakdown, the evidence warnings and the Proof section keep their order. Add `src/toetag.sheet.dom.test.ts`: the dialog attributes are unchanged, `h2#detail-title` is inside `.sheet-tag` and is the active element after open, the Close button is outside `.sheet-tag`, the tag band has no text, the grade word appears once in the panel as `.grade-chip` text.
  - _Requirements: 11.1, 11.3, 1.6_
- [ ] 7.2 `detail.css` sheet: Paper panel with a `--rule` Ink left edge, `width: min(100%, 56rem)`, full width at or below 40rem, `overflow-y: auto` (never `hidden` or `clip`), padding `--space-5` (`--space-4` narrow); `.backdrop` as the flat `--scrim` with no filter; `.facts` grid with `minmax(0, …)`; `.score-big` in the display font with mono `/ 100`; `.grade-chip` as a bordered label with its text; evidence warnings list.
  - _Requirements: 11.2, 11.4, 11.5_
- [ ] 7.3 `detail.css` Sheet_Tag shape: Manila tag with Ink edge using the same two-layer chamfer as the Toe_Tag, `max-width: calc(100% - 2rem)`, a 2px Ink string above it, `.tag-hole` at the top, `h2` in the display font (overflow-wrap anywhere), `.tag-band` as a colored bar by `[data-grade]` with no text. No animation yet.
  - _Requirements: 11.3, 19.2_
- [ ] 7.4 `dom/h.ts`: add `proof-compare`, `proof-cell`, `proof-cell-new` to `ClassName`. `views/proof-slot.ts`: in `renderAttempt`, keep the "Shrunk input" block first, then wrap the Old and New `preBlock`s in `div.proof-compare`, giving each block `proof-cell` (the New one also `proof-cell-new`). Labels, `pre.proof-pre`, `tabindex`, order and text unchanged. Add `src/toetag.proofdom.test.ts`: DOM order input, old, new; `.proof-compare` holds exactly the old and new cells; no anchors in `section.proof`; texts equal the counterexample fields.
  - _Requirements: 12.1, 12.5, 12.7, 1.6_
- [ ] 7.5 `detail.css` Proof frame and Stamp: `section.proof` as a Paper box with a `--rule` edge and an Ink caption bar for the `h3` (display font, Paper text); `.proof-badge` as a Stamp (display font, uppercase, `--track-band`, 2px `currentColor` border, `rotate(-2.5deg)`, `max-width: 100%`, `overflow-wrap: anywhere`, padding that survives the tilt); kind colors: counterexample and error `--red-ink`, proved `--steel-ink`, weak Ink text with an amber border, no_call_sites `--ink-soft`; inside `.proof-attempts` the Stamp is 14px and untilted.
  - _Requirements: 12.2, 12.3, 12.4, 12.8_
- [ ] 7.6 `detail.css` Compare_Box and lists: `.proof-compare` as one column with `minmax(0, 1fr)`, two columns from 40rem inside a `--rule` Ink box with a 2px divider; `.proof-cell-new` on `--paper-hot`; captions in the label font; `.proof-pre` with `white-space: pre-wrap`, `overflow-wrap: anywhere`, mono, a `:focus-visible` ring that is not clipped; call sites in mono as plain text (no underline); `.proof-attempts` as an ordered list with a 1px rule between items; `.proof-sites` summary at 44px.
  - _Requirements: 12.5, 12.6, 12.7, 19.1_
- [ ] 7.7 `detail.css` Proof states: the "Exorcism coming" placeholder, the loading line and the unreadable line in `--ink-soft` on Paper; the disabled "Start exorcism" control with the dashed disabled look; confirm `updateProof` replaces only `section.proof` content (existing `proof.update.dom.test.ts` stays green).
  - _Requirements: 12.1, 12.9, 13.3_
- [ ] 7.8 Checkpoint after Phase 7 - Ensure `npm run typecheck` and `npm test` pass (Properties 1 to 3 green), ask the user if questions arise.

### Phase 8: Home, loading, error, empty states and token cleanup

- [ ] 8.1 `graveyard.css` demo cards: `ul.demo-cards` as 2 columns at 375, 4 from 64rem (`minmax(0, 1fr)`), each `.demo-card` a Manila index card with a `--rule` Ink edge and a chamfered top-left corner (pseudo-element layers, button unclipped), name in mono 600, `owner/repo` in `--ink-soft`, blurb in body font, the cached-snapshot line in `--ink-soft`; `min-height: var(--target)`; same visual weight for all four. Extend `ClassName` only if a view needs a new name.
  - _Requirements: 7.2, 19.3_
- [ ] 8.2 `graveyard.css` live form: `.live-form` as a Paper box with a `--rule` edge and an Ink caption bar for its heading, `.field` labels as label-font captions, inputs as Paper-grid fields with a `--rule` edge, `.field-error` in `--red-ink` with its text, the rate-limit hint and notes in `--ink-soft`, the details/summary for the optional ref at 44px. No change to `live-form.ts` unless a caption wrapper is needed (then keep ids, `for`, `aria-*`).
  - _Requirements: 7.3, 7.4, 7.5, 7.6_
- [ ] 8.3 `graveyard.css` loading and error screens: `.status` as a Paper box with a black caption bar, no spinner; `.error` with a `--rule` `--red-ink` left edge and its existing text; the countdown paragraph in mono; Retry and Back buttons at 44px; the wordmark paragraph shown.
  - _Requirements: 8.1, 8.2, 8.3, 8.4_
- [ ] 8.4 `graveyard.css` empty states and notices: the "no dead or dying", "No dependencies found", "No package named …", live-route notice, summary-disagrees notice and "Skipped (n)" `details` as ruled form boxes on the Wall (Paper, `--rule` edge, label-font heading where one exists); zero-Grave groups draw no empty box.
  - _Requirements: 13.1, 13.2_
- [ ] 8.5 Remove the legacy tokens (`--night`, `--soil`, `--stone`, `--moon`, `--mist`, `--ember`, `--lichen`, `--moss`, `--edge`, `--link`, `--font-ui`, `--font-num`) and the legacy `color-scheme: dark`; set `color-scheme: light`; confirm no rule references a removed token (grep) and no color literal remains outside `tokens.css`. Rewrite `theme/theme.test.ts` token assertions to the new token names (grounds, text tokens, focus ring and edge at 3:1, hue rule, font stacks without serif and ending in a generic family, light scheme) while keeping its CSS text checks (motion gating, outline rules, layout safety, nothing remote) as they are.
  - _Requirements: 3.2, 3.3, 3.4, 22.1, 22.3_
- [ ] 8.6 Update `dom/class-vocabulary.test.ts`: the unused-name list becomes empty or lists exactly the names still unused; remove from `ClassName` and from the Stylesheet any class the redesign made unused (`fog`, `btn-quiet` if unused), and delete matching dead CSS. Keep the "polish names" and "tomb-label is gone" tests.
  - _Requirements: 1.7, 22.1_
- [ ] 8.7 Checkpoint after Phase 8 - Ensure `npm run typecheck` and `npm test` pass (Properties 1 to 3 green), ask the user if questions arise.

### Phase 9: The tag swing

- [ ] 9.1 `detail.css`: add, inside `@media (prefers-reduced-motion: no-preference)`, `@keyframes tag-swing` (0, 8, -5, 3, -1.5, 0 degrees), `@keyframes band-stamp`, `.sheet-tag { transform-origin: 50% var(--tag-hole-y); animation: tag-swing var(--swing-duration) ease-out 1 both }` and the Band stamp with a delay of half the swing; outside it, add `@media (prefers-reduced-motion: reduce) { .sheet-tag, .sheet-tag .tag-band { animation: none; transition: none } }`. No `infinite`, no JavaScript.
  - _Requirements: 20.1, 20.2, 20.5_
- [ ] 9.2 Write `src/toetag.swing.dom.test.ts` (jsdom): after `click(tombstone)` with no timers advanced the panel is visible, `document.activeElement` is `h2#detail-title`, `location.hash` has `pkg=`, and one `.sheet-tag` exists; opening another package while open replaces the `.sheet-tag` node; `updateProof` keeps the same `.sheet-tag` node; closing and reopening creates a new one; a static check that `views/detail.ts` and `views/tombstone.ts` contain no `setTimeout`, `requestAnimationFrame` or `animationend`.
  - _Requirements: 20.3, 20.4_
- [ ] 9.3 Checkpoint after Phase 9 - Ensure `npm run typecheck` and `npm test` pass, ask the user if questions arise.

### Phase 10: Guard properties 4 to 8 and sabotage

- [ ] 10.1 Create `src/theme/pairs.ts` (`ColorPair`, `PAIRS`, `DECORATIVE_TOKENS`, `pairRatio`) with the rows of design.md. Write Property 4 in `src/test-support/properties/tt4.ts` and `src/toetag.contrast.test.ts` (Node, `numRuns` 100): for any pair drawn from `PAIRS` the ratio from `tokens.css` is at least `min`; every non-decorative color token appears in a pair; `--focus` equals `--ink`; a table-driven example test prints the computed ratios of design.md; assert the AILING Band uses Ink and links use `--steel-ink`.
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 23.1_
- [ ] 10.2 Extend Property 4 with the Stylesheet scan: no color literal outside `tokens.css`; every `var(--x)` has a definition; no legacy token name; every rule that sets `color` and a background/`background-color` with tokens forms a pair in the registry (rules with only `color` are paired with the nearest registered surface of the selector, listed in `pairs.ts`); `--red` is never a `color:` value; `--steel` is never a `color:` value outside the Band selectors.
  - _Requirements: 3.2, 3.3, 17.5, 17.6_
- [ ] 10.3 Write Property 5 in `src/test-support/properties/tt5.ts` and `src/toetag.banned.test.ts` (Node, over parsed declarations): assertions (a) to (i) of Requirement 18.1, the label-font selector allowlist, and `--tag` as background only on tag selectors. Reuse `theme/css-parse.ts` and `theme/contrast.ts` (`hueOf`, `saturationOf`, `lightnessOf`).
  - _Requirements: 18.1, 18.2, 18.3, 23.1_
- [ ] 10.4 Write Property 6 in `src/test-support/properties/tt6.ts` and `src/toetag.layout.test.ts`: grid track rules, the 2/1/3/4 tag column counts per media query, no width above 343px outside `min-width` queries, the text-bearing class registry with `overflow-wrap: anywhere`, `.proof-pre` `pre-wrap`, `nowrap` allowlist, `min-height: var(--target)` on interactive selectors, the boxed-record rules below 40rem, and the Sheet_Tag `max-width`.
  - _Requirements: 19.2, 19.3, 9.9, 9.12_
- [ ] 10.5 Write Property 7 in `src/test-support/properties/tt7.ts` and `src/toetag.motion.test.ts`: the static declarations (all motion in no-preference, no `infinite`, `tag-swing` max rotation at most 8deg, swing duration `var(--swing-duration)` and iteration 1, the `reduce` block, no ember pulse) plus the DOM part from task 9.2 expressed as a property over generated reports (panel open and focused immediately after the click, no timer needed).
  - _Requirements: 20.2, 20.3, 20.5, 23.1_
- [ ] 10.6 Write Property 8 in `src/test-support/properties/tt8.ts` and `src/toetag.focus.test.ts`: the ring declaration, the two permitted outline removals, no `clip-path`, `mask`, `overflow: hidden|clip` on any focusable selector or ancestor selector, `clip-path` only on `::before`/`::after`, tag grid gap at least `var(--space-4)`, and the `forced-colors` block with `Highlight` and `CanvasText`.
  - _Requirements: 21.1, 21.2, 21.3, 21.4, 23.1_
- [ ] 10.7 Add the text-mutation sabotage lists `src/test-support/sabotage/tt4.ts` to `tt8.ts` with the entries named under Properties 4 to 8 in design.md (use a `replaceOnce` helper that throws on a missing or ambiguous text), each tagged with the property it must break.
  - _Requirements: 23.2, 18.4_
- [ ] 10.8 Extend `src/toetag.sabotage.test.ts` to run P4 to P8 against their lists with seed 20261113: `Sabotage "<name>" stayed green for "<property>"`, non-empty lists, every mutation really changes its input, the real files pass every property. Confirm each of the six Banned_Looks has at least one entry that the property catches.
  - _Requirements: 23.3, 18.4_
- [ ] 10.9 Checkpoint after Phase 10 - Ensure `npm run typecheck` and `npm test` pass, ask the user if questions arise.

### Phase 11: Verification, log and manual browser check

- [ ] 11.1 Run `npm run typecheck`, `npm test` (also once with `CI=1`, and once each with two random seeds), and `npm run build -w @graveyard-kit/exorcist-web`. Confirm: every property runs with `numRuns` 100, `FC_SEED` replays, every sabotage entry fails its property, the existing suites pass with only the Requirement 22 changes, `dist/fonts/` holds the seven woff2 files, the CSP meta is unchanged, and `git status` shows changes only under the paths allowed by Requirement 1.1. Do not commit.
  - _Requirements: 1.1, 1.4, 14.2, 22.2, 24.1_
- [ ] 11.2 Append a dated entry to `docs/kiro-log.md`: the redesign, Properties 1 to 8 with the seeds, the sabotage results, the old tests changed and why (Requirement 22), the font licenses (Special Elite is Apache-2.0, not OFL), the contrast deviations from the mockup (Ink on amber, `--steel-ink`, `--red-ink`, the rust value chosen), the judgment calls of design.md that matter, and a placeholder line "manual browser check: see task 11.3".
  - _Requirements: 24.5_
- [ ] 11.3 Manual browser check by Claude at 1352 by 761 and 375 by 812 (final task). Build and serve the site (`npm run build -w @graveyard-kit/exorcist-web`, then `npx vite preview` from `apps/exorcist-web` or the dev server), drive a real browser, and for each size check and photograph: the home screen (demo cards, scan form); the loading screen and an error screen (a forced 429 or an unreachable API); The Graveyard of the parse-server demo with all four groups and the alive group expanded; one dead tag opened (Sheet_Tag, Form_Grid with the calibration row and total, Proof with a Stamp and a Compare_Box if a counterexample proof exists for that package, otherwise the placeholder); a keyboard Tab pass showing the focus ring on a Toe_Tag; `prefers-reduced-motion: reduce` emulated; `forced-colors: active` if the browser can emulate it. Assert per size: `document.documentElement.scrollWidth <= clientWidth` on every screen (and during the swing), `document.fonts.check` true for the four families, no network request to another origin, the Tag_Swing visible once and absent under reduced motion, targets at least 44px on the Narrow_Viewport, and a side-by-side comparison with `docs/design/toe-tag-mockup-desktop.png` and `-mobile.png`. Write `docs/review/<date>-toe-tag-check.md` with every check as pass, fail or not run and the screenshot paths, fix or report every failure, and replace the placeholder line in `docs/kiro-log.md` with the outcome. If no browser can be driven, report every check as "not run" and say so; do not claim any check that was not run.
  - _Requirements: 19.4, 24.2, 24.3, 24.4, 24.5_

## Task dependency graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.6"] },
    { "id": 2, "tasks": ["1.4", "1.5"] },
    { "id": 3, "tasks": ["1.7"] },
    { "id": 4, "tasks": ["1.8"] },
    { "id": 5, "tasks": ["2.1", "2.3"] },
    { "id": 6, "tasks": ["2.2"] },
    { "id": 7, "tasks": ["2.4", "2.6", "2.8"] },
    { "id": 8, "tasks": ["2.5", "2.7", "2.9"] },
    { "id": 9, "tasks": ["2.10"] },
    { "id": 10, "tasks": ["2.11"] },
    { "id": 11, "tasks": ["3.1"] },
    { "id": 12, "tasks": ["3.2", "3.3", "3.4"] },
    { "id": 13, "tasks": ["3.5"] },
    { "id": 14, "tasks": ["3.6"] },
    { "id": 15, "tasks": ["4.1"] },
    { "id": 16, "tasks": ["4.2", "4.3"] },
    { "id": 17, "tasks": ["4.4"] },
    { "id": 18, "tasks": ["5.1"] },
    { "id": 19, "tasks": ["5.2", "5.3"] },
    { "id": 20, "tasks": ["5.4", "5.5", "5.6"] },
    { "id": 21, "tasks": ["5.7"] },
    { "id": 22, "tasks": ["5.8"] },
    { "id": 23, "tasks": ["6.1"] },
    { "id": 24, "tasks": ["6.2", "6.3"] },
    { "id": 25, "tasks": ["6.4"] },
    { "id": 26, "tasks": ["6.5"] },
    { "id": 27, "tasks": ["7.1", "7.4"] },
    { "id": 28, "tasks": ["7.2", "7.3", "7.5"] },
    { "id": 29, "tasks": ["7.6", "7.7"] },
    { "id": 30, "tasks": ["7.8"] },
    { "id": 31, "tasks": ["8.1", "8.2", "8.3", "8.4"] },
    { "id": 32, "tasks": ["8.5"] },
    { "id": 33, "tasks": ["8.6"] },
    { "id": 34, "tasks": ["8.7"] },
    { "id": 35, "tasks": ["9.1"] },
    { "id": 36, "tasks": ["9.2"] },
    { "id": 37, "tasks": ["9.3"] },
    { "id": 38, "tasks": ["10.1"] },
    { "id": 39, "tasks": ["10.2", "10.3", "10.4", "10.5", "10.6"] },
    { "id": 40, "tasks": ["10.7"] },
    { "id": 41, "tasks": ["10.8"] },
    { "id": 42, "tasks": ["10.9"] },
    { "id": 43, "tasks": ["11.1"] },
    { "id": 44, "tasks": ["11.2"] },
    { "id": 45, "tasks": ["11.3"] }
  ]
}
```

## Notes

- Scope is the presentation of `apps/exorcist-web`. No change to `skeleton/`, the scanner, the API, the controller, the router, the models or the proof harness. Behavior, routes, data and accessibility rules are guarded by the existing suites (unchanged) and by Properties 1 to 3 (written first, green on the unchanged page).
- The mockups are direction only and their sample data is fake. Where the mockup and the rules conflict, the rules win and the deviation is listed: Ink text on the AILING Band (AA), `--steel-ink` links (AA), `--red-ink` text (AA), plain-text call sites (proof-harness 14.4), a boxed-record Form_Grid and a stacked Compare_Box at 375 (real content length), and a modal sheet instead of inline boxes (focus and `inert` behavior).
- Special Elite is Apache-2.0, not SIL OFL; the other three families are SIL OFL 1.1. All four are served from `public/fonts/` with their license texts; the CSP is unchanged.
- Tests perform zero network requests. DOM tests carry `// @vitest-environment jsdom`; CSS and font tests run in Node. jsdom has no layout, so the real 375px, focus ring, swing and font rendering checks are task 11.3.
- Properties use `numRuns: 100` and the existing seed policy (`FC_SEED` wins, `CI` fixes 20261113, otherwise a random seed recorded on failure). Per `proof-rules.md`, every property has a sabotage list that the central test runs.
- Existing tests are changed only where they pin the old look (Requirement 22.1): `theme/theme.test.ts`, `test-support/css-checks.ts` S1/S3/S4/S5/S7, `test-support/sabotage/css.ts` and its name list, and `dom/class-vocabulary.test.ts`.
