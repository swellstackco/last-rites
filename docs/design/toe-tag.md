# Design direction: Toe Tag (chosen by Ben, 2026-11-13)

Chosen from three directions researched from real references (death certificates, morgue toe tags, burial registers, coroner's inquest forms, dense dev-tool reports). Mockups: toe-tag-mockup-desktop.png, toe-tag-mockup-mobile.png (static, for direction only; the sample data in them is fake).


**Concept.** Every package is a morgue toe tag hanging from a string on a cool institutional-gray wall. Status is the tag's colored band (red DEAD, rust-brown DYING, amber AILING, steel-blue ALIVE) exactly like the real tag's red band. The breakdown is a government death-certificate grid with tiny typewriter labels over mono values; the Proof is an examiner's finding with a rubber stamp.
**Refs:** 08, 09, 06, 14, 03, 05, 04, plus dev-tool density from 20, 23, 28, 16, 21.
**Tokens:** bg `#C9CFCB` (morgue steel gray-green, faint ruled lines), surface/tag `#E9D4A3` (manila), paper `#F1F2EE`, ink `#1B2328`; accents red `#C4271D`, steel `#2F5D7C`, amber `#B8860B`; rule: 2px solid ink boxes, 1px grid lines, chamfered tag corners with punched hole.
**Type:** Barlow Condensed (display, uppercase tracked), IBM Plex Sans (body), IBM Plex Mono (numbers/code), Special Elite (tiny field labels only).
**Graveyard grid:** 4-up row of tags hanging from strings, group tabs above as stamped labels; each tag = PACKAGE / SCORE / CAUSE fields, huge condensed score, colored band at bottom.
**Breakdown table:** fully gridded form, black header bar, label row in typewriter caps, values in Plex Mono, calibration row shaded and italic, total in a heavy bottom cell.
**Proof:** boxed two-cell compare (OLD OUTPUT | NEW OUTPUT, new cell tinted red), red tilted stamp COUNTEREXAMPLE / PROVED / NO CALL SITES, call sites as links.
**Signature:** the tag itself, with string and punched hole; on click it swings once and the band stamps the status.
**Steal list:** red band (08), field labels (08), numbered micro-cells (06, 14), stamp (14), big number (16), banner wording (23).
**Banned check:** not dark, no glow; bg is cool gray, not cream; no serif display (condensed sans); accent is signal red/steel, not rust-orange as brand (DYING brown is a minor status shade); no purple, glass, or generic card (tags are shaped objects); not white + blue hairline + split hero.

