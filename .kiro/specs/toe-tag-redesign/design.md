# Design

## Overview

The Toe Tag redesign gives the Graveyard_Page a new face and leaves everything under it alone. The page is vanilla TypeScript that builds DOM with a closed `h()` helper and styles it with four stylesheets; this design replaces the four stylesheets, adds a fifth (`fonts.css`), adds presentation wrappers and decorative spans to five views, and adds a property-based guard that the data on screen did not change.

```
 Scan_Report / Proof_Report  (unchanged)
          │
          ▼  controller, router, api client, report-view, skeleton view model   ← untouched
          │
          ▼  views/*.ts   header · graveyard · tombstone · breakdown · detail · proof-slot · picker · live-form · status
          │                (DOM: + wrappers, + aria-hidden labels, same Fact_Hooks, same text)
          ▼
 styles/  fonts.css · tokens.css · base.css · graveyard.css · detail.css   ← rewritten
 public/fonts/*.woff2 + licenses/ + README.md                              ← new
 .kiro/steering/graveyard-ui.md                                            ← new
```

The look, from `docs/design/toe-tag.md`: a cool gray-green Wall with faint ruled lines; manila Toe_Tags hanging by strings with a colored Band; a gridded death-certificate Breakdown; a rubber-stamped Proof. Display type is Barlow Condensed, body IBM Plex Sans, numbers and code IBM Plex Mono, tiny field labels Special Elite.

## Goals

- The six Banned_Looks are impossible to reintroduce by accident: the rules are in a steering file that loads whenever `apps/exorcist-web/**` is edited, and in tests that fail when a stylesheet drifts.
- Every value on screen is the value in the report: the same packages, scores, grades, breakdown points, proof statuses and counterexamples, shown by a property over generated Scan_Reports and Proof_Reports against frozen reference views.
- Every color pair meets WCAG AA, computed from the Token_File by a test.
- 375 pixels is a first-class layout, not a squeeze: two tags across, a boxed-record Form_Grid, a stacked Compare_Box.
- The one signature motion (the tag swinging once) exists, is CSS-only, and is off under Reduced_Motion.

## Non-Goals

- Any behavior, route, copy of substance, API, skeleton or engine change.
- A light/dark toggle, theming, print styles, i18n, a UI framework, an icon set, an image or a texture file.
- Making call sites links (proof-harness forbids links built from report strings).
- Turning the group tabs into a `tablist` or adding filtering.
- Inline (non-modal) Breakdown and Proof as drawn in the mockups.

## Research Findings

Checked in the repository:

- **Views and hooks.** `tombstone.ts` renders `button.tombstone` with `.tomb-name`, `.tomb-score` (aria-hidden number plus visually hidden text), `.tomb-grade`, `.tomb-summary`, optional `.tomb-badge`, and a hidden description; `header.ts` renders `ul.counts` of `button.btn.count[data-grade]` with `.num`, and sets `style.borderTopColor` from token values; `breakdown.ts` renders `table.breakdown` with `td[data-label]`, `.col-*` classes, a points bar whose width is set through CSSOM, a calibration `tbody` and a `tfoot tr.total`; `detail.ts` rebuilds the panel on every `open()`; `proof-slot.ts` renders `section.proof` with `.proof-badge`, `.proof-sites`, `.proof-attempts`, `.proof-pre`.
- **Existing preservation machinery.** `__reference__/views-v1/` (tombstone, breakdown, header, frozen before the polish fix), `test-support/reference-render.ts`, `test-support/rendered-facts.ts`, `test-support/properties/p10.ts`, `polish.preserve.dom.test.ts`. They read through stable hooks and survive this redesign unchanged. They do not cover the Proof, the tag text fields or the header text, and v1 predates the polish fix, so this spec freezes a v2 copy and adds a wider facts reader.
- **Existing CSS checks.** `theme/theme.test.ts` (tokens, motion, outline, layout safety) and `test-support/css-checks.ts` S1 to S7 read the CSS text through `theme/css-parse.ts` (`declarations`, `stripComments`, with `preludes` for at-rules and selectors). The new guards reuse that parser.
- **Contrast arithmetic** (WCAG relative luminance, computed while writing; the test recomputes):

| pair | ratio | note |
|---|---|---|
| Ink `#1B2328` on Wall `#C9CFCB` | 10.07 | body text on the Wall |
| Ink on Manila `#E9D4A3` | 10.94 | tag text |
| Ink on Paper `#F1F2EE` | 14.17 | |
| Ink on Paper-grid `#E3E6E1` | 12.65 | |
| Ink on Paper-hot `#F6DEDA` | 12.43 | new-output cell |
| Ink-soft `#3B474D` on Wall / Manila / Paper / Paper-grid | 6.05 / 6.57 / 8.51 / 7.60 | labels, muted text |
| Steel `#2F5D7C` on Wall | **4.46 (fails)** | the mockup's blue as text |
| Steel-ink `#264A66` on Wall / Manila / Paper / Paper-grid / Paper-hot | 5.89 / 6.39 / 8.29 / 7.40 / 7.27 | links |
| Red `#C4271D` on Wall / Paper-hot | **3.63 / 4.48 (fail)** | red as text |
| Red-ink `#A81F16` on Wall / Manila / Paper / Paper-grid / Paper-hot | 4.62 / 5.02 / 6.50 / 5.80 / 5.70 | error text, Stamp |
| White on Red `#C4271D` | 5.75 | DEAD band |
| White on Steel `#2F5D7C` | 7.05 | ALIVE band |
| White on Rust `#9A3F12` (candidate) | 6.79 | DYING band; the final value is chosen at implementation to stay at 4.5 or more |
| White on Amber `#B8860B` | **3.25 (fails)** | the mockup's AILING band text |
| Ink on Amber | 4.90 | AILING band text instead |
| Paper on Ink | 14.17 | caption bars |
| Manila on Ink | 10.94 | tag-colored text on a bar |
| Ink edge on Wall | 10.07 | component edge, needs 3 |
| Focus ring Ink on Wall / Manila / Paper | 10.07 / 10.94 / 14.17 | needs 3 |

  The mockup's rust-brown for DYING is not given as a hex in `toe-tag.md`; `#9A3F12` is a candidate read from the mockup, and the contrast test is what fixes the final value.
- **Special Elite license.** The font file's embedded copyright line and the Fontsource record both state Apache-2.0. Barlow Condensed (The Barlow Project Authors) and IBM Plex (IBM Corp.) are SIL OFL 1.1.
- **`clip-path` and focus.** An outline is clipped by `clip-path` on the same element. The chamfer is therefore drawn on pseudo-elements and the focus ring stays on the unclipped button.
- **Rotation and scroll.** A transformed child extends its scroll container's scrollable overflow. The Sheet_Tag is kept narrower than the sheet's content box so the swing cannot create a horizontal scrollbar.
- **Vite `public/`.** Files in `apps/exorcist-web/public/` are served at `/` and copied to `dist/`; CSS `url("/fonts/x.woff2")` is left as written.

## Architecture

### Files

```
apps/exorcist-web/
  public/fonts/                          NEW  woff2 ×7, README.md, licenses/{OFL-Barlow-Condensed,OFL-IBM-Plex-Sans,OFL-IBM-Plex-Mono,Apache-2.0-Special-Elite}.txt
  src/styles/fonts.css                   NEW  @font-face (swap, latin unicode-range)
  src/styles/tokens.css                  REWRITE
  src/styles/base.css                    REWRITE  wall, type, controls, focus, forced-colors
  src/styles/graveyard.css               REWRITE  masthead, tabs, groups, Toe_Tags, picker, status, notices
  src/styles/detail.css                  REWRITE  sheet, Sheet_Tag, Form_Grid, Proof, Stamp, Compare_Box
  src/constants.ts                       +TAG_LABELS, +FORM_SUBTITLE
  src/dom/h.ts                           +ClassName entries (presentation only)
  src/views/{header,tombstone,breakdown,detail,proof-slot,picker,live-form,status}.ts   wrappers and decorative spans only
  src/theme/pairs.ts                     NEW  Pair_Registry
  src/__reference__/views-v2/            NEW  frozen copies: tombstone, breakdown, header, proof-slot
  src/test-support/toe-facts.ts          NEW  Rendered_Facts reader
  src/test-support/properties/tt1..tt8.ts, test-support/sabotage/tt1..tt8.ts   NEW
.kiro/steering/graveyard-ui.md           NEW
```

Nothing under `skeleton/`, `apps/exorcist-npm/`, `demo/` or the controller, router, API client or models changes.

### DOM changes (each keeps the Fact_Hooks and the accessible name)

Toe_Tag (`views/tombstone.ts`):

```
button.tombstone.tombstone-<grade>[id][data-key][data-grade][title][aria-label][aria-describedby]
  span.tag-hole[aria-hidden]
  span.tag-field.tag-package   span.tag-label[aria-hidden] "PACKAGE"   span.tomb-name
  span.tag-field.tag-score     span.tag-label[aria-hidden] "SCORE"     span.tomb-score  (unchanged inner structure)
  span.tag-field.tag-cause     span.tag-label[aria-hidden] "CAUSE"     span.tomb-summary
  span.tag-band
     span.tomb-grade[aria-hidden]            (unchanged text: GRADE_INFO[grade].label)
     span.tomb-badge[aria-label]  "n unknown"    ← when unknown > 0
     span.tag-range[aria-hidden]  "75-100"       ← otherwise (GRADE_INFO min-max)
  span.visually-hidden#<id>-desc
```

The list item (`li` in `views/graveyard.ts`) is unchanged; the string is its `::before`. The new class names are `tag-hole`, `tag-field`, `tag-package`, `tag-score`, `tag-cause`, `tag-label`, `tag-band`, `tag-range`. The labels come from `TAG_LABELS = { package: "PACKAGE", score: "SCORE", cause: "CAUSE" }` in `constants.ts`; none equals a grade word, so the polish Property 9 "one Grade_Label per Tombstone" still holds. The `.tomb-grade` word is the only leaf equal to the grade word.

Masthead (`views/header.ts`): `header.header > nav(skip) , div.masthead( p.wordmark PRODUCT_NAME , p.form-subtitle FORM_SUBTITLE , h1[tabindex=-1] , p.meta (unchanged text) ) , ul.counts , …` The wordmark is a `p`. `FORM_SUBTITLE = "Office of the Dependency Examiner · Form LR-1"` is decorative copy in `constants.ts`; it is not data. `COUNT_BORDER` and the inline `style.borderTopColor` are removed; the grade color of a tab comes from `button.count[data-grade="dead"]` CSS rules.

Form_Grid (`views/breakdown.ts`): no DOM change except new class names on existing elements where a hook is missing (`caption` already exists). The `bar` and `bar-fill` stay; the fill width stays a CSSOM `style.width` (allowed under `style-src 'self'`).

Sheet_Tag (`views/detail.ts`): the head becomes

```
div.sheet-head
  div.sheet-tag[data-grade]              ← new wrapper, aria-hidden decorations inside
     span.tag-hole[aria-hidden]
     h2#detail-title[tabindex=-1]         ← moved into the wrapper; text unchanged
     span.tag-band[aria-hidden]           ← empty colored bar (no text), grade color by [data-grade]
  button.btn  Close                       ← unchanged, outside the tag
```

The Band of the Sheet_Tag has no text on purpose: the grade word already exists as the `.grade-chip` text in the facts block, and a second copy would duplicate content for screen readers and tests.

Compare_Box (`views/proof-slot.ts`): in `renderAttempt`, the three `preBlock`s (Shrunk input, Old output, New output) keep their order; the Old and New blocks are wrapped in `div.proof-compare` and each block gets `proof-cell` (the New one also `proof-cell-new`). The wrapper is a presentation `div`; the labels keep their text ("Old output", "New output"), made uppercase by CSS only.

Picker, live form, status: classes only; `demo-card`, `field`, `status`, `error`, `notice` already exist.

### Layout

Content column: `.screen` max-width 1280px (inside the S1 range of 960 to 1280), centered, gutters `--space-4` (and `--space-6` from 40rem). At the Desktop_Viewport (1352) the column is 1280 wide, margins 36px, content about 1232px.

Tag grid (`ul.grid`, all four variants share the track rule; variants differ by tag size):

| viewport | columns |
|---|---|
| under 22.5rem (360px) | 1 |
| 22.5rem to under 48rem (Narrow_Viewport 375 is here) | 2 |
| 48rem to under 64rem | 3 |
| 64rem and up (Desktop 1352) | 4 |

All with `grid-template-columns: repeat(N, minmax(0, 1fr))`, gap `--space-4` (1rem) so the focus ring (3px + 2px offset) never touches a neighbor. At 375 the content box is 343px wide: two tags of 163.5px.

Form_Grid: five columns from 40rem (SIGNAL with explanation, VALUE, STATUS, PTS / WT with bar, SOURCE). Below 40rem each `tr` becomes a boxed record:

```
┌───────────────────────────────┐
│ SIGNAL  Deprecated flag       │  ← th, full width, explanation below
│ one-sentence explanation      │
├───────────────┬───────────────┤
│ VALUE  yes    │ STATUS Known  │
├───────────────┼───────────────┤
│ PTS/WT 30 / 30│ SOURCE npm …  │
└───────────────┴───────────────┘
```

The existing stacked reflow already uses `display: block` on table parts and `td::before { content: attr(data-label) }`; the redesign keeps that mechanism and styles it (label font, 2-column grid via `display: grid` on `tr`). The mobile mockup keeps a 4-column grid at 375; with the signal explanation, the status column and real source hosts that does not fit without wrapping words mid-token, so the boxed record is used (Judgment Call 6).

Compare_Box: `div.proof-compare { display: grid; grid-template-columns: minmax(0, 1fr) }` and, from 40rem, `repeat(2, minmax(0, 1fr))` with a 2px Ink rule around and a 2px Ink divider.

### Component rules (also the body of the steering file)

- **Boxes** use `border: var(--rule) solid var(--ink)` (2px). Grid lines inside boxes use `1px solid var(--ink)`. Radius is `0` except the hole (`50%`); `--radius` is 2px for controls.
- **Toe_Tag**: `isolation: isolate; position: relative`. `::before` is the Ink layer, `::after` the Manila layer inset by `--rule`, both `clip-path: polygon(chamfer…)`, both behind the content. The button has `background: none; border: 0`, so its outline is a full rectangle. Content padding keeps text off the chamfer.
- **String**: `.grid > li { position: relative; padding-top: var(--string-height) }` and `.grid > li::before` a 2px Ink line from the top of the item down to the hole center.
- **Hole**: `.tag-hole` is a 0.875rem circle, 2px Ink border, background `--wall`, centered, top `0.625rem`.
- **Band**: `.tag-band { display: flex; justify-content: space-between; align-items: center; background: var(--band-color); color: var(--band-text) }` with `--band-color` and `--band-text` set per `.tombstone-<grade>`: red + `--on-band`; rust + `--on-band`; amber + `--ink`; steel + `--on-band`.
- **Sizes**: dead `min-height: 15rem`, score `--size-score-dead` (3.5rem = 56px); dying `13rem`, `--size-score-dying` (2.75rem = 44px); ailing and alive `9rem`, `--size-score-compact` (2rem = 32px); package name 1.0625rem (17px) on dead, 1rem on others, mono.
- **Hover/press**: `.tombstone:hover::before { background: var(--ink) }` plus `box-shadow` offset `3px 3px 0 var(--ink)` on the `li` (hard shadow, zero blur); `:active` moves nothing. No transition outside no-preference.
- **Controls**: `button, .btn` Paper face, 2px Ink rule, display or body font 600, uppercase tracking for primary; `aria-disabled="true"` and `:disabled` controls get `border-style: dashed`, `color: var(--ink-soft)`, `background: var(--paper-grid)` and `cursor: not-allowed`; no gradient (the only gradient is the Wall's ruled lines) and no opacity.
- **Stamp** (`.proof-badge`): display font, uppercase, tracking `--track-band`, 2px border `currentColor`, padding `0.125rem 0.625rem`, `transform: rotate(-2.5deg)`, `display: inline-block`, `max-width: 100%`, `overflow-wrap: anywhere`. Kind colors: `-counterexample` and `-error` `--red-ink`; `-proved` `--steel-ink`; `-weak` Ink text with `border-color: var(--amber)`; `-no_call_sites` `--ink-soft`. Inside `.proof-attempts` the Stamp is smaller and `transform: none`.
- **Compare_Box**: cells are `pre.proof-pre` with `white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--font-mono)`; the New cell `background: var(--paper-hot)`; captions (`.muted` label above each pre) use the label font.
- **Notices**: `.notice` Paper, 2px Ink rule, 6px amber left bar drawn as `border-left: 6px solid var(--amber)`; `.error` the same with `--red-ink`. Both start with their existing text; no icon.

### Motion

One keyframes block, inside `@media (prefers-reduced-motion: no-preference)`:

```css
@keyframes tag-swing {
  0%   { transform: rotate(0deg); }
  18%  { transform: rotate(8deg); }
  40%  { transform: rotate(-5deg); }
  62%  { transform: rotate(3deg); }
  82%  { transform: rotate(-1.5deg); }
  100% { transform: rotate(0deg); }
}
@keyframes band-stamp {
  0%   { transform: scaleY(0); }
  100% { transform: scaleY(1); }
}
.sheet-tag { transform-origin: 50% var(--tag-hole-y); animation: tag-swing var(--swing-duration) ease-out 1 both; }
.sheet-tag .tag-band { transform-origin: 50% 100%; animation: band-stamp var(--stamp-duration) ease-out calc(var(--swing-duration) * 0.5) 1 both; }
```

and, outside it, a belt-and-braces block:

```css
@media (prefers-reduced-motion: reduce) {
  .sheet-tag, .sheet-tag .tag-band { animation: none; transition: none; }
}
```

No JavaScript is involved: the panel is rebuilt on every `open()`, so the animation runs when the element is inserted and `hidden` is cleared, once; `updateProof` does not touch the head, so nothing replays. The hover rules of the tags use no transition. The existing `scroll-behavior: smooth` and the control color transitions stay inside the same no-preference block. The dead glow `ember-pulse` is deleted.

If a browser were to replay the animation when `hidden` is toggled without a rebuild, the manual check (Requirement 24) would show it; the fallback is a `data-swing` attribute toggled by `detail.ts`, which is not planned because `open()` always rebuilds.

### Fonts

`fonts.css`:

```css
@font-face { font-family: "Barlow Condensed"; font-weight: 600; font-style: normal; font-display: swap;
  src: url("/fonts/barlow-condensed-latin-600-normal.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
/* …700, IBM Plex Sans 400/600, IBM Plex Mono 400/600, Special Elite 400 the same way… */
```

The files come from `npm pack @fontsource/barlow-condensed @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono @fontsource/special-elite` in a temporary directory (`files/<family>-latin-<weight>-normal.woff2`), copied unchanged. `font-display: swap` keeps text visible while fonts load; the stacks' fallbacks (`Arial Narrow`, `system-ui`, `ui-monospace`, `Courier New`) keep the layout sane before and without the fonts. A glyph outside the Latin range falls back to the generic family (Requirement 4.8).

## Components and Interfaces

New or changed modules (signatures only; implementation is the tasks):

```ts
// constants.ts
export const TAG_LABELS = { package: "PACKAGE", score: "SCORE", cause: "CAUSE" } as const;
export const FORM_SUBTITLE = "Office of the Dependency Examiner · Form LR-1";

// theme/pairs.ts  (test-support, no DOM)
export interface ColorPair { id: string; fg: `--${string}`; bg: `--${string}`; min: 3 | 4.5; use: string }
export const PAIRS: readonly ColorPair[];
export const DECORATIVE_TOKENS: readonly string[];            // --wall-rule, --scrim
export function pairRatio(tokens: Map<string,string>, p: ColorPair): number;   // via contrast.ts

// test-support/toe-facts.ts
export interface ToeFacts { header: HeaderFacts | null; groups: GroupFacts[]; tombstones: TagFacts[];
  breakdown: BreakdownFacts | null; proof: ProofFacts | null; skipped: string[]; }
export function toeFacts(root: ParentNode): ToeFacts;       // reads Fact_Hooks only

// test-support/arbitraries.ts
export const proofReportArb: fc.Arbitrary<ProofReport>;
export const proofKindArb: fc.Arbitrary<ProofKind>;
```

`toeFacts` extends the existing `renderedFacts` idea: it reads text through `.tomb-name`, `.tomb-score .visually-hidden`, `.tomb-summary`, `.tomb-badge`, `ul.counts button[data-grade] .num`, `table.breakdown td[data-label]`, `tfoot tr.total`, and in the proof section through `.proof-badge`, `.proof-pre`, `.proof-sites li`, `.proof-attempts > li`. It never reads layout classes, Tag_Labels, decorative spans or the Source column's markup (only its text and `href`).

## Data Models

### Tokens (`tokens.css`)

```css
:root {
  color-scheme: light;

  /* ground and surfaces */
  --wall: #C9CFCB;       --wall-rule: #BCC3BF;   /* decorative ruled lines */
  --tag: #E9D4A3;        /* Manila: Toe_Tag, Sheet_Tag, demo cards only */
  --paper: #F1F2EE;      --paper-grid: #E3E6E1;  --paper-hot: #F6DEDA;

  /* ink */
  --ink: #1B2328;        --ink-soft: #3B474D;

  /* status and accents */
  --red: #C4271D;        --red-ink: #A81F16;     /* DEAD band, Stamp border / red text */
  --rust: #9A3F12;       /* DYING band only (status shade, never brand) */
  --amber: #B8860B;      /* AILING band, WEAK stamp border */
  --steel: #2F5D7C;      --steel-ink: #264A66;   /* ALIVE band / links */
  --on-band: #FFFFFF;
  --scrim: rgba(27, 35, 40, 0.6);               /* decorative, flat, no blur */
  --focus: #1B2328;

  /* fonts */
  --font-display: "Barlow Condensed", "Arial Narrow", sans-serif;
  --font-body: "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace;
  --font-label: "Special Elite", "Courier New", monospace;

  /* type scale (rem; root is 16px at every width) */
  --size-wordmark: clamp(2.5rem, 7vw, 3.5rem);
  --size-h1: 1.25rem;     --size-h2: 1.5rem;      --size-h3: 1.125rem;
  --size-body: 1rem;      --size-small: 0.875rem; --size-label: 0.75rem;
  --size-name: 1.0625rem; --size-band: 1.25rem;   --size-value: 0.9375rem;
  --size-score-dead: 3.5rem;  --size-score-dying: 2.75rem;  --size-score-compact: 2rem;
  --track-label: 0.08em;  --track-display: 0.06em;  --track-band: 0.14em;

  /* space, rules, shape */
  --space-1: 0.25rem; --space-2: 0.5rem; --space-3: 0.75rem; --space-4: 1rem; --space-5: 1.5rem; --space-6: 2.5rem;
  --target: 44px;
  --rule: 2px;  --rule-thin: 1px;  --rule-heavy: 3px;  --radius: 2px;
  --ring-width: 3px;  --ring-offset: 2px;
  --tag-chamfer: 1.25rem;  --tag-hole: 0.875rem;  --tag-hole-y: 1.125rem;  --string-height: 1.75rem;

  /* motion */
  --swing-duration: 700ms;  --stamp-duration: 220ms;
}
```

`--rust` is a candidate; the test fixes it.

### Type scale

| role | font | size | notes |
|---|---|---|---|
| wordmark | display 700 | `--size-wordmark` 40 to 56px | uppercase, tracking `--track-display`, `p` |
| h1 | display 700 | 20px | uppercase, tracking, the screen heading |
| h2 (groups, sheet name) | display 700 | 24px | uppercase |
| h3 (Proof, evidence) | display 600 | 18px | uppercase, in caption bars |
| body | body 400 | 16px | |
| tag name | mono 600 | 17px dead, 16px others | `overflow-wrap: anywhere` |
| tag score | display 700 | 56 / 44 / 32px | line-height 1 |
| Band word | display 700 | 20px | uppercase, tracking `--track-band` |
| Tag_Label, column labels | label 400 | 12 to 13px | uppercase, tracking `--track-label`, Ink-soft |
| values, points, seeds | mono 400 | 15px | |
| Stamp | display 700 | 20px (attempts 14px) | |

### Pair_Registry (`theme/pairs.ts`)

One row per use; the Stylesheet may only combine tokens that appear together in a row. (Row ids abbreviated.)

| id | fg on bg | min |
|---|---|---|
| body-wall | ink / wall | 4.5 |
| soft-wall | ink-soft / wall | 4.5 |
| link-wall | steel-ink / wall | 4.5 |
| err-wall | red-ink / wall | 4.5 |
| body-tag, soft-tag, link-tag, err-tag | ink, ink-soft, steel-ink, red-ink / tag | 4.5 |
| body-paper, soft-paper, link-paper, err-paper | ink, ink-soft, steel-ink, red-ink / paper | 4.5 |
| body-grid, soft-grid, link-grid, err-grid | ink, ink-soft, steel-ink, red-ink / paper-grid | 4.5 |
| body-hot, link-hot, err-hot | ink, steel-ink, red-ink / paper-hot | 4.5 |
| bar-text | paper / ink, tag / ink | 4.5 |
| band-red, band-rust, band-steel | on-band / red, rust, steel | 4.5 |
| band-amber | ink / amber | 4.5 |
| edge-wall, edge-paper, edge-tag | ink / wall, paper, tag (component edge) | 3 |
| ring-wall, ring-tag, ring-paper | focus / wall, tag, paper | 3 |
| large-red | red / paper (stamp border and heavy rules only, non-text) | 3 |

Registry coverage rule: every color token except `--wall-rule` and `--scrim` appears in a row.

## Steering file (`.kiro/steering/graveyard-ui.md`) outline

```
---
inclusion: fileMatch
fileMatchPattern: "apps/exorcist-web/**"
---
# Graveyard UI: Toe Tag
Concept (3 sentences) · Tokens (table: token, value, role, where allowed) · Type scale (table above)
Components (Toe_Tag, Band, Form_Grid, Stamp, Compare_Box, Sheet_Tag, controls, notices, focus ring, motion, narrow rules)
BANNED looks:
  1. Dark background with glowing or neon accents      — the Wall is light gray-green, no glow, hard shadows only.
  2. Cream/ivory paper + serif display headline + rust/terracotta/orange accent
                                                        — Manila only on tag objects; display is condensed sans; rust only as the DYING band.
  3. Purple gradients                                  — no purple hue; the only gradient is the ruled-lines background.
  4. Glassmorphism                                     — no backdrop-filter, no blur, scrim is flat.
  5. Generic SaaS cards                                — tags are shaped objects; radius ≤ 2px; no soft shadows; no icon-title-text boxes.
  6. White with one blue accent and hairline borders   — gray Wall; 2px Ink rules; steel-ink only for links and the ALIVE band.
Rules for editing: tokens only in tokens.css; add a pair to theme/pairs.ts before using a new color combination;
  Special Elite only on tiny labels; links are never made from report strings; motion only inside no-preference.
```

## Decisions and Requirement Clarifications

- **Frozen v2 references, not v1.** The v1 copies predate the polish fix (two grade labels, empty total cells). v2 freezes the current production views; polish's own P10 keeps using v1 and keeps passing.
- **Facts through hooks, not layout.** Preservation compares text and attributes read by `toeFacts`; it cannot be fooled by moving a number into a decorative span, because decorative spans are `aria-hidden` and are not read.
- **Baseline first.** Properties 1 to 3 are written and run green on the unchanged page before any view or CSS change, so a red later is the redesign's fault.
- **Group tabs are the count buttons.** No `tablist`, no filtering. The grade color is a bottom rule from CSS (`[data-grade]`), replacing the inline `style.borderTopColor`.
- **Dead is "largest" by score size and tag height, not by a different shape.** The Band word and the red Band carry DEAD in text and color; all four grades share the tag shape, as in the mockup.
- **Band text.** White on red, rust and steel; Ink on amber (white on amber is 3.25:1).
- **Links.** `--steel-ink`, not `--steel` (4.46 on the Wall).
- **Red text.** `--red-ink`; `--red` is for fills and the Stamp border.
- **Disabled look.** Dashed border and Paper-grid face instead of opacity, so the text keeps AA.
- **Root size.** 16px at every width. The old 18px at 1200px existed for a 1920 recording; the new reference width is 1352 and the mockup's density needs 16px.
- **Tag_Swing on the Sheet_Tag.** See the Overview of requirements: the clicked tag can be covered, or not exist.
- **Special Elite is Apache-2.0.** The license folder holds the Apache text; the README states it; the steering file notes it.

## Correctness Properties

All properties use fast-check with `numRuns: 100` and the Fast_Check_Runner (`assertProperty`; `FC_SEED` wins, `CI` fixes 20261113, otherwise the random seed is recorded on failure). Each property file exports `build(impl)`. Properties 1 to 3 are DOM properties (jsdom, async, `checkAsyncProperty`); 4 to 8 are static properties over the Token_File and the Stylesheet text (Node environment).

### Property 1: Scan_Report facts are preserved

**Validates: Requirements 14, 15**

For any generated Scan_Report (0 to 60 dependencies; calibrated, all-unknown, dying and colliding-name packages; hostile strings) and any generated open-package index:
- `toeFacts(redesigned page)` deep-equals `toeFacts(Reference_Views render)` (header counts, total, meta line, legend, warnings; per tag key, grade, accessible name, name, score text, cause, unknown badge; group order; the open Breakdown rows with label, explanation, value, status, points, source text and href or withheld text; calibration text; total; mismatch rows; skipped list);
- the same facts equal the facts computed from the report by an independent function (`expectedFacts`): keys per grade, sorted by the view-model order; `"<points> / <weight>"` per part; `"+<points>"` per calibration; `"<score> / 100"` total;
- header counts equal a recount by `death.grade`, and no tag, row or count appears that the report does not contain.

Real-data example tests: the four `/demo/*.json` reports, same equality.

Sabotages (each must be caught): drop the last tombstone of a group; swap the score text of two tags; show `toGrade(score)` instead of `death.grade` on the Band; omit the Calibration_Row; show the weight where points belong; hide the "n unknown" badge; cut every name to 20 characters; reverse the order of the dead group; take header counts from `report.summary`; replace the cause text with the package name; write the open package's total as `score / 10`.

### Property 2: Proof_Report facts are preserved

**Validates: Requirements 14, 16**

For any generated Proof_Report (five kinds; 0 to 80 call sites; 1 to 3 attempts; multi-line, unicode and hostile text; counterexamples) rendered in the Proof section of an open dead package, and for each non-report state (`absent`, `failed`, `invalid`):
- the proof facts of the redesigned page deep-equal those of the Reference_Views `renderProofSlot`;
- they equal the facts computed from the report through the skeleton's proof view: badge label; runs and seed line; sabotage line; recommendation; the first 50 call-site texts in order and `and <n> more` when over 50; per attempt number, badge label, candidate, runs and seed, sabotage line, error text; per counterexample the shrunk input, old output and new output, byte for byte (compared on `textContent` of `pre.proof-pre`, so whitespace and newlines count);
- the Stamp text equals the `badgeLabel` (case is a CSS matter and is not compared);
- for `absent`, `failed`: "Exorcism coming" and no badge; for `invalid`: also the unreadable line.

Real-data example tests: every `demo/proofs/**/*.json`.

Sabotages: swap old and new output; drop the shrunk input; render only the first attempt; truncate call sites at 20 without the "more" line; omit the seed; omit the sabotage line; hide the recommendation; trim whitespace of outputs; show `proved` for a `weak` report; drop the unreadable line for `invalid`.

### Property 3: Report strings stay text and links stay safe

**Validates: Requirements 14.3, 15, 16**

For any Scan_Report and Proof_Report whose free-text fields are drawn from the hostile corpus (`<img src=x onerror=alert(1)>`, `javascript:alert(1)`, `&lt;b&gt;`, `"><script>`, 200-character unbroken strings, `data:text/html,x` as source URLs) and arbitrary strings, with the redesigned page mounted and the package opened:
- the document has no `img`, `script`, `iframe`, `object`, `embed`, `svg` or `style` element created from report text, and no element has an attribute starting with `on`;
- no `style` attribute value contains report text (the only inline style is the points bar width, a number followed by `%`);
- every `a[href]` has an `href` that matches `^https?://` (Source_Links) or starts with `#` (skip link), and no `a` exists inside `section.proof` or inside a Tag_Field;
- decorative elements added by the redesign (`tag-hole`, `tag-label`, `tag-range`, `sheet-tag` decorations) contain no report text.

Sabotages: render the package name through a parsed fragment so `<img` creates an element; make call sites anchors; copy a report string into a `style` attribute; set `href` from the unsafe `sourceUrl`; copy the counterexample input into a `data-` attribute used as a CSS `content` (rejected by the attribute check); add an `onclick` attribute built from a name.

### Property 4: Contrast meets WCAG AA

**Validates: Requirements 3, 17**

For any pair `p` drawn from the Pair_Registry, the ratio `contrastRatio(token(p.fg), token(p.bg))` computed from `tokens.css` is at least `p.min`. Also: every non-decorative color token is in some pair; every `color`/`background` token reference in the Stylesheet's component rules forms a pair that is in the registry (the extractor pairs each rule's `color` with its `background`/`background-color` or the nearest registered surface of the selector); `--focus` equals `--ink`; no color literal exists outside `tokens.css` (Requirement 3.2); no legacy token name is defined or referenced.

Sabotages (token-file text mutations): `--on-band` text on amber (put white on the AILING band); `--ink-soft` lightened to `#6B777D`; `--steel-ink` replaced by `--steel` for link rules; `--red-ink` replaced by `--red` for error text; `--paper-hot` darkened to `#E9B8B0`; `--focus` set to `--wall`'s value; `--rust` lightened to `#C0602A`; a new color token added with no pair.

### Property 5: Banned looks are absent

**Validates: Requirements 2, 18**

For the Token_File and the Stylesheet, the nine assertions of Requirement 18.1 (a to i) hold, the label font appears only in allowlisted selectors, and `--tag` is a background only in Toe_Tag, Sheet_Tag and demo-card selectors.

Sabotages (one per Banned_Look, plus extras): `--wall` set to `#0B1215` and `color-scheme: dark` (look 1); `.tombstone { box-shadow: 0 0 24px rgba(255,106,61,.5) }` (look 1, glow); `--paper` set to `#F5EFE0` and `h1 { font-family: Georgia, serif }` and `.proof-badge { color: #C2410C }` (look 2); `body { background: linear-gradient(135deg, #7B2FF7, #F107A3) }` (look 3); `.sheet { backdrop-filter: blur(8px) }` (look 4); `.tombstone { border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,.15) }` (look 5); `--wall: #FFFFFF` with `.tombstone { border: 1px solid #D0D7DE }` (look 6); `--rust` used for `a { color: var(--rust) }`; Special Elite on `h1`; `--tag` as `body` background.

### Property 6: Narrow viewport layout rules hold

**Validates: Requirements 9.9, 9.12, 10.9, 10.10, 19**

For every rule in the Stylesheet (parsed declarations with preludes) and every class in the text-bearing registry:
- grids: every `grid-template-columns` value is built from `minmax(0, …)`, `min(100%, …)`, `auto` or `1fr` inside `minmax`; the base (no media query) tag grid has 2 columns, the `max-width: 22.5rem` grid 1, the `min-width: 48rem` grid 3, the `min-width: 64rem` grid 4;
- no `width`, `min-width` or `flex-basis` above 343px (21.4375rem) outside a `min-width` media query, except `.sheet` (`min(100%, 56rem)`);
- every text-bearing class (`.tomb-name`, `.tomb-summary`, `.col-signal`, `.proof-pre`, `dd`, `.tag-field` children, `.proof-cell`, `.notice`, `.error`, `.demo-card` text) has `overflow-wrap: anywhere`; `.proof-pre` has `white-space: pre-wrap`; `white-space: nowrap` appears only on `.col-status`, `.col-points`, `button`, `.btn`, `.tag-label`, `.tag-band`;
- every rule that targets an interactive element sets `min-height: var(--target)` (and `min-width` where it is not full width);
- below `max-width: 40rem` the Form_Grid has the boxed-record rules (`tr` grid with two columns, `td::before` with `attr(data-label)`);
- the Sheet_Tag has `max-width` of at most `calc(100% - 2rem)`.

Sabotages: remove `overflow-wrap: anywhere` from `.tomb-name`; `.tombstone { min-width: 400px }`; base tag grid `repeat(4, 1fr)`; `.tomb-summary { white-space: nowrap }`; `.proof-pre { white-space: pre }`; `.sheet { width: 56rem }`; remove the `max-width: 22.5rem` one-column rule; remove `min-height: var(--target)` from `.count`.

### Property 7: Motion is gated, finite and not blocking

**Validates: Requirements 20**

Static part (over declarations): every `animation*`, `transition*` and `scroll-behavior: smooth` declaration sits inside `@media (prefers-reduced-motion: no-preference)`; no `animation` value or `animation-iteration-count` contains `infinite`; `@keyframes tag-swing` exists inside the no-preference block with a maximum rotation of at most 8deg; `.sheet-tag` animation has duration `var(--swing-duration)` and iteration count 1; a `prefers-reduced-motion: reduce` block sets `animation: none` for `.sheet-tag` and `.sheet-tag .tag-band`; the ember pulse is gone.

DOM part (jsdom, over generated reports): after `click(tombstone)` returns (no timers advanced), the panel is not hidden, `document.activeElement` is `h2#detail-title`, `location.hash` contains `pkg=`, and `.sheet-tag` exists with the grade attribute; the source of `views/detail.ts` and `views/tombstone.ts` contains no `setTimeout`, `requestAnimationFrame` or `animationend` listener.

Sabotages: move `@keyframes tag-swing` and its rule outside the media block; `animation-iteration-count: infinite`; a `transition` on `.tombstone` outside the block; remove the `reduce` block; `rotate(25deg)` in a keyframe; a DOM sabotage in which `open()` runs inside `setTimeout(…, 700)` (the DOM part must fail).

### Property 8: The focus ring is never clipped or lost

**Validates: Requirements 21**

Over the parsed Stylesheet: `:focus-visible` is `var(--ring-width) solid var(--focus)` with `var(--ring-offset)`; the only outline removals are `:focus:not(:focus-visible)` and `h1[tabindex="-1"]:focus`; no rule whose selector can match a focusable element (`button`, `.btn`, `a`, `input`, `summary`, `.tombstone`, `.count`, `.backdrop`, `.demo-card`, `[tabindex]`), or an ancestor (`li`, `.grid`, `.group`, `.screen`, `.app`, `.stack`, `.row`, `.picker`, `.status`, `.sheet`, `body`, `html`), declares `clip-path`, `mask`, `overflow: hidden` or `overflow: clip`; `clip-path` appears only on `::before`/`::after` selectors; the tag grid gap is at least `var(--space-4)`; `@media (forced-colors: active)` sets `outline-color: Highlight` and `CanvasText` borders for `.tombstone`, `.sheet`, `table.breakdown th, td`, `.proof-badge`, `.proof-compare`.

Sabotages: `.tombstone { clip-path: polygon(…) }`; `.grid > li { overflow: hidden }`; `.tombstone:focus-visible { outline: none }`; ring color set to `var(--tag)`; ring width 1px; remove the forced-colors block; `outline-offset: -8px`.

### Central sabotage test

`toetag.sabotage.test.ts` runs P1 to P3 against their DOM sabotage lists (jsdom) and P4 to P8 against their text mutations (Node), with the fixed seed 20261113. It fails with `Sabotage "<name>" stayed green for "<property>"`, asserts that every list is non-empty, that every mutation really changes its input, and that the real implementation passes every property under the same seed. CSS mutation helpers reuse `replaceOnce` semantics (a stale mutation throws).

## Error Handling

This spec adds no run-time error path. Presentation failure modes:

| situation | behavior |
|---|---|
| a woff2 file fails to load | `font-display: swap` shows the fallback stack; layout holds because every stack ends in a generic family |
| a glyph outside the Latin subset | generic fallback for that glyph |
| CSS custom property missing | caught at build time by the "no undefined `var()`" check in Property 4 (every `var(--x)` has a definition) |
| `prefers-reduced-motion` unsupported | treated as no preference; the swing plays once, 700ms |
| very long unbroken string | wraps inside its field or pre (Property 6) |
| browser without `clip-path` | the Ink layer shows as a plain rectangle; still readable and focusable |

## Testing Strategy

- **Preservation (DOM, jsdom):** Properties 1 to 3 plus real-data example tests over `/demo/*.json` and `demo/proofs/**`. Written first, green on the unchanged page.
- **Static (Node):** Properties 4 to 8 plus the font checks (files exist, `wOF2` magic bytes, size budget, license files, README hashes match, `@font-face` targets exist, no remote URL) and the "no color literal outside tokens" check.
- **Updated old tests:** only those listed in Requirement 22.
- **Unchanged old tests:** everything else, in particular the keyboard, focus, states, proof and safety suites.
- **Build:** `npm run build -w @graveyard-kit/exorcist-web` once, to confirm `dist/fonts/` and the unchanged CSP.
- **Not covered by automated tests:** real layout and overflow, real focus ring rendering on chamfered tags, whether the swing is visible and stays inside the sheet, font rendering, forced-colors rendering. The final task checks these in a browser and reports honestly.
- **No network:** the fake `fetch` and `no-network.setup.ts` stay.

## Risks

- **jsdom ignores layout and `inert`.** The 375px rules are guarded by CSS-text properties only; the browser check is the real test. The report must say what was not run.
- **Stacked table semantics.** Putting `display: block|grid` on table parts can drop table semantics in some browsers. The reflow mechanism already exists and is kept; the DOM and `data-label`s are unchanged.
- **`clip-path` pseudo-elements and `forced-colors`.** In forced colors, backgrounds are overridden and the pseudo-element edge may vanish; the button also gets a `CanvasText` border there (Requirement 21.4).
- **Swing overflow.** The rotated Sheet_Tag could extend past the sheet's content box. `max-width: calc(100% - 2rem)` and the sheet's padding contain it; the browser check watches for a horizontal scrollbar during the swing.
- **Font weight/licenses drift.** Fontsource may change filenames or subsets. The README records package versions and SHA-256, and the font test fails if a file or license goes missing.
- **Special Elite legibility at 12px.** It is a worn typewriter face. It is used only for captions that are also available as text elsewhere in the accessible name or heading; `--ink-soft` keeps 6:1.
- **Sabotage fragility.** Literal-text CSS mutations break when CSS text changes; each phase that changes CSS re-points the mutations it invalidates in the same task.
- **Rust value.** `#9A3F12` is a candidate from the mockup; the contrast test decides. If it must move, the mockup's look moves slightly.

## Judgment Calls

Decisions made without asking, for the owner to confirm or reverse:

1. **Special Elite is Apache-2.0, not SIL OFL.** The brief says all four are OFL; the font's own copyright line and Fontsource say Apache-2.0. The spec ships the Apache license text for it and OFL texts for the other three.
2. **Band text on AILING is Ink, not white.** White on `#B8860B` is 3.25:1.
3. **Links use `--steel-ink` (`#264A66`), not `--steel`** (4.46:1 on the Wall). The ALIVE Band keeps `--steel`.
4. **Red text uses `--red-ink` (`#A81F16`).** `--red` as text fails on the Wall and on the tinted cell.
5. **Call sites stay text.** The mockup underlines them; proof-harness Requirement 14.4 forbids links from report strings.
6. **Boxed-record Form_Grid at 375 instead of the mockup's 4-column grid.** Real sources, values and explanations do not fit 343px without mid-word breaks.
7. **Compare_Box stacks below 40rem.** Real counterexample outputs are long; the mockup's side-by-side at 375 would wrap them to a few characters per line.
8. **Compare_Box keeps DOM order input, old, new.** The mockup shows the shrunk input under the cells; visual reordering would split reading and tab order.
9. **The sheet stays a modal dialog.** The mockups' inline boxes would change the focus and `inert` behavior.
10. **Tag_Swing on the Sheet_Tag, not on the clicked tag.** Always visible, one rule for click, deep link and Back/Forward, no JavaScript.
11. **Sheet_Tag Band has no text.** The grade word already exists in the facts block.
12. **Group tabs stay count buttons.** No `tablist`, no filtering.
13. **Root font 16px at every width.** The 18px at 1200px rule and the 56px recording size lines of the old tests are retired or re-pointed; the dead score is still at least 56px.
14. **The mockup's "THE GRAVEYARD" tab and wording ("4 CLAIMED", "0 maint.", "2 vulns", "active") are not rendered.** They are sample copy and derived values not in the report. The Band shows the grade word and, when there is nothing unknown, the grade's score range; the meta line keeps the existing text.
15. **Disabled controls use a dashed border and Paper-grid face, not opacity.**
16. **No wordmark heading.** `PRODUCT_NAME` is a `p`; the `h1` keeps "The Graveyard: owner/repo" so titles, focus and tests do not change.
17. **Frozen v2 views** are a second copy next to v1; v1 stays for the polish properties.
18. **`FORM_SUBTITLE` is decorative copy** ("Office of the Dependency Examiner · Form LR-1"); it is not data and carries no count.

## Polish (bugfix)

The seven visual defects found after this redesign are fixed by `.kiro/specs/toe-tag-polish/`. It changes these rules of this design (the polish spec wins where they differ):

- The Band runs the full width of the tag, edge to edge (`align-items: stretch`).
- Tag fields are left-aligned and ruled by Field_Lines.
- The tag grid is 1 column below 32.5rem (not 22.5rem); tag names break at `<wbr>` Split_Points after "/" and "-", with `overflow-wrap: break-word` as the last resort.
- The home page has a Masthead (`h1` wordmark, subtitle, pitch line); Demo_Cards hang with string and hole and show the dead count.
- The subtitle is two nowrap phrases so "LR-1" is never alone on a line.
- Proof is shown for any grade when a valid report exists.
