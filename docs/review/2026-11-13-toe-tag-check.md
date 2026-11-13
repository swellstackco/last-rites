# Toe Tag manual browser check (task 11.3)

Status: RUN with Google Chrome driven by playwright-core (from the npx cache, not added to any package.json), against `dist/` served by a throwaway static server. `/api/*` answered 404 so the page used the static demo fallback; the error screen used a stubbed 429 on `/api/scan`, the loading screen a hanging `/api/scan`. Script lived in `/tmp/toe-check`, not committed. 40 of 40 scripted checks pass after one fix (below).

Sizes: 1352 x 761 (desktop) and 375 x 812 (mobile). Screenshots: `docs/review/2026-11-13-toe-tag-shots/<size>-NN-*.png`.

| check | desktop | mobile |
|---|---|---|
| home screen (demo cards, scan form) | pass (01-home) | pass |
| loading screen and an error screen (429) | pass (02, 03) | pass |
| parse-server demo, groups, alive expanded | pass (04-graveyard; dead 5, dying 0, ailing 14, alive 65) | pass |
| one dead tag open (Sheet_Tag, Form_Grid with calibration row and total, Proof Stamp) | pass (06, 07) | pass |
| Compare_Box with a counterexample | not run (no counterexample proof in the demo data; only DOM tests cover it) | not run |
| keyboard Tab pass, 3px solid focus ring on a Toe_Tag | pass (05-focus) | pass |
| `prefers-reduced-motion: reduce`: no animation on Sheet_Tag | pass (08) | pass |
| `forced-colors: active` emulated, page renders | pass (09); not visually judged in detail | pass |
| no horizontal scroll on home, error, loading, graveyard, sheet, and during the swing (page and sheet) | pass | pass (375) |
| 320 wide | n/a | only the Form_Grid overflow probe was run at 320 (pass after fix); other screens not run at 320 |
| `document.fonts.check` for all seven faces | pass | pass |
| no cross-origin request | pass | pass |
| Tag_Swing runs once (finite, 1 iteration) and has stopped after 1.3 s | pass | pass |
| targets at least 44px (home, tags, sheet) | pass | pass |
| side-by-side with `docs/design/toe-tag-mockup-*.png` | not run as an automated check; only my own look at the screenshots | not run |

## Failure found and fixed

At 375 and 320 the stacked Form_Grid let the Source cell (`Engine rule: declared_abandoned`, an unbreakable token, `overflow-wrap: normal` by Requirement 10.9) run past its record box (`td.col-source` 174 > 155 at 375; `table.breakdown` 345 > 339). The page itself did not scroll, but the text crossed the border. Fix in `detail.css`: the Source cell spans the full record row at or below 40rem, and Value, Status and Points each take a full row below 22.5rem. The probe now reports no overflow other than visually hidden header cells. The jsdom tests could not see this.
