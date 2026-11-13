# Toe Tag polish manual browser check (task 9.1)

Status: RUN with Chromium (playwright-core 1.62 from the npx cache, default Chromium; nothing added to any package.json) against the built `dist/` served by a throwaway static server. `/api/*` answered 404, so the page used the static demo fallback. Script: `2026-11-13-toe-tag-polish-shots/check.mjs.txt` (not part of the test suite). Viewports 1352x800, 390x844, 320x700. 64 of 64 scripted checks pass in the final run (the first runs hit Chromium navigation timeouts from the environment and were rerun; one early run had two defects in the script itself, fixed in the script, not in the app). Screenshots: `2026-11-13-toe-tag-polish-shots/`.

| item | 1352 | 390 | 320 |
|---|---|---|---|
| T1 `parse-server` / `intersect` shows Proof_Section with attempt 1 COUNTEREXAMPLE and PROVED | checked | checked | checked |
| T1 same after reload (report arriving after open) | checked | checked | checked |
| T1 `prettier` and `jest` panels: no Proof_Section, no placeholder | checked | checked | checked |
| T1 `deep-diff` still shows proof | checked | checked | checked |
| T2 Band edge to edge, bottom of every tag (19 tags) | checked | checked | checked |
| T3 PACKAGE, SCORE, CAUSE on one left edge, left-aligned, three fields per tag | checked | checked | checked |
| T4 each subtitle phrase on one line, home and graveyard (the phrases wrap as units; "Form LR-1" never alone) | checked | checked | checked |
| T5 `h1` "Last Rites" (56px at 1352, 40px below), pitch line, four hanging cards with hole and "5/1/0/0 dead" | checked | checked | checked |
| T5 snapshot requests blocked: no counts, no error, four cards | checked | checked | checked |
| T6 summary in label font, uppercase, 44px, Enter/Space toggle, "+" marker, focus ring 3px solid | checked | checked | checked |
| T7 grid columns 4 / 1 / 1; long scoped names fit; `<wbr>` present on every tag name with a separator | checked | checked | checked |
| No horizontal scroll (home, graveyard) | checked | checked | checked |
| No cross-origin request, no console error (other than the expected `/api` 404s and the meta `frame-ancestors` notice) | checked | checked | checked |

Not run or only looked at by eye:
- Widths 520, 768 and 1024 (2, 3 columns) were not run; 4 columns checked at 1352, 1 column at 390 and 320.
- Mid-word breaks were not measured directly; only "names fit their box" and `<wbr>` presence.
- Mockup comparison: screenshots looked at by eye only (home at 1352, graveyard at 390); no pixel or structured comparison.
- Sheet_Tag swing and focus ring on tags were not re-run (unchanged by this spec).
- Pre-existing, outside this spec: the skipped-packages list uses `.tomb-name` without `<wbr>` (`views/skipped.ts`).
