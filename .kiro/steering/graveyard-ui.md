---
inclusion: fileMatch
fileMatchPattern: "apps/exorcist-web/**"
---

# Graveyard UI: Toe Tag

## Concept

The page is a mortuary wall: a cool gray-green Wall with faint ruled lines, where every dead package hangs from a string as a manila Toe_Tag with a colored Band. Opening a tag shows a gridded death-certificate Breakdown and a rubber-stamped Proof. It is a form-and-evidence look: 2px Ink rules, square corners, hard shadows, condensed display type and typewriter field labels.

## Tokens

All values live in `apps/exorcist-web/src/styles/tokens.css`. Colors, font stacks and sizes are written nowhere else. Add a pair to `theme/pairs.ts` before using a new color combination.

| token | value | role | where allowed |
|---|---|---|---|
| `--wall` | `#C9CFCB` | page ground | `body`, hole fill |
| `--wall-rule` | `#BCC3BF` | ruled lines | Wall gradient only (decorative) |
| `--tag` | `#E9D4A3` | Manila | Toe_Tag, Sheet_Tag, demo cards only. Manila on tag objects only, never a page or panel ground |
| `--paper` | `#F1F2EE` | panel, control face | boxes, sheet, controls |
| `--paper-grid` | `#E3E6E1` | grid and field face | table header cells, inputs, disabled controls, calibration rows |
| `--paper-hot` | `#F6DEDA` | New cell highlight | Compare_Box New cell |
| `--ink` | `#1B2328` | text, rules | text, edges, caption bars |
| `--ink-soft` | `#3B474D` | secondary text | labels, notes, muted text |
| `--red` | `#C4271D` | DEAD band | Band, heavy rules |
| `--red-ink` | `#A81F16` | red text and Stamp border | errors, counterexample Stamp, mismatch rows |
| `--rust` | `#9A3F12` (candidate; final value set in task 1.6) | DYING band | Rust is the DYING band only: a status shade, not a brand or interaction color |
| `--amber` | `#B8860B` | AILING band | Band, notice bar, WEAK Stamp border |
| `--steel` | `#2F5D7C` | ALIVE band | Band |
| `--steel-ink` | `#264A66` | links | links, PROVED Stamp |
| `--on-band` | `#FFFFFF` | text on red, rust, steel | Band text |
| `--scrim` | `rgba(27, 35, 40, 0.6)` | sheet backdrop | flat, no blur (decorative) |
| `--focus` | `#1B2328` | focus ring | every `:focus-visible` outline |
| `--font-display` | Barlow Condensed, Arial Narrow, sans-serif | headings, scores, bands, Stamp | uppercase display text |
| `--font-body` | IBM Plex Sans, system-ui, sans-serif | body text | prose, controls |
| `--font-mono` | IBM Plex Mono, ui-monospace, Menlo, Consolas, monospace | names, values, code | package names, numbers, `pre` |
| `--font-label` | Special Elite, Courier New, monospace | tiny field labels | Special Elite is for tiny field labels only; Apache-2.0 licensed |
| `--rule`, `--rule-thin`, `--rule-heavy` | 2px, 1px, 3px | box edge, grid line, heavy rule | all boxes |
| `--radius` | 2px | control corners | controls only; everything else is 0 (the hole is 50%) |
| `--target` | 44px | minimum touch target | every interactive control |
| `--ring-width`, `--ring-offset` | 3px, 2px | focus ring | global |
| `--tag-chamfer`, `--tag-hole`, `--tag-hole-y`, `--string-height` | 1.25rem, 0.875rem, 1.125rem, 1.75rem | tag geometry | Toe_Tag, Sheet_Tag |
| `--swing-duration`, `--stamp-duration` | 700ms, 220ms | the one motion | inside `prefers-reduced-motion: no-preference` only |
| `--space-1` to `--space-6` | 0.25, 0.5, 0.75, 1, 1.5, 2.5 rem | spacing | layout |

## Type scale

| role | font | size | notes |
|---|---|---|---|
| wordmark | display 700 | `--size-wordmark` 40 to 56px | uppercase, tracking `--track-display`, a `p`, except the `h1` on the home page (left-aligned) |
| h1 | display 700 | 20px | uppercase, tracking, the screen heading |
| h2 (groups, sheet name) | display 700 | 24px | uppercase |
| h3 (Proof, evidence) | display 600 | 18px | uppercase, in caption bars |
| body | body 400 | 16px | root is 16px at every width |
| tag name | mono 600 | 17px dead, 16px others | `overflow-wrap: break-word`; `<wbr>` after every "/" and "-" (Split_Points) so names break there first |
| tag score | display 700 | 56 / 44 / 32px | line-height 1 |
| Band word | display 700 | 20px | uppercase, tracking `--track-band` |
| Tag_Label, column labels | label 400 | 12 to 13px | uppercase, tracking `--track-label`, `--ink-soft` |
| values, points, seeds | mono 400 | 15px | |
| Stamp | display 700 | 20px (14px inside attempts) | |

## Component rules

- **Boxes**: `border: var(--rule) solid var(--ink)`; grid lines inside boxes are `1px solid var(--ink)`. Radius 0 except the hole (50%); controls 2px.
- **Toe_Tag**: `isolation: isolate; position: relative`. `::before` is the Ink layer and `::after` the Manila layer inset by `--rule`, both with the chamfered `clip-path` polygon, both behind the content. The button has `background: none; border: 0` and no `clip-path` or `overflow` on it or any ancestor, so its outline is a full rectangle.
- **Tag fields**: PACKAGE, SCORE, CAUSE are left-aligned on one edge, each ruled by a 1px Ink Field_Line; the last sits above the Band.
- **Demo cards**: hang like tags (string, hole) and show "N dead" when the snapshot count is known; nothing is shown otherwise.
- **String and hole**: `.grid > li` has `padding-top: var(--string-height)` and a 2px Ink line down to the hole center; the hole is a 0.875rem circle with a 2px Ink border and `--wall` fill.
- **Band**: full width, edge to edge along the bottom inside the border (`.tombstone { align-items: stretch }`), flex, space-between, colored by grade (dead `--red`, dying `--rust`, ailing `--amber` with Ink text, alive `--steel`), Band word in the display font. The grade word is spelled out in text, never color alone.
- **Sizes**: dead 15rem min-height, score 56px; dying 13rem, 44px; ailing and alive 9rem, 32px.
- **Form_Grid** (Breakdown table): Ink outer edge, 1px Ink grid lines, caption as a black bar, header cells as typewriter labels, values in mono, Calibration_Row on `--paper-grid` italic, total row with a heavy top rule. At or below 40rem each row becomes a boxed record with `data-label` captions; no horizontal scroll at 375 or 320.
- **Stamp** (`.proof-badge`): display font, uppercase, `--track-band`, 2px `currentColor` border, `rotate(-2.5deg)`, `max-width: 100%`, `overflow-wrap: anywhere`. Counterexample and error `--red-ink`; proved `--steel-ink`; weak Ink text with an amber border; no_call_sites `--ink-soft`. Inside attempts it is smaller and untilted.
- **Compare_Box**: Old and New cells as `pre.proof-pre` with `white-space: pre-wrap; overflow-wrap: anywhere`, one column narrow and two from 40rem; the New cell on `--paper-hot`.
- **Sheet_Tag**: the sheet head is a manila tag with the same two-layer chamfer, a string above, a hole, the `h2` name and a text-free Band. The panel scrolls with `overflow-y: auto`, never `hidden` or `clip`.
- **Controls**: Paper face, 2px Ink rule, 44px minimum target, body font 600; primary is an Ink face with Paper text; hover is a hard offset shadow. Disabled controls get a dashed border, `--paper-grid` face, `--ink-soft` text and `cursor: not-allowed`, with no opacity.
- **Notices**: `.notice` is Paper with a 2px Ink rule and a 6px amber left bar; `.error` is the same with `--red-ink`. No icon.
- **Focus ring**: `:focus-visible { outline: var(--ring-width) solid var(--focus); outline-offset: var(--ring-offset) }` everywhere; never clipped, never removed.
- **Motion**: one finite tag swing and one Band stamp on the sheet, only inside `@media (prefers-reduced-motion: no-preference)`, with an explicit `reduce` block that turns them off. No `infinite`, no JavaScript timers, no transitions outside the no-preference block. Hover uses no transition.
- **Narrow rules**: the page works at 375 and 320 with no horizontal scroll; tag grid is 1 column below 32.5rem, 2 from 32.5rem, 3 from 48rem, 4 from 64rem; text never breaks mid-word in short cells.

## BANNED looks

1. Dark background with glowing or neon accents. The Wall is light gray-green; there is no glow, only hard shadows.
2. Cream or ivory paper with a serif display headline and a rust, terracotta or orange accent. Manila appears on tag objects only, the display face is a condensed sans, and rust is only the DYING band.
3. Purple gradients. No purple hue exists in the tokens, and the only gradient is the Wall's ruled lines.
4. Glassmorphism. No `backdrop-filter`, no blur; the scrim is flat.
5. Generic SaaS cards. Tags are shaped objects, radius is at most 2px, shadows are hard and unblurred, and there are no icon-title-text boxes.
6. White with one blue accent and hairline borders. The ground is gray, rules are 2px Ink, and steel-ink is used only for links and the ALIVE band.

## Rules for editing

- Tokens only in `tokens.css`; font files only in `fonts.css`.
- Add a pair to `theme/pairs.ts` before using a new color combination.
- Special Elite only on tiny labels.
- Links are never made from report strings.
- Motion only inside `prefers-reduced-motion: no-preference`.
- Changes here are presentation only: no change to text, routes, data, `aria-*` or the Fact_Hooks.
