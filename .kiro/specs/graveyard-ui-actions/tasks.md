# Implementation Plan: graveyard-ui-actions (bugfix)

## Overview

Fixes B1 (proofs of github-actions demos not found, and their proof kinds not shown), B2 (npm-only lockfile notice) and B3 (npm links and wording for action names) of the Graveyard_Page. Order follows the bugfix workflow: explore the bugs on unfixed code (fail-first), capture the npm preservation baseline (pass), implement, re-verify, sabotage, fallout, document, checkpoint. Commits reference task numbers (for example `graveyard-ui-actions 3.3: ...`). Touched: `skeleton/src/proof/` (names, sha256) and `skeleton/src/graveyard/` (proof view, breakdown labels option), `apps/exorcist-actions/src/proof/names.ts` (re-export only), `apps/exorcist-web` (controller, header model and view, detail, proof-slot view, package link). Do not touch the codec, the scanner, `demo/**`, the score engine or `vite.config.ts` (tested only). 23 tasks.

## Tasks

### Phase 1: Explore the bugs on unfixed code (all expected to FAIL)

- [x] 1.1 B1 exploratory DOM test. Add `actionsReportArb` (github-actions reports with Action_Names of the form `o/r[/p]`, mixed grades, a random proof store keyed by `actionProofName`) to `test-support/arbitraries.ts` and Property 1 in `test-support/properties/p-actions-1.ts` with `actions.proof.dom.test.ts` (`numRuns: 100`). Examples: open `actions-rs/toolchain` and `actions/checkout` on the committed `demo/nixpacks-actions.json` with the two committed proof files served by the fake API. Also check, on the unfixed vite plugin, that `proofNamesFromPath` accepts both committed paths and that the build emits both files (expected to PASS; it falsifies or confirms the vite hypothesis). Run on UNFIXED code; confirm Property 1 and both examples fail with `coming_soon` and no request. _Requirements: 1.1, 1.2, 2.2, 2.4_
- [x] 1.2 B1 view exploratory test. Property 4 in `p-actions-4.ts` and `actions.proofview.test.ts`: generated Pin_Kind and Contract_Kind attempts, the two committed reports (kind line, coverage text, rewrite lines, hostile rewrite as text). Run on UNFIXED code; confirm they fail because the fields do not exist, while the "other shapes unchanged" half passes. _Requirements: 1.3, 2.5_
- [x] 1.3 B2 exploratory test. Property 5 in `p-actions-5.ts` and `actions.header.dom.test.ts`: header text for arbitrary reports and for the committed nixpacks demo. Run on UNFIXED code; confirm it fails with the npm sentence for github-actions and that the npm half passes. _Requirements: 1.4, 2.6_
- [x] 1.4 B3 exploratory test and locating the surface. Property 6 in `p-actions-6.ts` and `actions.links.dom.test.ts`: `packageHref` cases (the function does not exist yet: write the test against the design signature; it fails on import) and the page check (no `npmjs.com` in any `href` or `aria-label`, no "Deprecated on npm", every Package_Link host `github.com`) on the committed nixpacks demo with every package opened. On the unfixed page, list every href, aria-label and label derived from a name and say which one the operator saw (`grep -rn "npmjs" apps/exorcist-web/src skeleton/src/graveyard` and a look at the deployed `dist`). If no npm link exists in source, record that, keep the label and the missing github link as the observed defect, and revise design.md "Root causes" B3. _Requirements: 1.5, 2.7, 2.8_
- [x] 1.5 Record the failing outputs (counterexamples and seeds) in `docs/kiro-log.md` (dated entry) and compare them with the hypothesized root causes in design.md; revise design.md before continuing if the evidence differs (especially B3 and the vite guard).

### Phase 2: Preservation baseline on unfixed code (all expected to PASS)

- [x] 2.1 Freeze the originals as test-only copies under `apps/exorcist-web/src/__reference__/actions-v1/` (`header.ts`, `proof-slot.ts`, header part of `report-view.ts`, the `proofFor` key logic) and `skeleton/src/graveyard/__reference__/proof-view-v1.ts` (header "FROZEN, test-only, never import from production code"). Add a test-only harness option so `mountPage` can render with them (production code unchanged). _Requirements: 3.2, 3.3_
- [x] 2.2 Write Properties 3 and 7 (`p-actions-3.ts`, `p-actions-7.ts`, `actions.preserve.dom.test.ts`): npm proof URLs (the three committed parse-server reports requested, scoped names never requested), `renderedFacts` of the header, tombstones, detail panel and proof state equal to the Reference_Views for `scanReportArb` and the four npm demos; `proofView` fields that exist today equal the reference for arbitrary reports; the npm detail panel has no Repository fact and keeps "Deprecated on npm". Run on UNFIXED code; confirm all PASS and note the seed in `docs/kiro-log.md`. _Requirements: 3.1-3.6_

### Phase 3: Implement the fix

- [x] 3.1 `skeleton/src/proof/sha256.ts` (pure, no Node, `TextEncoder`) and move `actionProofName` into `skeleton/src/proof/names.ts` verbatim apart from the hash call; add `Ecosystem` and `proofNameFor`; export `actionProofName`, `proofNameFor` from `proof/index.ts`. Add Property 2 (`p-actions-2.ts`, `names.actions.test.ts`): equals a test-only `node:crypto` model for arbitrary strings incl. multi-block input and lone surrogates, a Proof_Name of at most 64 characters, the two committed hashes; static check for one definition and no `node:crypto` in skeleton or non-test web code. _Requirements: 2.1, 2.3_
- [ ] 3.2 `apps/exorcist-actions/src/proof/names.ts`: re-export `actionProofName` from `@last-rites/skeleton/proof` and keep `repoProofName`; the public name and every existing P12 property and test stay green unchanged (the P12 model is the oracle). _Requirements: 2.3, 3.6_
- [ ] 3.3 `apps/exorcist-web/src/app/controller.ts`: `proofFor` uses `proofNameFor(report.ecosystem, grave.record.name)` for the request and the Proof_Key; no other logic changes. Property 1 and the examples of 1.1 now pass; Property 3 stays green. _Requirements: 2.1, 2.2, 3.1_
- [ ] 3.4 `skeleton/src/graveyard/proof-view.ts`: `kindOf`, `kindLine`, `coverageText`, `rewrite` (cap `MAX_REWRITE_LINES = 40`) on `AttemptView`, filled only for Pin_Kind and Contract_Kind; export the new type fields from `graveyard/index.ts`. Property 4 passes. _Requirements: 2.5, 3.2_
- [ ] 3.5 `apps/exorcist-web/src/views/proof-slot.ts` (and `dom/h.ts` `ClassName` only if a new class is needed; prefer the existing `muted` and `proof-pre`): render the kind line, coverage line and rewrite block as text, "and N more lines" when capped. _Requirements: 2.5_
- [ ] 3.6 `apps/exorcist-web/src/model/report-view.ts` and `views/header.ts` (B2): add `ecosystem` and `lockfileNote` to `SummaryHeader`; the npm sentence moves to a constant byte for byte; the header renders `lockfileNote`; `rangesOnly` keeps its meaning. Property 5 passes. _Requirements: 2.6, 3.3_
- [ ] 3.7 B3: `skeleton/src/graveyard/breakdown.ts` `buildBreakdown(dep, options?)` with optional `labels` override (default output identical); `apps/exorcist-web/src/model/package-link.ts` (`packageHref`); `views/detail.ts` receives the ecosystem, passes `{ deprecated: "Deprecated" }` for github-actions and renders the "Repository" fact with the safe link only when `packageHref` returns a value. Property 6 passes. _Requirements: 2.7, 2.8, 3.4, 3.5_

### Phase 4: Verify and sabotage

- [ ] 4.1 Re-run 1.1 to 1.4 and 2.2 on the fixed code: exploratory tests now PASS (same seeds), preservation still PASS. Record seeds and results in `docs/kiro-log.md`. _Requirements: 2.1-2.8, 3.1-3.6_
- [ ] 4.2 Sabotage_Lists for Properties 1, 2 and 3 as in design.md (`test-support/sabotage/actions-p1.ts`, `-p2.ts`, `-p3.ts`) and a runner test `actions.sabotage.test.ts` that runs each property against each wrong implementation under a fixed seed and requires at least one failure per sabotage (the multi-block sha256 sabotage needs the length strategy to reach inputs over 55 bytes). A sabotage that stays green rejects the suite.
- [ ] 4.3 Sabotage_Lists for Properties 4, 5, 6 and 7 as in design.md (`-p4.ts` to `-p7.ts`), run by the same runner test. Record the counterexamples (shrunk) in `docs/kiro-log.md`.

### Phase 5: Fallout and documentation

- [ ] 5.1 Update only assertions that pinned a defect (`grep -rn "package-lock.json\|Deprecated on npm" apps/exorcist-web/src/*.test.ts`) and add the examples: nixpacks header shows "Refs come from workflow uses: lines.", jest header keeps the npm sentence, `actions/checkout` and `actions-rs/toolchain` show Proved with sabotage lines, `owner/repo/sub/path` links to `owner/repo`, `./local` has no link. Extend the class-vocabulary test if a class was added. Rebuild `npm run build -w @last-rites/exorcist-web`; confirm one JS and one CSS asset, both nixpacks proof files in `dist/demo/proofs/nixpacks-actions/`, and no `node:crypto` or `createHash` in the built JS. _Requirements: 2.4, 3.6_
- [ ] 5.2 Docs: `.kiro/specs/graveyard-ui/design.md` pointer section "Actions (bugfix)" linking to this spec (Proof_Key, header note, Package_Link); one line in the exorcist-actions follow-up list of `docs/kiro-log.md` that "package links still assume npm" is resolved by `graveyard-ui-actions`. Do not rewrite the rest.
- [ ] 5.3 Manual browser check (no browser is available to the test run): Chrome 1352x761 and 375x812 on the demo nixpacks-actions, packages `actions-rs/toolchain` and `actions/checkout`: Proved badge, kind line, coverage, rewrite block readable and scrollable at 375px with no horizontal page scroll, header note, Repository link focus ring and new-tab behavior; then the npm demo parse-server for unchanged look. Record each item as checked or NOT RUN in `docs/kiro-log.md`.

### Phase 6: Checkpoint

- [ ] 6.1 `npm run typecheck` across the repo: green.
- [ ] 6.2 `npm test` across the repo: green (all workspaces, `numRuns: 100`, no network), with and without `CI=1`. The exorcist-actions suites (P12 and the Sabotage_List run) stay green unchanged.
- [ ] 6.3 Final check against bugfix.md: each clause 2.1-2.8 and 3.1-3.7 maps to a passing test or to a manual-check line in the log; list clauses that are only manually checked or unverified (B3 surface, browser look) and the final dated entry in `docs/kiro-log.md` with defects, confirmed or revised causes, fix, properties, sabotage results and judgement calls.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": "wave-1", "tasks": ["1.1", "1.2", "1.3", "1.4", "2.1"] },
    { "id": "wave-2", "tasks": ["1.5", "2.2"] },
    { "id": "wave-3", "tasks": ["3.1"] },
    { "id": "wave-4", "tasks": ["3.2", "3.3", "3.4", "3.6", "3.7"] },
    { "id": "wave-5", "tasks": ["3.5", "4.1"] },
    { "id": "wave-6", "tasks": ["4.2", "4.3", "5.1"] },
    { "id": "wave-7", "tasks": ["5.2", "5.3", "6.1"] },
    { "id": "wave-8", "tasks": ["6.2"] },
    { "id": "wave-9", "tasks": ["6.3"] }
  ],
  "dependencies": {
    "1.5": ["1.1", "1.2", "1.3", "1.4"],
    "2.2": ["2.1"],
    "3.1": ["1.5", "2.2"],
    "3.2": ["3.1"],
    "3.3": ["3.1"],
    "3.4": ["3.1"],
    "3.5": ["3.4"],
    "3.6": ["3.1"],
    "3.7": ["3.1"],
    "4.1": ["3.2", "3.3", "3.5", "3.6", "3.7"],
    "4.2": ["4.1"],
    "4.3": ["4.1"],
    "5.1": ["4.1"],
    "5.2": ["4.1"],
    "5.3": ["5.1"],
    "6.1": ["4.2", "4.3", "5.1"],
    "6.2": ["6.1", "5.2"],
    "6.3": ["6.2", "5.3"]
  }
}
```

## Notes

- Tests never hit the network; proof reports come from `demo/proofs/**` read by the test and served by a fake API. 1.1 to 1.4 must FAIL (except the labelled halves) and 2.2 must PASS on unfixed code; if either is reversed, stop and revisit design.md before touching production code.
- Per `proof-rules.md`, every property has a Sabotage_List (4.2, 4.3); a check that cannot fail is rejected. Generators for Action_Names are shaped by the real `uses:` values in `demo/nixpacks-actions.json` plus edge cases (empty, unicode, upper case, long, sub paths).
- `actionProofName` has one definition (skeleton). Do not copy it into the web app or its vite config.
- B3 has no proven source link in this repository (bugfix.md); task 1.4 decides what was observed, and the fix does not add an npm link or any label change for npm.
