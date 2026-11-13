# Bugfix Requirements Document

## Introduction

The Toe Tag redesign of the Graveyard_Page (`apps/exorcist-web`, see `.kiro/specs/toe-tag-redesign/`, direction in `docs/design/toe-tag.md`, mockup `docs/design/toe-tag-mockup-desktop.png`) shows correct data but has seven defects, found in a real-browser visual check on 2026-11-13 (`docs/review/2026-11-13-toe-tag-visual-check.md`: headless Chromium at 1352x800 and 390x844, after 6f860b4). The check confirmed the direction works (steel wall, manila tags on strings, form-grid breakdown, hanging tag in the panel header), with no console errors and no horizontal scroll. The defects are one missing behavior (a demo's real Proof_Report is never requested for an ailing package), five departures from the mockup (grade band, field alignment, subtitle wrap, home masthead and demo cards, scan-form label) and one mobile layout problem (2-up tags, mid-word breaks).

| Id | Where | Defect |
|---|---|---|
| T1 | package panel, demo `parse-server` / `intersect` (ailing, score 35) | the Proof_Report is requested only for grades `dead` and `dying`, so a real report (attempt 1 counterexample, attempt 2 proved) is never shown |
| T2 | Toe_Tag grade band | the grade is a small centered chip ("DEAD 75-100") instead of a full-width colored band along the bottom edge |
| T3 | Toe_Tag fields | short package names and the SCORE block are centered, long names and CAUSE are left-aligned; no ruled field lines under each field |
| T4 | masthead subtitle, desktop and mobile | "OFFICE OF THE DEPENDENCY EXAMINER · FORM LR-1" wraps and leaves "LR-1" alone on a line |
| T5 | home page | no masthead (small eyebrow and small heading); demo cards are flat index cards with no string or hole and show no dead count |
| T6 | scan form | the "Branch or tag (optional)" label is drawn inside a bordered box and reads as a broken input |
| T7 | tag grid at 390px | tags are 2-up, long names wrap to four lines and break inside words ("@saithodev/sem / antic-release-backmerge") |

Only presentation changes, plus one request: the controller asks for a demo package's Proof_Report for every grade (T1), and the home page reads the four demo snapshots to show their dead counts (T5). The Scan_Report, the Proof_Report, the view models in `skeleton/src/graveyard/`, the Scan_Api, the scanner, the death-score engine and the proof harness do not change. Tests run in jsdom/Node with no browser, so the fix is checked by assertions that can run there: rendered DOM structure and static assertions on the CSS text. What those cannot show (how a band fills a tag, where a browser wraps a line, how a hanging demo card looks) is recorded as a manual browser check in task 9.1 and is not claimed as verified by automation.

## Glossary

- **Graveyard_Page**: the Vite app `apps/exorcist-web` (no framework, DOM built with `h()`, text via `textContent` only).
- **Toe_Tag**: the `button.tombstone` rendered by `views/tombstone.ts`, one per Grave, drawn as a manila tag hanging from a string.
- **Tag_Field**: one of `span.tag-package`, `span.tag-score`, `span.tag-cause` inside a Toe_Tag: an `aria-hidden` Tag_Label over a value.
- **Field_Line**: the 1px Ink rule that closes a Tag_Field (between fields, and between the last field and the Band).
- **Band**: `span.tag-band` at the bottom of a Toe_Tag, colored by grade.
- **Band_Fact**: the one short fact on the right of the Band: `span.tomb-badge` ("n unknown") when the package has unknown signals, otherwise `span.tag-range` (the grade's range, for example "75-100").
- **Hang**: a list item that carries a string (a 2px Ink line) down to a punched hole (`span.tag-hole`) at the top of the object it holds. Today only `.grid > li` hangs.
- **Masthead**: `div.masthead`: the big condensed wordmark LAST RITES plus the Form_Subtitle (and, on the report page, the `h1` and the meta line).
- **Form_Subtitle**: the typewriter line "Office of the Dependency Examiner · Form LR-1" (`FORM_SUBTITLE` in `constants.ts`).
- **Subtitle_Phrase**: one of the two parts of the Form_Subtitle separated by " · ": "Office of the Dependency Examiner" and "Form LR-1".
- **Orphan**: a line of wrapped text that holds only the last word or token ("LR-1") of a phrase.
- **Pitch_Line**: the one plain sentence under the home Masthead: "Find the dead npm packages in a repo, swap them out, and prove the new code behaves the same."
- **Demo_Card**: the `button.demo-card` in `ul.demo-cards` on the home page, one per entry of `DEMO_REPOS`.
- **Dead_Count**: the number of packages with `death.grade === "dead"` in a demo's snapshot (`/api/demo/<name>`, with the static `/demo/<name>.json` fallback the Api_Client already has), shown on its Demo_Card as "N dead".
- **Field_Label**: a typewriter caption over an input (`.field > label`, for example "REPOSITORY"): `--font-label`, uppercase, tracked, `--ink-soft`, no border, no background.
- **Optional_Ref_Summary**: the `summary` of the `details` in the Live_Scan_Form with the text "Branch or tag (optional)".
- **Split_Point**: a place in a package name where a line may break: directly after "/" or "-". Realized as a `<wbr>` element (no text) after each such character.
- **Proof_Section**: `section.proof` in the Detail_Panel, rendered by `views/proof-slot.ts`.
- **Proof_Report**: the harness output served at `/demo/proofs/<demo>/<package>.json` (the demo `parse-server` has `intersect`, `deep-diff` and `node-abort-controller`).
- **No_Proof_Yet**: today's state for a dead or dying package without a report: the "Exorcism coming" placeholder (and the unreadable line for an invalid report). It is never shown for an ailing or alive package.
- **Rendered_Facts**: the facts the page shows about a report, read by `toeFacts` (`test-support/toe-facts.ts`) through the Fact_Hooks only (never layout classes, Tag_Labels or decorative spans).
- **Reference_Renderer**: the frozen copy of today's production views at `apps/exorcist-web/src/__reference__/views-v3/`, used only by tests (task 1.1).
- **Stylesheet**: the concatenation of `src/styles/{fonts,tokens,base,graveyard,detail}.css` with comments stripped, parsed by `theme/css-parse.ts`.

## Bug Analysis

### Current Behavior (Defect)

1.1 (T1) WHEN the Detail_Panel opens for a package of a demo whose grade is `ailing` or `alive` (for example `intersect`, ailing, score 35, in the demo `parse-server`), THEN the controller does not request its Proof_Report (`proofFor` returns early unless the grade is `dead` or `dying`), and the panel has no Proof_Section at all, although the report exists with attempt 1 a counterexample and attempt 2 proved. The panel also cannot show one later: `proofSlotFor` returns no slot for these grades and `updateProof` returns when there is no slot.

1.2 (T2) WHEN a Toe_Tag renders, THEN its Band is a small chip centered at the bottom of the tag (grade word and range side by side, shrink-wrapped), not a full-width colored band: the Toe_Tag is a column flex container that inherits `align-items: center` from the global `button` rule, so each child is shrunk to its content and centered.

1.3 (T3) WHEN Toe_Tags render, THEN the PACKAGE name and the SCORE block of a short-named tag are centered while a long name and the CAUSE text are left-aligned (same cause as 1.2: children are shrunk and centered, and only content wider than the tag fills the line), and the Tag_Fields are separated by a line only between fields, not closed by a Field_Line above the Band.

1.4 (T4) WHEN the Form_Subtitle renders in the Masthead, at 1352px and at 390px, THEN it is a single text node that the browser wraps at any space, so "LR-1" can sit alone on the second line.

1.5 (T5) WHEN the home page renders, THEN it shows a small "The Graveyard" eyebrow (`p.meta`) and a small "LAST RITES" `h1` (the 20px screen heading) instead of the Masthead of the graveyard page, followed by the sentence "Find the dead packages in a codebase, and see exactly why each one scores the way it does."; and each Demo_Card is a flat index card with a chamfer on one corner, no string and no hole, showing only name, repo, blurb and the cached-snapshot line, with no dead count.

1.6 (T6) WHEN the Live_Scan_Form renders, THEN the Optional_Ref_Summary is drawn as a bordered, Paper-faced box (the global `summary` rule styles every `summary` like a button), so it looks like an input next to the real "REPOSITORY" Field_Label above its own input.

1.7 (T7) WHEN the Graveyard_Page renders at a width between 360px and 520px (for example 390px), THEN the tag grid is two columns wide (163px per tag at 375px), so a long package name wraps into four lines and breaks inside words, because `.tomb-name` uses `overflow-wrap: anywhere`, which lets a browser break at any character before it uses a "/" or "-".

### Expected Behavior (Correct)

2.1 (T1) THE controller SHALL request the Proof_Report of a demo package of any grade (`dead`, `dying`, `ailing`, `alive`). WHEN the report is valid, THEN the Detail_Panel SHALL show a Proof_Section with it, whether it arrives before or after the panel opens (`intersect` shows attempt 1 counterexample and attempt 2 proved). WHEN there is no readable report for an ailing or alive package (absent, failed, invalid, still loading), THEN the panel SHALL show no Proof_Section and no placeholder, exactly as today. For a dead or dying package every state SHALL render exactly as today (No_Proof_Yet, loading, report, unreadable).

2.2 (T2) EACH Toe_Tag SHALL end in a Band that spans the full width of the tag, edge to edge inside the tag border, colored by grade (dead `--red`, dying `--rust`, ailing `--amber`, alive `--steel`), with the grade word on the left in the display font, uppercase, and the Band_Fact on the right. The Band SHALL be the last visible block of the tag, flush with its bottom edge.

2.3 (T3) EVERY Tag_Field (PACKAGE, SCORE, CAUSE) SHALL be left-aligned at the same left edge for every package name length, each ruled by a Field_Line, the last one closing against the Band. The SCORE number SHALL be left-aligned and large (56px dead, 44px dying, 32px ailing and alive, unchanged).

2.4 (T4) THE Form_Subtitle SHALL NOT leave an Orphan: "Form LR-1" is never split (no line break inside it, so "LR-1" never sits alone), and the subtitle SHALL break only between Subtitle_Phrases. The text content of the subtitle SHALL stay exactly `FORM_SUBTITLE`. Below 360px, where the first Subtitle_Phrase alone is wider than the column, that phrase MAY wrap at its spaces so the page keeps no horizontal scroll.

2.5 (T5) THE home page SHALL show the same Masthead as the graveyard page: the big condensed LAST RITES wordmark and the Form_Subtitle, then the Pitch_Line as one plain paragraph; the "The Graveyard" eyebrow and the old intro sentence SHALL be gone. The home `h1` SHALL remain the single `h1` of the page, with the text "Last Rites" and `tabindex="-1"`. EACH Demo_Card SHALL hang: a string and a punched hole above it and a chamfer on both top corners, like a Toe_Tag. WHEN a demo's snapshot has been read, THEN its Demo_Card SHALL also show "N dead" with N the Dead_Count; WHEN the snapshot is not available (still loading, failed, unreadable), THEN the Demo_Card SHALL show exactly what it shows today (name, repo, blurb, cached-snapshot line) and nothing else, and the page SHALL NOT show an error for it.

2.6 (T6) THE Optional_Ref_Summary SHALL use the Field_Label style (typewriter font, uppercase, tracked, `--ink-soft`, no border, no background), keep a minimum 44px target and the `:focus-visible` ring, and show an open/closed marker drawn by CSS. It SHALL still be a native `summary` inside the `details`.

2.7 (T7) BELOW 520px (`32.5rem`) the tag grid SHALL be one column; from 520px it SHALL be two columns, three from `48rem` and four from `64rem` as today. A package name on a Toe_Tag SHALL be able to break only after "/" or "-" (a `<wbr>` after each such character); `.tomb-name` SHALL NOT use `overflow-wrap: anywhere`. A name segment that alone is wider than the tag SHALL still wrap (`overflow-wrap: break-word`, last resort) so the page keeps no horizontal scroll; this is the only case where a name breaks inside a word.

### Unchanged Behavior (Regression Prevention)

3.1 FOR every Scan_Report, THE Graveyard_Page SHALL CONTINUE TO render the same Rendered_Facts as before the fix: the same packages, per-package score, grade and cause, the same header counts, the same Breakdown rows, calibration, total, mismatch rows and skipped list, and the same Proof facts for every dead or dying package.

3.2 THE Toe_Tag SHALL CONTINUE TO be a native `button` with the same `id`, `data-key`, `data-grade`, `title`, `aria-label`, `aria-describedby`, the same score text and visually hidden score label, the name (cut as before, text content identical with or without `<wbr>`), the cause text, the unknown badge, and exactly one visible Grade_Label (`.tomb-grade`).

3.3 THE Detail_Panel SHALL CONTINUE TO keep its dialog attributes, focus management (heading focused on open, trap, restore), Sheet_Tag and swing, and the Proof_Section SHALL CONTINUE TO replace only its own content on `updateProof` (the open panel's other nodes, including the `.sheet-tag`, are not rebuilt).

3.4 THE Proof request SHALL CONTINUE TO be made at most once per demo package (the `proofsStarted` / `proofsSettled` maps), aborted on teardown, never made for a live scan, and never made for a name that fails `isProofName`; a failed request SHALL CONTINUE TO be retried on the next open.

3.5 THE Graveyard_Page SHALL CONTINUE TO have no horizontal scroll at 375px and 320px, and the focus ring SHALL CONTINUE TO be visible on every interactive control (`:focus-visible`, `forced-colors`), with the Toe_Tag, Demo_Card and `summary` unclipped (no `clip-path` or `overflow` on a focusable element or its ancestors).

3.6 THE Banned_Looks, color pairs, tokens and fonts SHALL CONTINUE TO pass the existing guard properties (Properties 4 to 8 of `toe-tag-redesign`: contrast, banned looks, layout, motion, focus): no new color literal outside `tokens.css`, Special Elite only on tiny labels, motion only inside `prefers-reduced-motion: no-preference`, nothing remote loaded.

3.7 THE home page SHALL CONTINUE TO open a demo on click of its Demo_Card (same `data-demo`, same route), to show the demo note, and to show the Live_Scan_Form with the same ids, labels, hints, validation, `aria-*` and cooldown behavior; the loading and error screens SHALL CONTINUE TO show the wordmark as today.

3.8 THE Graveyard_Page SHALL CONTINUE TO be deterministic and offline in tests: no network, no clock, no randomness in the changed code; the view models, `report-view.ts`, the router and the Api_Client SHALL CONTINUE TO be unchanged (the controller changes only in `proofFor` and in the picker phase).

3.9 THE existing `apps/exorcist-web` tests and `npm run typecheck` / `npm test` across the repo SHALL CONTINUE TO pass, except for assertions that pinned a defect (the grade-only proof gating, the 2-column tag grid at 375px, `overflow-wrap: anywhere` on `.tomb-name`, the old home eyebrow and intro sentence, the unhung Demo_Card), which are updated in the same task group as their fix.
