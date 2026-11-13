# Toe Tag manual browser check (task 11.3)

Status: NOT RUN. This session had no browser it could drive (no screenshot or browser tool), so no check below was performed and none is claimed.

Sizes: 1352 x 761 and 375 x 812.

| check | desktop | mobile |
|---|---|---|
| home screen (demo cards, scan form) | not run | not run |
| loading screen and an error screen | not run | not run |
| parse-server demo, four groups, alive expanded | not run | not run |
| one dead tag open (Sheet_Tag, Form_Grid, Proof) | not run | not run |
| keyboard Tab pass, focus ring on a Toe_Tag | not run | not run |
| `prefers-reduced-motion: reduce` | not run | not run |
| `forced-colors: active` | not run | not run |
| no horizontal scroll (`scrollWidth <= clientWidth`), also during the swing | not run | not run |
| `document.fonts.check` for the four families, no cross-origin request | not run | not run |
| Tag_Swing visible once, absent under reduced motion | not run | not run |
| targets at least 44px | n/a | not run |
| comparison with `docs/design/toe-tag-mockup-desktop.png` and `-mobile.png` | not run | not run |

Covered only by static tests (not by a browser): wrapping, grid columns, targets and focus-ring rules as CSS text (Properties 6 and 8), DOM order and focus after open in jsdom (Property 7).
To run: `npm run build -w @graveyard-kit/exorcist-web`, then `npx vite preview` in `apps/exorcist-web`.
