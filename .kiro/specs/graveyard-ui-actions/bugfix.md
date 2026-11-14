# Bugfix Requirements Document

## Introduction

The Graveyard_Page (`apps/exorcist-web`, see `.kiro/specs/graveyard-ui/`) was built for npm. The second app (`.kiro/specs/exorcist-actions/`) added the Demo_Snapshot `demo/nixpacks-actions.json` (`"ecosystem": "github-actions"`) and two proof reports under `demo/proofs/nixpacks-actions/`. The operator opened that demo on the deployed site and saw three defects. `docs/kiro-log.md` (exorcist-actions task 9.3) had already recorded "package links still assume npm for action names" as a follow-up; that task was read-only by design, so none of this was fixed.

- **B1 (proof not found).** Opening the tag of `actions-rs/toolchain` or `actions/checkout` shows the placeholder "Exorcism coming" in the Proof section, although `demo/proofs/nixpacks-actions/actions-rs-toolchain-a103c84e.json` and `actions-checkout-728eabd6.json` exist. The web app asks for the proof of `<demo>/<package name>`. `controller.ts` (`proofFor`) guards the package name with `isProofName` (`^[a-z0-9][a-z0-9-]{0,63}$`); an action name contains `/` (and often uppercase letters and dots), so the guard fails, no request is made and the placeholder stays. The actions app writes its reports under `actionProofName(name)` (`apps/exorcist-actions/src/proof/names.ts`: `<slug cut to 55>-<8 hex of sha256(lower-cased name)>`), which the web app never computes. The path guard in `apps/exorcist-web/vite.config.ts` already accepts such names; it is checked, not assumed (task 1.1).
  A second part of B1: once the report loads, the Proof view must show the two actions proof kinds sensibly. The `pin` shape (`actions/checkout@v4` pinned to a commit SHA) and the `contract` shape (swap `actions-rs/toolchain` for `dtolnay/rust-toolchain`) are rendered by the npm-oriented view as generic runs and a call-site list, with no hint of what was proved and no sight of the rewrite.
- **B2 (npm-only notice).** The graveyard header shows "Versions come from declared ranges because no package-lock.json was read. Yarn and pnpm lockfiles are not read in v1." for a github-actions report. `buildSummaryHeader` sets `rangesOnly` when every `versionSource` is `"range"`, which is always true for refs read from `uses:` lines, and the header view maps it to the npm sentence.
- **B3 (npm links and wording).** Links and wording derived from a package name assume npm. For ecosystem `github-actions` a package link must go to `https://github.com/<owner>/<repo>`. At this commit the web sources contain no `npmjs.com` URL built from a name (checked with `grep` over `apps/exorcist-web/src`, `skeleton/src/graveyard` and the built `dist`), the evidence links in `demo/nixpacks-actions.json` already point to github.com, and the only npm-specific text on the page is the signal label "Deprecated on npm" in `skeleton/src/graveyard/signal-info.ts` (and the pitch line on the home screen). The surface the operator clicked is therefore not proven from source. Task 1.4 locates it on the unfixed page and records it; the requirements below hold for every link and label derived from a package name, whichever surface it turns out to be.

Out of scope: any change to scores, grades, calibration, the npm demos or their proof reports, the proof codec (`parseProofReport` / `serializeProofReport`), the actions scanner, and live scans (live reports show no proof section today).

## Glossary

- **Graveyard_Page**: the report screen of `apps/exorcist-web`; **Detail_Panel**: its modal for one package; **Proof_Section**: the part of the Detail_Panel that shows a `ProofState` (`coming_soon`, `loading`, `report`).
- **Ecosystem**: `ScanReport.ecosystem`; absent means `npm` (the codec writes the field only for `github-actions`).
- **Action_Name**: a dependency name of a github-actions report, `owner/repo` or `owner/repo/sub/path` (as written in `uses:`, without the `@ref`).
- **Proof_Name**: a string matching `PROOF_NAME_PATTERN`; the only strings that may become path segments of a Proof_Report.
- **Action_Proof_Name**: `actionProofName(name)`, the Proof_Name the actions app writes for an Action_Name.
- **Proof_Key**: the Proof_Name of one dependency of one report, `proofNameFor(ecosystem, name)`: for `npm` the name itself when it is a Proof_Name (else none); for `github-actions` the Action_Proof_Name.
- **Pin_Kind / Contract_Kind**: an attempt whose `shapes` are exactly `[{id:"pin"}]` / `[{id:"contract"}]`. The actions app writes `pin-<proofName>` and `swap-<proofName>` as `candidate.name`; the kind is read from `shapes[].id`, never from the candidate name.
- **Lockfile_Note**: the muted paragraph under the header counts that explains where versions come from.
- **Package_Link**: any `href` the page derives from a dependency name (not from evidence `sourceUrl`s).
- **Reference_Views**: frozen copies of the unfixed header, proof view and proof state code, used only by tests.
- **Sabotage_List**: per `.kiro/steering/proof-rules.md`, the deliberately wrong implementations a property must catch.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the Detail_Panel opens a dead or dying package of a github-actions demo (for example `actions-rs/toolchain` or `actions/checkout`) AND a proof report exists for its Action_Proof_Name, THEN the Proof_Section shows "Exorcism coming" and no request for the report is made, because `isProofName(<action name>)` is false.

1.2 WHEN a proof report exists for an ailing or alive Action_Name, THEN it is not shown, for the same reason.

1.3 WHEN a github-actions Proof_Report is shown, THEN a Pin_Kind attempt appears as "679 runs, seed 0" and a Contract_Kind attempt as "24 runs, seed 0", with no statement of what was checked (refs pinned to a commit, or inputs mapped to the replacement), no coverage figures and no view of the rewrite (`candidate.source`, a unified-style diff of the `uses:` lines).

1.4 WHEN a report has `ecosystem: "github-actions"` AND every dependency has `versionSource: "range"`, THEN the header shows the npm sentence about `package-lock.json`, Yarn and pnpm.

1.5 WHEN a package link or label is derived from an Action_Name of a github-actions report, THEN it assumes npm (npm URL, or the label "Deprecated on npm" on the first row of the score breakdown).

### Expected Behavior (Correct)

2.1 THE Graveyard_Page SHALL resolve the proof of a dependency through one function `proofNameFor(ecosystem, name)`. For `github-actions` it SHALL be the same `actionProofName` the actions app uses, imported and not copied; for `npm` it SHALL return the name itself when it is a Proof_Name and none otherwise (today's behavior).

2.2 WHEN the Detail_Panel opens a dead, dying, ailing or alive Action_Name whose report exists at `demo/proofs/<demo>/<Action_Proof_Name>.json`, THEN the Proof_Section SHALL show that report (same rules as npm: dead and dying show "loading" first, ailing and alive show a section only for a readable report). WHEN no report exists, THEN dead and dying SHALL keep "Exorcism coming" and ailing and alive SHALL show no section.

2.3 THE function `actionProofName` SHALL have exactly one definition, in `skeleton/src/proof/names.ts`, free of Node built-ins so the browser bundle can import it; `apps/exorcist-actions` SHALL re-export it from there (`src/proof/names.ts` keeps its public name and its output for every input, including empty, upper-case, non-ASCII, lone surrogates and very long input). `repoProofName` stays in the actions app, and the web app keeps using the demo name as the repo segment.

2.4 THE built `dist/` SHALL contain no import of `node:crypto` and the web build SHALL succeed; the guard in `vite.config.ts` SHALL accept both `/demo/proofs/nixpacks-actions/actions-checkout-728eabd6.json` and `.../actions-rs-toolchain-a103c84e.json` and reject every path it rejects today.

2.5 WHEN a Proof_Report holds a Pin_Kind attempt, THEN the Proof view SHALL show a kind line "Pin check: refs pinned to a commit" (wording fixed in design.md), the shape's coverage as text ("5 files, 11 uses"), and the rewrite from `candidate.source` as a preformatted block. WHEN it holds a Contract_Kind attempt, THEN it SHALL show "Swap contract: inputs of the old action mapped to the replacement", the coverage ("dropped.override 6, dropped.profile 6, ..."), and the rewrite block (which shows the replacement; the candidate name is already shown). The badge, runs, seed, sabotage line ("Sabotage: 12 of 12 broken migrations caught"), call sites (`file:line (enclosing)`), counterexample and error rendering SHALL be the existing ones. Every added text SHALL be written as text (never markup), and a rewrite block longer than the cap (design.md) SHALL show the first lines and "and N more lines".

2.6 WHEN `ecosystem` is `github-actions`, THEN the header SHALL NOT show the npm sentence; it SHALL show the Lockfile_Note "Refs come from workflow uses: lines." exactly when it would have shown the npm sentence (non-empty dependencies, all `versionSource: "range"`), and nothing otherwise.

2.7 WHEN `ecosystem` is `github-actions`, THEN a Package_Link for an Action_Name SHALL be `https://github.com/<owner>/<repo>` (the first two `/`-separated segments; `owner/repo/sub/path` links to `owner/repo`), and SHALL be shown in the Detail_Panel as "Repository" with the visible host `github.com`. IF the name is not of the form `owner/repo[/path]` with owner and repo matching `^[A-Za-z0-9][A-Za-z0-9._-]*$` (a local `./path`, `docker://image`, an empty or hostile string), THEN no link SHALL be rendered and the name stays text. The link SHALL pass the existing `safeHref` and open with `rel="noopener noreferrer"` like the Source links.

2.8 WHEN `ecosystem` is `github-actions`, THEN no rendered `href` and no `aria-label` SHALL contain `npmjs.com`, and the `deprecated` row of the breakdown SHALL be labelled "Deprecated" (explanation text unchanged); the label "Deprecated on npm" SHALL NOT appear for github-actions reports.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `ecosystem` is absent or `npm`, THEN the proof path of every dependency SHALL be unchanged: `demo/proofs/<demo>/<name>.json` for names that are Proof_Names (for example `parse-server/deep-diff`, `intersect`, `node-abort-controller`), and no request for names that are not (scoped names such as `@babel/plugin-proposal-object-rest-spread`).

3.2 THE Proof view of every npm report SHALL render exactly as before: `renderedFacts` of the proof state for the three committed parse-server reports and for generated reports is byte-equal to the Reference_Views output, and `ProofView` fields that exist today keep their values for every report.

3.3 THE header of every npm report SHALL render exactly as before, including the npm sentence for ranges-only reports (the jest demo) and no sentence when a lockfile was read.

3.4 THE npm Detail_Panel SHALL gain no link and no label change; "Deprecated on npm" stays for npm reports; the breakdown, calibration row and total row are unchanged.

3.5 Evidence Source links keep rendering from `sourceUrl` through `safeHref`; unsafe URLs stay withheld; names stay text (never markup, never ids).

3.6 The Proof_Report codec, `proofReportPath` / `parseProofReportPath` and their outputs, the scores and grades of every demo, `demo/*.json` and `demo/proofs/**` are byte-identical after the fix.

3.7 `skeleton/` still imports nothing from `apps/`; the web app still does not import `node:*` modules; all fetches still go through the existing API client; no LLM calls.

## Bug Condition (summary)

```
C1(X) := X.ecosystem = github-actions AND EXISTS dep: proofFor(dep) returns none or placeholder
         WHILE a report exists at demo/proofs/<demo>/actionProofName(dep.name).json
C1b(X) := a Pin_Kind or Contract_Kind attempt is rendered without its kind line, coverage or rewrite
C2(X) := X.ecosystem = github-actions AND header text contains "package-lock.json"
C3(X) := X.ecosystem = github-actions AND (some Package_Link host <> github.com OR text contains "on npm")
C(X)  := C1 OR C1b OR C2 OR C3
```

Preservation: for every X with ecosystem absent or `npm`, the rendered page and every requested proof path equal the Reference_Views result.
