# Bugfix Requirements Document

## Introduction

The Graveyard_Page (`apps/exorcist-web`, see `.kiro/specs/graveyard-ui/`) shows correct data but has seven presentation defects, found in a real-browser visual check on 2026-11-13 (`docs/review/2026-11-13-ui-visual-check.md`: Chrome at 1352x761, headless Chromium at 375x812, demo parse-server, package ldapjs). The check confirmed that behavior and data are right (calibration row sums 72 + 3 = 75, no horizontal scroll at 375px, no console errors). The defects are layout, stray list bullets, a duplicated grade label and a broken tombstone outline, mid-word breaks in the breakdown table, a misleading "No source recorded" on the calibration row, a broken mobile table footer, and a visible focus box on the page heading.

| Id | Where | Defect |
|---|---|---|
| D1 | home and graveyard pages, desktop | no side gutter, no max width: text and cards touch the left edge at 1352px |
| D2 | summary count chips | default list bullets show as stray dots left of each chip |
| D3 | dead Tombstone | grade printed twice ("DEAD" badge and "DEAD" under the score); arch outline clipped at the top; a horizontal line crosses the arch |
| D4 | Breakdown table, desktop | "Statu/s", "Know/n", "Calibr/ation", "registry.np/mjs.org": words break mid-word in narrow columns |
| D5 | Breakdown calibration row | Source cell says "No source recorded" |
| D6 | Breakdown table footer, 375px | several empty full-width bordered bars before "Total: 75 / 100" |
| D7 | page `h1` after navigation | visible blue focus box from programmatic focus |

Only presentation changes. The Scan_Report, the view model in `skeleton/src/graveyard/`, the Scan_Api, the scanner and the death-score engine do not change. Tests run in jsdom/Node with no browser, so the fix is checked by two kinds of assertion that can run there: rendered DOM structure, and static assertions on the CSS text. What those cannot show (how an arch actually looks, where a browser breaks a word, whether Chrome shows a focus ring for a script focus) is recorded as a manual browser check in task 6.4 and is not claimed as verified by automation.

## Glossary

- **Graveyard_Page**: the Vite app `apps/exorcist-web` (no framework, DOM built with `h()`, text via `textContent` only).
- **Screen**: the `div.screen` that `controller.ts` creates inside `#app-root`; it holds the picker, loading, error or report phase.
- **Content_Column**: the centered, max-width, guttered container that holds every Screen.
- **Layout_List**: a `ul` used for layout, not prose: `ul.counts`, `ul.grid` (including `grid-dead`, `grid-dying`, `grid-ailing`, `grid-alive`) and `ul.demo-cards`. Prose lists (`.warnings ul`, the Skipped `ul`) are not Layout_Lists and keep their bullets.
- **Tombstone**: the `button.tombstone` rendered by `views/tombstone.ts`, one per Grave.
- **Grade_Label**: a visible (not `visually-hidden`, not `aria-hidden`-only duplicate) text element inside a Tombstone whose text is the grade word (case-insensitive), for example "DEAD" or "Dead".
- **Breakdown_Table**: `table.breakdown` rendered by `views/breakdown.ts` in the Detail_Panel.
- **Short_Cell**: a Breakdown_Table cell holding a short token: Value, Status and Points / weight.
- **Source_Cell**: the Source column cell of a Breakdown_Table row.
- **Calibration_Row**: the single row in `tbody.calibration` shown when `death.calibration` is present.
- **Total_Row**: the `tr.total` in `tfoot`.
- **Stacked_Layout**: the Breakdown_Table layout at `max-width: 40rem`, where rows become blocks and each cell is labelled by `data-label`.
- **Programmatic_Focus**: focus moved by script to a non-interactive element (`tabindex="-1"` headings: the screen `h1`, group headings, `#detail-title`).
- **Stylesheet**: the concatenation of `src/styles/{tokens,base,graveyard,detail}.css` with comments stripped, parsed by the declaration parser in `theme/` (task 2.2).
- **Rendered_Facts**: the facts a page shows about a Scan_Report, extracted from the DOM: the set of packages (Tombstone `data-key`), each package's score and grade (accessible name and `data-grade`), each Breakdown row's signal, raw display, status, points and weight, the calibration points, and the Total.
- **Reference_Renderer**: the frozen copy of the original, unfixed `renderTombstone`, `renderBreakdown` and `renderHeader`, at `apps/exorcist-web/src/__reference__/views-v1/`, used only by tests.
- **Scan_Report**: the parsed report type from `@last-rites/exorcist-npm/report`.

## Bug Analysis

### Current Behavior (Defect)

1.1 (D1) WHEN a Screen is shown at a desktop viewport (for example 1352px), THEN the Graveyard_Page puts no max width and no side gutter around it: the picker, status and error Screens (`div.picker`, `div.status`, `div.error`) have no container at all, and the report Screen's `.app` uses `max-width: 90rem` (1440px, 1620px at the 18px root size used from 1200px up), so text, headings and cards touch the left edge of the viewport.

1.2 (D2) WHEN the Summary_Header renders the four grade count chips, THEN it renders them as `<li>` children of `ul.counts`, which has the default `padding-left` and `list-style`, so a bullet shows to the left of each chip on desktop and on phones.

1.3 (D3) WHEN a Tombstone renders, THEN it contains two Grade_Labels: `span.tomb-label.chip` (outlined, uppercase, above the name) and `span.tomb-grade` (under the score), both showing the grade.

1.4 (D3) WHEN a dead Tombstone renders, THEN its arched outline is clipped at the very top (the arch is drawn by a 4px `border-top` with a 999px radius, no outline on the other sides) and a horizontal line crosses the arch below its top (`background-image: linear-gradient(...)` at 2.25rem in `.tombstone-dead`).

1.5 (D4) WHEN the Breakdown_Table renders at a desktop width, THEN the Status, Points / weight and Source columns are narrower than their content, because `td, th { overflow-wrap: anywhere }` in `base.css` makes the minimum content width of every cell near zero, so the table layout squeezes those columns and single words break mid-word ("Statu/s", "Know/n", "Calibr/ation", "registry.np/mjs.org").

1.6 (D5) WHEN a Calibration_Row renders, THEN its Source_Cell shows "No source recorded", although calibration is computed by the death-score engine and has a known origin (`death.calibration.rule`, for example `declared_abandoned`).

1.7 (D6) WHEN the Breakdown_Table renders in the Stacked_Layout, THEN the Total_Row has three empty `<td>` cells next to the Total cell; each becomes an empty full-width block with the 3px top border, giving several empty bars before "Total: 75 / 100".

1.8 (D7) WHEN a Screen is rendered (home, graveyard, loading, error) or the Detail_Panel opens, THEN script focus lands on a `tabindex="-1"` heading and the browser shows a visible focus box around it, because the only focus rule is `:focus-visible`, and the Stylesheet has no rule for focus that is not a keyboard focus.

### Expected Behavior (Correct)

2.1 (D1) THE Graveyard_Page SHALL wrap every Screen in a Content_Column: centered, `max-width` about 1200px (between 960px and 1280px), at least 16px side gutter at every width, and a larger gutter (at least 24px) from `40rem` up. The report Screen's `.app` SHALL NOT add a second max width or gutter.

2.2 (D2) THE Layout_Lists SHALL render with no bullets and no left padding (`list-style: none`, `padding: 0`). The count chips SHALL sit in a tidy grid that wraps on phones (the existing 2-column phone and 4-column wide layout). Prose lists SHALL keep their bullets.

2.3 (D3) EACH Tombstone SHALL contain exactly one visible Grade_Label. The accessible name, `aria-describedby` text and the visually hidden score text SHALL stay as they are.

2.4 (D3) A dead (and a dying) Tombstone SHALL draw its arch outline on all sides (a uniform border on the stone, with the grade color on the top) so the full arch is visible, and SHALL NOT draw any horizontal rule inside the arch (no `background-image` gradient line). No ancestor of a Tombstone (`.grid`, `.group`, `.screen`, `.app`) SHALL clip overflow.

2.5 (D4) THE Short_Cells (Value, Status, Points / weight) SHALL NOT break inside a word at any width: `overflow-wrap: normal`, `word-break: normal`, and no wrapping for Status and Points / weight. Source_Cell hostnames SHALL break only at dots (a `<wbr>` after each dot, `overflow-wrap: normal`). The signal description column SHALL take the remaining width and MAY break anywhere (`overflow-wrap: anywhere` stays, scoped to that column). No rule SHALL put `overflow-wrap: anywhere` or `word-break: break-all` on bare `td` / `th`.

2.6 (D5) THE Calibration_Row Source_Cell SHALL name its origin: `Engine rule: ${death.calibration.rule}` (for example "Engine rule: declared_abandoned"). Signal rows keep their link, withheld-URL text or "No source recorded".

2.7 (D6) THE Breakdown_Table footer SHALL contain exactly one Total_Row with no empty cells (a row header spanning the leading columns and one Total cell spanning the rest). In the Stacked_Layout the Total_Row SHALL show one clean line, "Total: 75 / 100", with a single top border, not one per cell.

2.8 (D7) THE Stylesheet SHALL contain a rule `:focus:not(:focus-visible)` that removes the outline, so Programmatic_Focus on a heading shows no box. The programmatic `.focus()` calls SHALL remain (screen readers still get the move). The `:focus-visible` ring (`var(--ring-width)` solid `var(--focus)`) SHALL stay, and no other rule SHALL remove an outline.

### Unchanged Behavior (Regression Prevention)

3.1 FOR every Scan_Report, THE Graveyard_Page SHALL CONTINUE TO render the same Rendered_Facts as before the fix: the same set of packages, the same score and grade per package, the same Breakdown rows with the same points and weights, the same calibration points and the same Total.

3.2 THE Tombstone SHALL CONTINUE TO be a native `button` with the same `id`, `data-key`, `data-grade`, `title`, `aria-label` and `aria-describedby`, the same score text and visually hidden score label, the name and summary text, and the unknown badge.

3.3 THE Breakdown_Table SHALL CONTINUE TO show the Total in `td[data-label='Total']` inside `tfoot tr.total` as `${score} / 100`, the calibration text in `tbody.calibration th`, the mismatch rows (`Breakdown does not add up`, `Grade mismatch`) when the report disagrees with itself, and the `Value`, `Status`, `Points`, `Source` data labels used by the Stacked_Layout.

3.4 THE Source_Cell of a signal row SHALL CONTINUE TO render a link only for a Safe_Url (`rel="noopener noreferrer"`, `target="_blank"`, same `aria-label`), the withheld-URL text for an unsafe URL, and "No source recorded" when there is no URL; hostile report strings SHALL CONTINUE TO be written as text only.

3.5 THE Graveyard_Page SHALL CONTINUE TO have no horizontal scroll at 375px and 320px: grids keep `min-width: 0` children, long names still wrap (`.tomb-name`, `.tomb-summary`, `dd`, `th` in the signal column keep `overflow-wrap: anywhere`).

3.6 THE keyboard focus ring SHALL CONTINUE TO be visible on every interactive element (`:focus-visible` with `--ring-width` / `--focus`, `forced-colors` `Highlight`), and focus management SHALL CONTINUE TO work: the screen `h1` receives focus on each phase change, the Detail_Panel heading on open, focus is trapped in the panel and restored to the Tombstone on close.

3.7 THE theme tokens and the existing Stylesheet checks SHALL CONTINUE TO pass: dark grounds, contrast ratios, no purple, no serif, 44px targets, 18px at 1200px and up, 56px dead score, all motion inside `prefers-reduced-motion: no-preference`, nothing remote loaded.

3.8 THE Graveyard_Page SHALL CONTINUE TO be deterministic and offline: no network, no clock, no randomness in the changed code; the view model (`skeleton/src/graveyard/`), `report-view.ts`, the controller and the router SHALL CONTINUE TO be unchanged.

3.9 THE existing `apps/exorcist-web` tests and `npm run typecheck` / `npm test` across the repo SHALL CONTINUE TO pass, except for assertions that pinned a defect (the removed `tomb-label`, the empty footer cells, "No source recorded" on the calibration row), which are updated in the same spec.
