# Requirements Document

## Introduction

The Toe Tag redesign replaces the whole visual layer of the Graveyard_Page (`apps/exorcist-web`) with the direction the owner chose on 2026-11-13 and wrote down in `docs/design/toe-tag.md`, with two static mockups (`toe-tag-mockup-desktop.png`, 1352 wide, and `toe-tag-mockup-mobile.png`, 375 wide). The mockups are for direction only; their sample data is fake. The page keeps rendering the real Scan_Report and the real Proof_Report.

The concept: every package is a morgue toe tag hanging by a string on a cool institutional-gray wall. Status is the colored band at the bottom of the tag (red DEAD, rust-brown DYING, amber AILING, steel-blue ALIVE). The Breakdown is a government death-certificate grid with tiny typewriter labels over mono values. The Proof is an examiner's finding with a rubber stamp.

This is a presentation change. It touches CSS, the DOM structure of presentation-only wrappers and labels, a few copy constants, fonts and tests. It does not change any behavior, route, data value, accessibility rule, API, skeleton module, scanner, death-score engine or proof harness. Everything graveyard-ui, graveyard-ui-polish and proof-harness say about what the page shows and does stays true; this spec only says how it looks and proves that nothing else moved.

Facts checked in the repository while writing this spec (they shape the requirements):

- The current theme is the Night_Theme: dark grounds, ember glow, system fonts. Its tests pin the old look: `theme/theme.test.ts` (dark scheme, background lightness below 25%, old token names, 18px at 1200px and 56px recording sizes), `test-support/css-checks.ts` S3 (arched dead tombstone) and S7 (18px and 56px), and the literal-text CSS sabotages in `test-support/sabotage/css.ts`.
- Fonts: no web font is loaded today. The build CSP is `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; ...`. It has no `font-src`, so fonts fall back to `default-src 'self'`; same-origin woff2 files load, remote fonts do not.
- Vite serves `apps/exorcist-web/public/` at `/` in dev and copies it to `dist/` in the build, so `public/fonts/*.woff2` is available at `/fonts/*.woff2` without a config change.
- The points bar uses `element.style.width` (CSSOM, allowed under `style-src 'self'`); header count buttons use `element.style.borderTopColor` with token values.
- The Detail_Panel rebuilds its content on every `open()` (`panel.replaceChildren(...)`), and `updateProof` replaces only the content of `section.proof`. A CSS animation on an element inside the panel therefore plays once per open and not on a proof update.
- Proof_Section text is rendered with `textContent` only and creates no link from a report string (proof-harness Requirement 14.4). The mockups underline the call sites as links; this spec keeps them as text.
- Contrast was computed while writing this spec with the WCAG formula (see design.md). Two mockup choices fail AA as drawn: white text on the amber band (3.25:1) and the steel-blue accent as text on the gray wall (4.46:1). Requirements 17 and 9 fix them with ink text on amber and a darker `--steel-ink` for links.
- **Special Elite is licensed under Apache-2.0, not SIL OFL** (the font file's own copyright string and the Fontsource record both say so). Barlow Condensed and IBM Plex Sans and Mono are SIL OFL 1.1. Requirement 4 ships the correct license text for each.
- There is no `proofReportArb` in the test support yet; the preservation property for the Proof needs one.

Behavioral decisions fixed here so design does not have to guess:

- The Detail_Panel stays a modal dialog (focus trap, `inert`, Escape). The mockups draw the Breakdown and the Proof as two boxes under the tags; the redesign draws the same two boxes inside the sheet.
- The "group tabs" of the mockup are the existing four count controls (buttons that move focus to a group). They are not a `tablist`, they do not filter, and no behavior is added.
- The Tag_Swing plays on the tag header of the Detail_Panel, because the clicked tag is covered by the sheet on narrow screens and alive tags do not exist before the group is expanded.
- Call sites in the Proof stay plain text.

## Glossary

- **Toe_Tag_Ui**: the redesigned presentation layer specified here.
- **Graveyard_Page**: the Vite + TypeScript page in `apps/exorcist-web`.
- **Scan_Report**, **Proof_Report**: the existing parsed report types (`parseReport`, `parseProofReport`), unchanged.
- **Wall**: the page ground, a cool gray-green (`--wall`) with faint ruled lines.
- **Paper**: the light surface (`--paper`) of the Breakdown, the Proof, the sheet and forms.
- **Manila**: the tag color (`--tag`). Used for tag objects only.
- **Ink**: the near-black text and rule color (`--ink`).
- **Toe_Tag**: the shaped button that stands for one Grave: chamfered top corners, a punched hole, a string, three Tag_Fields and a Band. It replaces the Tombstone's look; the element is still `button.tombstone`.
- **Tag_Field**: one labelled row of a Toe_Tag: PACKAGE, SCORE or CAUSE.
- **Tag_Label**: the tiny typewriter caption of a Tag_Field. Decorative (`aria-hidden`).
- **Band**: the colored strip at the bottom of a Toe_Tag (and of the Sheet_Tag) that carries the grade word.
- **Form_Grid**: the Breakdown table drawn as a gridded form: 2px outer rule, 1px grid lines, black caption bar, typewriter column labels, mono values.
- **Stamp**: the rubber-stamp look of the Proof badge (`span.proof-badge`), slightly tilted.
- **Compare_Box**: the boxed two-cell OLD OUTPUT | NEW OUTPUT block of a counterexample; the new cell is tinted.
- **Sheet_Tag**: the tag-shaped header of the Detail_Panel that contains the package heading.
- **Tag_Swing**: the one-time swing of the Sheet_Tag when the Detail_Panel opens.
- **Token_File**: `apps/exorcist-web/src/styles/tokens.css`, the only place that holds colors, font stacks, sizes, spacing, rules and durations.
- **Pair_Registry**: the single list (`theme/pairs.ts`) of every text/background and boundary/background pair the Stylesheet uses, with its minimum contrast ratio.
- **Banned_Look**: one of the six looks in `.kiro/steering/graveyard-ui.md` that the page must never have.
- **Fact_Hooks**: the stable classes and attributes the preservation property reads: `button.tombstone[data-key][data-grade]`, `.tomb-name`, `.tomb-score`, `.tomb-summary`, `.tomb-badge`, `ul.counts button[data-grade] .num`, `table.breakdown` with `td[data-label]`, `tfoot tr.total`, `section.proof` with `.proof-badge`, `.proof-pre`, `.proof-sites`, `.proof-attempts`. The redesign keeps all of them.
- **Reference_Views**: frozen byte copies of the current post-polish views under `src/__reference__/views-v2/` (tombstone, breakdown, header, proof-slot), test-only.
- **Rendered_Facts**: what the page shows about a report, read through the Fact_Hooks only (`toe-facts.ts`).
- **Narrow_Viewport**: 375 by 812 CSS pixels (and down to 320 wide).
- **Desktop_Viewport**: 1352 by 761 CSS pixels, the width of the desktop mockup.
- **Reduced_Motion**: the `prefers-reduced-motion: reduce` user setting.
- **Fast_Check_Runner**: the existing seed policy (`FC_SEED` wins, `CI` fixes seed 20261113, otherwise a random seed is recorded on failure); `numRuns` is 100.

## Requirements

### Requirement 1: Scope, packages and reuse

**User Story:** As a maintainer, I want the redesign confined to the web app's presentation, so that no behavior or shared module moves.

#### Acceptance Criteria

1. THE Toe_Tag_Ui SHALL change only files under `apps/exorcist-web/`, `.kiro/steering/graveyard-ui.md`, `.kiro/specs/toe-tag-redesign/`, `docs/kiro-log.md` and `docs/review/`; it SHALL NOT change `skeleton/`, `apps/exorcist-npm/`, `demo/`, `mcp/`, `power/` or the root `package.json`.
2. THE Toe_Tag_Ui SHALL add no runtime dependency, no UI framework, no CSS framework, no icon font and no image file; the only new binary assets SHALL be the woff2 files of Requirement 4.
3. THE Toe_Tag_Ui SHALL load nothing remote: no remote font, style, script, image or analytics, no `@import`, and no `url(` that starts with `http:`, `https:` or `//`.
4. THE Toe_Tag_Ui SHALL leave the build CSP in `vite.config.ts` byte-for-byte unchanged; fonts SHALL load under `default-src 'self'`.
5. THE Toe_Tag_Ui SHALL make zero LLM calls and zero network requests in tests.
6. THE Toe_Tag_Ui SHALL change DOM structure only by adding presentation wrappers and decorative elements (`aria-hidden="true"`, no text a screen reader needs), by moving an existing element inside a new wrapper, or by changing the order of elements that the accessible name and description do not depend on; every change SHALL keep the Fact_Hooks.
7. THE Toe_Tag_Ui SHALL keep the closed `ClassName` vocabulary of `dom/h.ts`: every class a view writes SHALL be in `ClassName`, and every added name SHALL be used by a view or by the Stylesheet.

### Requirement 2: Steering file

**User Story:** As a maintainer, I want the design rules written once where Kiro reads them whenever the web app is edited, so that later changes cannot drift into a banned look.

#### Acceptance Criteria

1. THE Toe_Tag_Ui SHALL add `.kiro/steering/graveyard-ui.md` with front matter `inclusion: fileMatch` and `fileMatchPattern: "apps/exorcist-web/**"`.
2. THE steering file SHALL hold, in this order: the concept in three sentences; the design tokens (every token of the Token_File with its value and role); the type scale; the component rules (Toe_Tag, Band, Form_Grid, Stamp, Compare_Box, Sheet_Tag, controls, notices, focus ring, motion); and the BANNED looks list.
3. THE BANNED looks list SHALL name exactly these six looks, each with one line saying how the page avoids it: (1) a dark background with glowing or neon accents; (2) cream or ivory paper with a serif display headline and a rust, terracotta or orange accent; (3) purple gradients; (4) glassmorphism; (5) generic SaaS cards; (6) white with one blue accent and hairline borders.
4. THE steering file SHALL state that Manila is allowed on Toe_Tag objects only and never as a page or panel ground, that the DYING rust-brown is a status shade and not a brand or interaction color, and that Special Elite is for tiny field labels only.
5. THE steering file SHALL NOT contradict `tech.md` (no generic purple gradients, no cream/serif look) and SHALL NOT edit any other steering file.

### Requirement 3: Tokens in one file

**User Story:** As a maintainer, I want every design value in one place, so that a change of color or size is one edit and the contrast test sees every color.

#### Acceptance Criteria

1. THE Token_File SHALL define as CSS custom properties on `:root`: all colors (Requirement 17 list), the four font stacks, the type scale, tracking, spacing, rule widths, the radius, the focus ring width and offset, the tag geometry (chamfer, hole, string) and the motion durations.
2. THE rest of the Stylesheet (`base.css`, `graveyard.css`, `detail.css`, `fonts.css`) SHALL contain no color literal (`#rgb`, `#rrggbb`, `rgb(`, `rgba(`, `hsl(`, a named color other than `transparent`, `currentColor`, `inherit`, `Canvas`, `CanvasText`, `Highlight`), no font-family literal outside `fonts.css` and no `font-size` literal outside the Token_File and `html`; they SHALL use `var(--token)`.
3. THE Token_File SHALL contain no legacy Night_Theme token (`--night`, `--soil`, `--stone`, `--moon`, `--mist`, `--ember`, `--lichen`, `--moss`, `--edge`, `--link`, `--font-ui`, `--font-num`) and no rule in the Stylesheet SHALL reference one.
4. THE Token_File SHALL declare `color-scheme: light` and SHALL declare `--target: 44px`.

### Requirement 4: Self-hosted fonts and licenses

**User Story:** As a maintainer, I want the four typefaces served from our own origin with their licenses, so that the CSP stays strict and the license terms are met.

#### Acceptance Criteria

1. THE Toe_Tag_Ui SHALL place woff2 files under `apps/exorcist-web/public/fonts/` for: Barlow Condensed 600 and 700; IBM Plex Sans 400 and 600; IBM Plex Mono 400 and 600; Special Elite 400; Latin subset, normal style.
2. THE woff2 files SHALL be copied from the published Fontsource packages of those families (`@fontsource/*`) obtained with `npm pack` in a temporary directory; no Fontsource package SHALL be added to any `package.json`.
3. THE fonts directory SHALL contain a `licenses/` folder with the full license text of each family, copied from the package or upstream repository and not retyped: SIL Open Font License 1.1 for Barlow Condensed (The Barlow Project Authors), IBM Plex Sans and IBM Plex Mono (IBM Corp.), and the Apache License 2.0 with the copyright line "Copyright (c) 2010 by Brian J. Bonislawsky DBA Astigmatic (AOETI)" for Special Elite.
4. THE fonts directory SHALL contain a `README.md` that lists, for every file, the family, weight, source package and version, and the SHA-256 of the file, and says which license applies to which family.
5. THE Stylesheet SHALL declare the fonts in `src/styles/fonts.css` with `@font-face`, `font-display: swap`, a `src: url("/fonts/<file>.woff2") format("woff2")` pointing at an existing file, and a Latin `unicode-range`; the file SHALL be imported by `main.ts` before the other stylesheets.
6. THE four font stacks SHALL end with a generic family and SHALL contain no serif family (Requirement 18): display `"Barlow Condensed", "Arial Narrow", sans-serif`; body `"IBM Plex Sans", system-ui, sans-serif`; mono `"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace`; label `"Special Elite", "Courier New", monospace`.
7. THE total size of the woff2 files SHALL be at most 300 KB.
8. WHEN a glyph is outside the Latin subset (for example a non-Latin package name), THE page SHALL fall back to the generic family of the stack and SHALL NOT break the layout.

### Requirement 5: Type scale and font roles

**User Story:** As a viewer, I want the type to look like a form from an institutional office and still be readable, so that the direction reads at a glance and the numbers are easy to scan.

#### Acceptance Criteria

1. THE display font (Barlow Condensed, uppercase, tracked) SHALL be used for the wordmark, `h1`, `h2`, `h3`, the group headings, the tag score, the Band word and the Stamp.
2. THE body font (IBM Plex Sans) SHALL be used for prose, explanations, notices, form help text and button text.
3. THE mono font (IBM Plex Mono) SHALL be used for package names, versions, scores outside the tag score, raw values, points, seeds, runs, call sites, outputs and code.
4. THE label font (Special Elite) SHALL be used only for Tag_Labels, Form_Grid column labels, the stacked-row labels of the Form_Grid, Compare_Box captions and the masthead subtitle, at 0.75rem to 0.8125rem, uppercase, tracked; it SHALL NOT be used for any `h1`, `h2`, `h3`, the wordmark or running text.
5. THE root font size SHALL be 16px at every width; the base text size SHALL be 1rem; no label SHALL be smaller than 0.75rem (12px).
6. THE tag score SHALL be at least 56px on a dead Toe_Tag, at least 44px on a dying one and at least 28px on an ailing or alive one, and a package name on a dead Toe_Tag SHALL be at least 17px.

### Requirement 6: Wall, masthead and group tabs

**User Story:** As a visitor, I want the first screen to look like one office form on a gray wall with a clear header, so that I know where I am and how many packages are in each state.

#### Acceptance Criteria

1. THE Wall SHALL be the page background: flat `--wall` with faint horizontal ruled lines made by one `repeating-linear-gradient` on `body` in the decorative `--wall-rule` color; it SHALL carry no other gradient, image, glow, blur or shadow.
2. THE Summary_Header SHALL show a masthead: the wordmark `PRODUCT_NAME` in the display font at 2.5rem to 3.5rem (`clamp`), a typewriter subtitle, and the existing meta line (source label, ref, scan time, totals) unchanged in text; THE masthead SHALL be closed by a 2px Ink rule.
3. THE masthead SHALL keep the `h1` with the text `SCREEN_NAME: <repo>`, `tabindex="-1"`, as the first heading of the screen; the wordmark SHALL be a `p`, not a heading.
4. THE four count controls SHALL be drawn as stamped tabs in one row: each shows the count and the grade label, has a minimum height and width of 44px, an Ink 2px bottom rule in the grade color (red, rust, amber, steel), and keeps its `aria-label`, its `data-grade`, its click behavior and its tab order.
5. THE legend, the warnings list, the ranges-only note and the summary-disagrees notice SHALL keep their text and roles and SHALL be styled as typewriter notes on the Wall, with at least 4.5:1 contrast.
6. THE skip link SHALL stay the first focusable element of the screen and SHALL be a Paper box with a 2px Ink rule when focused.
7. AT the Desktop_Viewport, THE masthead and the group tabs SHALL fit in at most 200 CSS pixels of height for a report without warnings.
8. AT the Narrow_Viewport, THE masthead SHALL stack (wordmark, subtitle, meta line) and the four tabs SHALL wrap into a 2 by 2 grid or one wrapping row without horizontal scroll.

### Requirement 7: Home - demo cards and scan form

**User Story:** As a visitor, I want the home screen to look like an intake desk, with the ready-made demos first and the live form second, so that the demo opens in one click.

#### Acceptance Criteria

1. WHEN the Route is `picker`, THE Repo_Picker SHALL show the same elements in the same order as today (heading, intro, "Open a demo" with the four Demo_Repo cards, then the Live_Scan_Form); only presentation changes.
2. EACH Demo_Repo card SHALL be a native button drawn as a Manila index card with a 2px Ink rule, a chamfered top-left corner, the demo name in mono, the `owner/repo` in Ink-soft, the blurb and the cached-snapshot line, and SHALL be at least 44px high; the four cards SHALL be laid out two across at the Narrow_Viewport and four across at the Desktop_Viewport, with equal visual weight.
3. THE Live_Scan_Form SHALL be a Paper form box with a 2px Ink rule and a black caption bar; field labels SHALL be Tag_Label-style typewriter captions above the inputs; inputs SHALL be Paper-grid fields with a 2px Ink rule and at least 44px height.
4. THE submit button, the Cancel button and the `aria-disabled` state SHALL keep their behavior; an `aria-disabled` control SHALL look disabled by a dashed border, a Paper-grid face and Ink-soft text with at least 4.5:1 contrast, not by opacity.
5. THE inline field errors SHALL keep `aria-invalid` and `aria-describedby` and SHALL be drawn in `--red-ink` on Paper with a text marker ("Error:" or the existing wording), not by color alone.
6. THE rate-limit hint, the public-only line and the two-files line SHALL keep their text.

### Requirement 8: Loading and error states

**User Story:** As a visitor, I want a failed or slow scan to read as an official notice with a next action, so that a rate limit never looks like a broken page.

#### Acceptance Criteria

1. THE loading screen SHALL keep its `h1`, its `role="status"` region, its text and its Cancel button; it SHALL be drawn as a Paper box with a black caption bar and an Ink 2px rule, with no spinner image; any activity indicator SHALL be static text.
2. THE error screen SHALL keep its `h1`, its `role="alert"` region, the server message, the parse detail, Retry and "Back to repos"; the alert SHALL be a Paper box with a 2px `--red-ink` rule on its left side and a text label that names the failure, so that it is not conveyed by color alone.
3. THE rate-limit countdown and the end-of-countdown status SHALL keep their text, their `aria-hidden` countdown and their single `role="status"` announcement.
4. THE loading and error screens SHALL show the wordmark paragraph and SHALL fit the Narrow_Viewport without horizontal scroll.

### Requirement 9: The Graveyard and Toe Tags

**User Story:** As a visitor, I want each package to be a tag I can read in a second, with the status as a colored band, so that the dead ones are impossible to miss.

#### Acceptance Criteria

1. THE Graveyard SHALL keep four group sections in Grade_Order, each with its `h2`, its count, its list and the lazily created alive group; only presentation changes.
2. EACH Toe_Tag SHALL remain one native `button.tombstone` per Grave with the same `id`, `data-key`, `data-grade`, `title`, `aria-label` ("<name>, <grade>, score <n> of 100"), `aria-describedby` and description text.
3. EACH Toe_Tag SHALL contain, in this DOM order: a decorative punched hole; the PACKAGE Tag_Field (Tag_Label, then `.tomb-name`); the SCORE Tag_Field (Tag_Label, then `.tomb-score` with its existing `aria-hidden` number and visually hidden score text); the CAUSE Tag_Field (Tag_Label, then `.tomb-summary`); the Band (the `.tomb-grade` word, then either the `.tomb-badge` "n unknown" or the grade's score range as decorative text); and the visually hidden description.
4. THE Tag_Labels SHALL read PACKAGE, SCORE and CAUSE, SHALL be `aria-hidden="true"`, SHALL come from one constant, and SHALL NOT equal a grade word.
5. THE Toe_Tag shape SHALL be drawn on background layers, not on the button: a manila face inside a 2px Ink edge, with the top corners chamfered by `clip-path` on two pseudo-elements; the button itself SHALL NOT be clipped (Requirement 21).
6. THE string SHALL be a 2px Ink line above each tag, drawn on the list item, ending at the hole; the hole SHALL be a 0.875rem circle with a 2px Ink border showing the Wall.
7. THE Band SHALL be filled with the grade color: red (dead), rust-brown (dying), amber (ailing), steel-blue (alive); its text SHALL be white on red, rust and steel and Ink on amber; the Band word SHALL be the display font, uppercase, tracked, 1.25rem.
8. THE sizes SHALL be: dead Toe_Tags with the largest score (Requirement 5.6) and a minimum height of 15rem; dying Toe_Tags at standard size (minimum height 13rem); ailing and alive Toe_Tags compact (all three Tag_Fields kept, smaller score, minimum height 9rem); the order of Graves SHALL NOT change.
9. THE tag grid SHALL be two across at the Narrow_Viewport, three across from 48rem and four across from 64rem, with `minmax(0, 1fr)` tracks; below 22.5rem (360px) it SHALL be one across.
10. WHEN a Toe_Tag is hovered or pressed, THE tag SHALL change by an Ink-colored edge thickening or an offset hard shadow (no blur) and SHALL NOT move or scale.
11. THE group headings SHALL be drawn as stamped labels (display font, uppercase, 2px Ink bottom rule) with the count in mono; the alive disclosure button, the "Skipped (n)" disclosure and the "Skip to the dead packages" link SHALL keep their behavior.
12. A report string longer than the tag SHALL wrap inside its Tag_Field (`overflow-wrap: anywhere`) and SHALL NOT widen the tag or the page.

### Requirement 10: Breakdown Form_Grid

**User Story:** As a visitor, I want the breakdown to look like a filled-in certificate whose rows visibly add up, so that the score is never a black box.

#### Acceptance Criteria

1. THE Breakdown SHALL stay one semantic `table.breakdown` with a caption, `th scope` cells, `tbody` rows, a separate `tbody` for the Calibration_Row and a `tfoot` Total_Row, and the same cells, `data-label` values and text as today.
2. THE Form_Grid SHALL be drawn with a 2px Ink outer rule, 1px Ink grid lines between cells, the caption as a black bar with Paper text in the display font, the column header cells as typewriter labels on a Paper-grid row, and values in the mono font.
3. THE Calibration_Row SHALL be shaded (`--paper-grid`), italic, and carry its "Declared abandoned" label chip and the text "Declared abandoned: <reason>, +<points>" unchanged; it SHALL stay distinct by label and shading, not by color alone.
4. THE Unknown_Row SHALL keep the word "Unknown", the marker, the source, the category, the message and the explanation, and SHALL be drawn with a dashed Ink cell border in addition to its text.
5. THE Total_Row SHALL be a heavy bottom cell: 3px Ink top rule, display font score "<n> / 100" and the grade word, with no empty cells.
6. THE "Breakdown does not add up" row and the grade-mismatch notice SHALL keep their text and SHALL be drawn with a 2px `--red-ink` border and a text prefix.
7. THE points bar SHALL stay `aria-hidden` and SHALL be a 0.5rem Ink-outlined bar with an Ink fill (a hatched fill for the Calibration_Row), so that the "n / m" text still carries the value.
8. THE Source_Link SHALL be drawn in `--steel-ink`, underlined, with the same `href`, `target`, `rel` and accessible name as today; the "Source link withheld" and "No source recorded" texts SHALL be unchanged.
9. THE short cells (`.col-value`, `.col-status`, `.col-points`, `.col-source`) SHALL keep `overflow-wrap: normal` and `word-break: normal`, and `.col-signal` SHALL keep `overflow-wrap: anywhere`.
10. AT or below 40rem, THE Form_Grid SHALL reflow to one boxed record per row: the signal cell on top, then two columns for value and status and for points and source, each cell captioned by its `data-label` in the label font, with no horizontal scroll at 375 and 320 pixels.

### Requirement 11: Detail panel and Sheet_Tag

**User Story:** As a visitor, I want the panel to look like the examiner's file for one tag, so that the click feels like opening the file.

#### Acceptance Criteria

1. THE Detail_Panel SHALL keep `role="dialog"`, `aria-modal="true"`, `aria-labelledby="detail-title"`, the focus move to `h2#detail-title`, the Tab trap, Escape, the Close button and the backdrop button, and the `inert`/`aria-hidden` handling.
2. THE sheet SHALL be a Paper panel with a 2px Ink rule on its left edge, full width at or below 40rem and `min(100%, 56rem)` above; THE backdrop SHALL be a flat translucent Ink scrim with no `backdrop-filter`.
3. THE panel head SHALL contain a Sheet_Tag: a Manila tag shape holding the `h2#detail-title` (package name), a decorative hole, a decorative string, and a decorative Band in the grade color; THE Close button SHALL stay outside the Sheet_Tag and SHALL NOT move.
4. THE facts block (Death score, Version, Dependency kinds, Replacement), the evidence warnings list, the Breakdown and the Proof section SHALL keep their text and order; the score SHALL be drawn in the display font with the "/ 100" in mono, and the grade chip SHALL be drawn as a bordered label with its text.
5. THE sheet SHALL scroll inside itself and SHALL cause no horizontal scroll at the Narrow_Viewport.

### Requirement 12: Proof section - Stamp and Compare_Box

**User Story:** As a visitor, I want the proof to read like an examiner's finding with a stamp, so that the verdict is clear before I read the evidence.

#### Acceptance Criteria

1. THE Proof section SHALL keep its `section.proof`, its `h3` "Proof", its loading line, its "Exorcism coming" placeholder with the `aria-disabled` control, its unreadable line, its badge, runs and seed line, sabotage line, recommendation, call-site `details`, "Attempts" list and counterexample blocks, in the same DOM order and with the same text.
2. THE Proof section head SHALL be a black caption bar (display font, Paper text) over a Paper body with a 2px Ink rule.
3. THE badge of the loaded Proof_Report SHALL be a Stamp: display font, uppercase, tracked, 2px border, tilted by at most 3 degrees, with a text-colored border and ink: COUNTEREXAMPLE and ERROR in `--red-ink`; PROVED in `--steel-ink`; WEAK PROOF in Ink with an amber border; NO CALL SITES in Ink-soft; the label text SHALL be the existing `badgeLabel`, and the Stamp's text SHALL have at least 4.5:1 contrast on Paper.
4. THE Stamp SHALL NOT clip when tilted, SHALL wrap inside its box at the Narrow_Viewport, and SHALL be static (the tilt is not an animation).
5. FOR a counterexample attempt, THE Compare_Box SHALL show, in DOM order, the "Shrunk input" block, then the OLD OUTPUT cell, then the NEW OUTPUT cell; the NEW OUTPUT cell SHALL be tinted `--paper-hot`; all three SHALL be `pre.proof-pre` blocks with `tabindex="0"`, `white-space: pre-wrap` and `overflow-wrap: anywhere`.
6. AT or above 40rem, THE OLD and NEW cells SHALL be side by side in one boxed row with a 2px Ink rule; below 40rem they SHALL stack.
7. THE call sites SHALL stay plain mono text (`file:line (enclosing)`), SHALL NOT be links, and the "and <n> more" line SHALL stay.
8. THE attempts SHALL stay an ordered list; each attempt's inline badge SHALL be a smaller untilted Stamp.
9. WHEN a proof arrives after the panel opened, THE Detail_Panel SHALL replace only the Proof section content; THE Tag_Swing SHALL NOT replay, focus SHALL NOT move and the scroll position SHALL NOT change.

### Requirement 13: Empty states

**User Story:** As a visitor, I want a screen with nothing to show to say so plainly in the same visual language, so that an empty result never looks broken.

#### Acceptance Criteria

1. THE "no dead or dying packages" message, the "No dependencies found" message, the "No package named <name> in this scan" notice, the live-route "not re-run on reload" notice, the summary-disagrees notice and the "Skipped (n)" disclosure SHALL keep their text and roles and SHALL be drawn as ruled form boxes on the Wall (Paper, 2px Ink rule, typewriter heading).
2. WHEN a group has zero Graves, THE group SHALL keep its heading and count and no empty grid box SHALL be drawn.
3. THE Proof placeholder, loading line and unreadable line SHALL be drawn inside the Proof body in Ink-soft with at least 4.5:1 contrast.
4. THE alive group SHALL stay collapsed behind its disclosure button, drawn as a Paper bar with a 2px Ink rule, 44px high, with `aria-expanded` unchanged.

### Requirement 14: Behavior, routes and accessibility preserved

**User Story:** As a maintainer, I want proof that the redesign changed nothing but the look, so that I can ship it without re-testing every flow by hand.

#### Acceptance Criteria

1. THE Graveyard_Page SHALL keep every route, every controller phase, every request, every error mapping, every focus move, every `aria-*` attribute, every keyboard interaction, every announced status and every `document.title` it has today.
2. THE existing suites SHALL pass unchanged in assertions, except the files and cases listed in Requirement 22: `alive.dom`, `detail.dom`, `keyboard.dom`, `links.dom`, `polish.*`, `proof.*.dom`, `states.dom`, `unknown.dom`, `router.*`, `errors.*`, `client.*`, `repo-input.*`, `safety`, `smoke`, `vite-config`, `fixtures`, `sabotage`.
3. THE Graveyard_Page SHALL keep the three "no forbidden API" rules (no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`, `new Function`, `setAttribute("on…`) and SHALL create no element attribute that holds a URL from a report string.
4. THE Graveyard_Page SHALL keep every interactive element a native `button`, `a`, `input` or `summary`, and every new decorative element SHALL be a non-interactive `span` or `div` with `aria-hidden="true"`.
5. THE Graveyard_Page SHALL honour Reduced_Motion everywhere (Requirement 20) and SHALL keep `forced-colors: active` borders visible (Requirement 21).

### Requirement 15: Scan_Report data preserved (Property 1)

**User Story:** As a maintainer, I want a property over generated reports showing the same packages, scores, grades and breakdown points before and after, so that no number moved.

#### Acceptance Criteria

1. THE test suite SHALL include a fast-check property (Property 1) over generated Scan_Reports (the existing `scanReportArb`, 0 to 60 dependencies, with calibrated, unknown-signal, dying, colliding-name and hostile-string packages) that mounts the page, expands the alive group, opens one generated package, and asserts that the Rendered_Facts of the redesigned page deep-equal the Rendered_Facts of the Reference_Views and deep-equal the facts computed from the report.
2. THE Rendered_Facts SHALL cover: the header counts and total; the meta line text; the legend text; the warnings; per Toe_Tag the key, the grade, the accessible name, the name text, the score text, the cause text and the unknown badge text; per group the keys in order; for the open package every Breakdown row (label, explanation, value, status, points, source text and `href` or withheld text), the Calibration_Row text, the Total_Row and any mismatch row; and the skipped list.
3. THE property SHALL run with `numRuns` 100 and the Fast_Check_Runner seed policy, and SHALL print the seed and the shrunk report on failure.
4. THE suite SHALL also parse the four `/demo/*.json` files with `parseReport` and assert the same equality on each, without hard-coded counts.
5. THE property SHALL be written and run green against the unchanged views before any view or stylesheet change (a baseline), and SHALL stay green after every phase.

### Requirement 16: Proof_Report data preserved (Property 2)

**User Story:** As a maintainer, I want the same property for the Proof, so that every status and every counterexample is still shown exactly.

#### Acceptance Criteria

1. THE test suite SHALL add `proofReportArb` (the five kinds `proved`, `weak`, `counterexample`, `no_call_sites`, `error`; 0 to 80 call sites; 1 to 3 attempts; multi-line, unicode and hostile strings in every free-text field; counterexamples with arbitrary shrunk input and outputs) built with the existing `build-proof-report.ts` builders and the real `serializeProofReport`.
2. THE test suite SHALL include a fast-check property (Property 2) that mounts a dead package whose proof is served from a fake fetch, waits for the proof, and asserts that the Proof facts of the redesigned page deep-equal those of the Reference_Views proof renderer and deep-equal the facts computed from the report through the skeleton's proof view.
3. THE Proof facts SHALL cover: the badge label; the runs and seed line; the sabotage line; the recommendation; the call-site texts in order, the first 50 and the "and <n> more" line; per attempt the number, the badge label, the candidate name, the runs and seed line, the sabotage line and the error text; and per counterexample the shrunk input, the old output and the new output, byte for byte.
4. THE property SHALL also cover the placeholder facts for the proof states `absent`, `failed` and `invalid` ("Exorcism coming", and the unreadable line for `invalid`).
5. THE suite SHALL render every file under `demo/proofs/**/*.json` that parses and assert the same equality, without hard-coded values.
6. THE property SHALL run with `numRuns` 100, the Fast_Check_Runner seed policy, the baseline-first rule of Requirement 15.5.

### Requirement 17: WCAG AA contrast from the tokens (Property 4)

**User Story:** As a user with low vision, I want every text, border and focus ring to meet WCAG AA on the surface it sits on, so that the gray-and-manila look stays readable.

#### Acceptance Criteria

1. THE Token_File SHALL define these colors and no other: `--wall #C9CFCB`, `--wall-rule #BCC3BF` (decorative), `--tag #E9D4A3`, `--paper #F1F2EE`, `--paper-grid #E3E6E1`, `--paper-hot #F6DEDA`, `--ink #1B2328`, `--ink-soft #3B474D`, `--red #C4271D`, `--red-ink #A81F16`, `--steel #2F5D7C`, `--steel-ink #264A66`, `--amber #B8860B`, `--rust` (the DYING brown, chosen at implementation to pass the pair below), `--on-band #FFFFFF`, `--scrim` (decorative), `--focus` (equal to `--ink`).
2. THE Pair_Registry SHALL list every pair the Stylesheet uses, and a test SHALL compute each ratio from the Token_File values and assert at least 4.5:1 for text under 24px (or 19px bold), 3:1 for text at or above that size, for the focus ring and for component edges. The registry SHALL include at least: Ink, Ink-soft, Steel-ink and Red-ink text on Wall, Manila, Paper, Paper-grid and Paper-hot where used; `--on-band` on Red, Rust and Steel; Ink on Amber; Paper on Ink (caption bars); Ink edge on Wall (3:1); focus ring on Wall, Manila and Paper (3:1).
3. EVERY color token other than the decorative ones (`--wall-rule`, `--scrim`) SHALL appear in the Pair_Registry, and a test SHALL fail when a color token is in neither the registry nor the decorative list.
4. THE amber Band SHALL carry Ink text (at least 4.5:1) and not white text.
5. Steel-blue text on the Wall or Manila SHALL use `--steel-ink`, not `--steel`.
6. Red text SHALL use `--red-ink`, not `--red`; `--red` SHALL be used for fills, borders of 3px or more, and the Stamp border only.
7. THE test SHALL be a fast-check property over the Pair_Registry (Property 4) with `numRuns` 100 and SHALL be accompanied by a table-driven example test with the computed ratios.

### Requirement 18: Banned looks absent (Property 5)

**User Story:** As the owner, I want a test that fails if the page drifts into any of the six looks I banned, so that the direction I chose cannot be eroded by a later edit.

#### Acceptance Criteria

1. THE test suite SHALL include a static property (Property 5) that parses the Stylesheet and asserts: (a) no dark ground: `--wall`, `--paper`, `--paper-grid` and `--paper-hot` have HSL lightness above 0.70 and `color-scheme: light`; (b) no glow: no `box-shadow` or `text-shadow` with a non-zero blur radius and no `drop-shadow(`; (c) no cream page: `--wall` and `--paper` have saturation below 0.12 and hue outside 30 to 70 degrees; (d) no serif display: no `h1`, `h2`, `h3`, `.wordmark` or `.tomb-score` rule uses a font-family other than `var(--font-display)`, and no font stack contains a serif family; (e) no orange brand: any color token with hue 10 to 40 degrees and saturation above 0.40 (`--rust`) is referenced only by the dying-variant selectors; (f) no purple: no color token with saturation above 0.15 has a hue from 250 to 335 degrees and no `gradient(` other than the single `repeating-linear-gradient` on `body`; (g) no glass: no `backdrop-filter`, no `filter: blur`, no `blur(`; (h) no generic card: every `border-radius` is `0`, `var(--radius)` or `50%`, and `--radius` is at most 2px; (i) no white-and-blue hairline look: `--wall` is not white-like and every box rule (`.tombstone` edge, `table.breakdown`, `.sheet`, `.proof`, form boxes) uses the 2px `--rule`.
2. THE label font SHALL appear only in rules whose selectors are in an explicit allowlist (Tag_Label, Form_Grid column and stacked labels, Compare_Box captions, subtitle, field labels), and a test SHALL fail for any other use.
3. THE Manila color (`--tag`) SHALL appear as a background only in rules whose selectors are Toe_Tag, Sheet_Tag or Demo_Repo card selectors.
4. EACH of the six Banned_Looks SHALL have at least one sabotage entry that the property catches (Requirement 23).

### Requirement 19: Narrow viewport (Property 6)

**User Story:** As a visitor on a phone, I want every screen to fit 375 pixels with no sideways scroll and targets I can hit, so that the page is usable one-handed.

#### Acceptance Criteria

1. AT the Narrow_Viewport (375 wide, and down to 320) NO screen SHALL scroll horizontally: the home, the loading and error screens, The Graveyard with each group, the alive list expanded, the Detail_Panel with the Form_Grid and the Proof (including a 200-character package name and a 200-character unbroken counterexample output).
2. THE Stylesheet SHALL satisfy these static rules, tested from the CSS text (Property 6): every `display: grid` track list uses `minmax(0, 1fr)`, `min(100%, …)` or `auto`; no `min-width`, `width` or `flex-basis` larger than 343px outside a `min-width` media query; `white-space: nowrap` only on `.col-status`, `.col-points`, buttons and labels; every text-bearing class in the registry (`.tomb-name`, `.tomb-summary`, `.col-signal`, `.proof-pre`, `dd`, Tag_Field values, Compare_Box cells, notice and error text) declares `overflow-wrap: anywhere`; `.proof-pre` declares `white-space: pre-wrap`; and no ancestor of a tag or a pre clips its overflow.
3. EVERY interactive element SHALL have a target of at least 44 by 44 CSS pixels at the Narrow_Viewport, including the group tabs, Toe_Tags, demo cards, buttons, inputs, `summary` elements and the Close button.
4. THE layout facts that jsdom cannot show (real widths, no horizontal scroll, tag fit) SHALL be checked in a real browser by the final task, and the report SHALL say which were not run.

### Requirement 20: Tag_Swing and Reduced_Motion (Property 7)

**User Story:** As a visitor, I want the tag to swing once when I open it, and not move at all if I asked for less motion.

#### Acceptance Criteria

1. WHEN the Detail_Panel opens, THE Sheet_Tag SHALL swing once: a rotation about the punched hole through at most 8 degrees, damped, over `--swing-duration` (700ms) with `animation-iteration-count: 1`, followed by a 220ms stamp of the Band; WHEN the Detail_Panel opens for another package while open, THE new Sheet_Tag SHALL swing once.
2. THE Tag_Swing SHALL be a CSS animation declared inside `@media (prefers-reduced-motion: no-preference)` only, with no JavaScript timer; WHILE Reduced_Motion is set, THE Sheet_Tag SHALL be static at its rest position and the Stylesheet SHALL contain an explicit `@media (prefers-reduced-motion: reduce)` rule setting `animation: none` and `transition: none` on the Sheet_Tag and the Band.
3. THE Tag_Swing SHALL NOT delay the opening of the panel, the focus move to the heading, the `inert` handling or the route change: after the activating click returns, the panel SHALL already be open and focused.
4. THE Tag_Swing SHALL NOT replay on `updateProof`, on a scroll, on a window resize or on focus changes inside the panel.
5. EVERY `animation`, `transition` and smooth `scroll-behavior` declaration SHALL sit inside a no-preference block; NO animation SHALL have `infinite` iteration; the dead glow pulse of the Night_Theme SHALL be gone.
6. THE hover and press changes of Requirement 9.10 SHALL be instant (no transition) or inside a no-preference block.

### Requirement 21: Focus visibility and forced colors (Property 8)

**User Story:** As a keyboard user, I want a focus ring I can always see, on every shape, so that the chamfered tags do not hide where I am.

#### Acceptance Criteria

1. THE `:focus-visible` ring SHALL stay `var(--ring-width) solid var(--focus)` with `var(--ring-offset)` offset (3px Ink, 2px offset), SHALL be at least 3:1 against Wall, Manila and Paper, and SHALL NOT be removed by `outline: none` except for `:focus:not(:focus-visible)` and `h1[tabindex="-1"]:focus` as today.
2. NO focusable element (`button`, `a`, `input`, `summary`, `[tabindex]`) and NO ancestor of one up to `body` SHALL have `clip-path`, `overflow: hidden`, `overflow: clip` or a `mask`; the chamfer SHALL be drawn only on pseudo-elements.
3. WHEN a Toe_Tag has keyboard focus, THE ring SHALL be a complete rectangle around the whole tag including the chamfered corners and SHALL not be covered by the string or by neighboring tags (grid gap of at least `--space-4`).
4. UNDER `forced-colors: active`, borders of buttons, Toe_Tags, the sheet, Form_Grid cells, the Stamp and the Compare_Box SHALL stay visible (`CanvasText`), the ring SHALL use `Highlight`, and decorative layers SHALL NOT be the only edge of a Toe_Tag.
5. THE Band SHALL carry the grade word as text, and the Stamp SHALL carry its label as text, so that no status depends on color alone.

### Requirement 22: Existing tests updated only where they pin the old look

**User Story:** As a maintainer, I want the old presentation tests replaced by their new equivalents and everything else left alone, so that the suite still guards behavior.

#### Acceptance Criteria

1. THE following tests pin the Night_Theme and SHALL be updated to the Toe Tag equivalents, keeping their intent: `theme/theme.test.ts` (token names, dark scheme, lightness below 25%, serif rule, recording sizes 18px at 1200px and 56px root rule, glow); `test-support/css-checks.ts` checks S1 (the `.screen` max-width becomes 1280px, still within 960 to 1280), S3 (arch, gradient line and `border-top` order of `.tombstone-dead` become the Toe_Tag shape rules) and S7 (the 18px and 56px lines); the literal-text mutations in `test-support/sabotage/css.ts` and their count in `polish.sabotage.css.test.ts`; and the unused-name list in `dom/class-vocabulary.test.ts`.
2. EVERY other assertion of the existing suites SHALL remain as it is; a change to any assertion outside the list above SHALL be justified in the task that makes it and in `docs/kiro-log.md`.
3. THE updated checks SHALL keep S2, S4, S5, S6 and the layout-safety, reduced-motion, outline and "loads nothing remote" checks of `theme.test.ts` in force.
4. WHEN a CSS rule that a sabotage mutation edits changes, THE mutation SHALL be re-pointed at the new text in the same task (a mutation whose text is missing or ambiguous fails by design).

### Requirement 23: Correctness properties and sabotage

**User Story:** As a maintainer, I want each property proven able to fail, so that green tests mean something.

#### Acceptance Criteria

1. THE test suite SHALL contain Properties 1 to 8 of design.md, each as a fast-check property (or, for the CSS properties, a property over the Pair_Registry or over parsed declarations) with `numRuns` 100 and the Fast_Check_Runner seed policy, each in a file that exports `build(impl)`.
2. FOR each property there SHALL be a sabotage list in `test-support/sabotage/` (`tt1.ts` to `tt8.ts`) with at least the entries named in design.md, each a deliberately wrong view, stylesheet text or token text.
3. A central test `toetag.sabotage.test.ts` SHALL fail with `Sabotage "<name>" stayed green for "<property>"` when an entry does not make its property fail, SHALL assert that every list is non-empty, SHALL assert that every mutation really changes its input, and SHALL assert that the real implementation passes every property under the fixed seed 20261113.
4. IF a property fails, THEN THE suite SHALL print the seed and the shrunk counterexample.

### Requirement 24: Verification, manual browser check and log

**User Story:** As the owner, I want the redesign checked in a real browser at the two sizes I care about and the result written down honestly.

#### Acceptance Criteria

1. WHEN all tasks are complete, `npm run typecheck` SHALL pass with zero errors and `npm test` SHALL pass, and `npm run build -w @last-rites/exorcist-web` SHALL produce `dist/` with `dist/fonts/*.woff2` and the unchanged CSP meta.
2. THE final task SHALL be a manual browser check performed by Claude at 1352 by 761 and at 375 by 812: home, loading (a slow or fake request, or the loading state forced), an error (a 429 or a network failure), The Graveyard of the parse-server demo with all four groups, one dead tag opened (Sheet_Tag, Form_Grid with the calibration row, Proof with a Stamp and a Compare_Box), keyboard Tab through the page, `prefers-reduced-motion: reduce` emulated, and `forced-colors: active` if the browser supports emulation.
3. THE check SHALL assert, per size: no horizontal scroll (`scrollWidth <= clientWidth` on `documentElement` for every screen), the fonts actually loaded (`document.fonts.check` for the four families, and no request to another origin in the network log), the Tag_Swing visible once and absent under Reduced_Motion, the focus ring visible on a Toe_Tag, and a visual comparison with the mockup.
4. THE check SHALL write `docs/review/<date>-toe-tag-check.md` listing every check as pass, fail or not run, with screenshot paths, and SHALL NOT claim a check that was not run; a browser that cannot be driven SHALL be reported as "not run", not skipped silently.
5. THE log entry in `docs/kiro-log.md` SHALL list the properties, the sabotage results, the font licenses (including that Special Elite is Apache-2.0), the contrast deviations from the mockup, the judgment calls, and the outcome of the manual check.
