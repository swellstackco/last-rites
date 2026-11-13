# Brief: exorcist-actions (app 2, thin), 2026-11-14

Written by Claude (planning) as input for the Kiro spec `.kiro/specs/exorcist-actions`. Kiro writes the spec and builds it. Hard cap: this app must stay thin (aim < 70 tasks). It exists to show that `/skeleton` carries a second, genuinely different "find dead thing, prove, replace" tool: different input, different evidence, different fix, different proof, same death-score engine and same graveyard.

## Goal

`apps/exorcist-actions` (package `@graveyard-kit/exorcist-actions`): scan a repo's `.github/workflows/*.yml|yaml` for third-party GitHub Actions (`uses: owner/repo[/path]@ref`), score how dead each action is with the skeleton death-score engine, and for a dead or risky action produce a fix plus a proof:
- **Fix A, swap:** a dead action with a known replacement (curated map) is swapped for the replacement.
- **Fix B, pin:** a mutable ref (tag or branch, e.g. `@v3`, `@main`) is pinned to the full 40-char commit SHA it points to today, with the old ref kept as a trailing comment (`uses: owner/repo@<sha> # v3`).

## Components

1. **Inventory** (`src/inventory/`): parse workflows with the `yaml` package (eemeli/yaml; keep the CST/source ranges so rewrites are surgical). Collect every `uses:` in `jobs.<id>.steps[]` and reusable-workflow `jobs.<id>.uses`. Output `ActionUse { file, line, column, owner, repo, path?, ref, refKind: 'sha' | 'mutable', with: Record<string,string>, jobId, stepIndex }`. Skip `docker://` and local `./` uses (record them as skipped with a reason). Deterministic order (file, line, column).
2. **Evidence** (`src/evidence/`, reusing the npm-evidence disk cache + GitHub client pattern and the GITHUB_TOKEN handling already in exorcist-npm; move shared bits into `/skeleton` only if trivially generic): per unique `owner/repo` map the seven skeleton signals:
   - `repoArchived`: GitHub repo archived.
   - `deprecated`: the action's `action.yml`/`action.yaml` at the used ref declares `runs.using` of `node12` or `node16` (GitHub-deprecated runtimes), source URL = the action.yml URL. `node20`, `composite`, `docker` = not deprecated.
   - `monthsSinceLastPublish`: months since the latest GitHub release (or latest tag date if no releases; unknown if neither).
   - `monthsSinceLastCommit`: months since the default branch's last commit.
   - `maintainerCount`: unknown unless cheaply available (do not invent; unknown is fine).
   - `openVulnsNoFix`: OSV query with ecosystem `GitHub Actions` and package `owner/repo`, counting advisories with no fixed version (same OSV client as npm).
   - `knownReplacementExists`: curated map in `src/replacements.ts` with a source URL per entry. Seed it with real, verifiable entries only, e.g. `actions/create-release` → `softprops/action-gh-release`, `actions/upload-release-asset` → `softprops/action-gh-release`, `actions-rs/toolchain` → `dtolnay/rust-toolchain`, `actions-rs/cargo` → plain `run: cargo`. Each entry also holds an input mapping (old input name → new input name, or dropped) used by the contract proof.
3. **Scan report**: the same report shape and canonical JSON the npm scanner writes (`parseReport`-compatible), with `ecosystem: "github-actions"` (add the field to the report type as optional, default npm, if not already there), so exorcist-web shows it in The Graveyard unchanged. One demo snapshot under `demo/` for a real public repo that still uses a dead action. Hero repo (picked by Claude, verified 2026-11-14): **railwayapp/nixpacks** (3.5k stars, active): `.github/workflows/ci.yml` and `release.yml` use the archived `actions-rs/toolchain@v1` (6x) and `actions-rs/cargo@v1` (7x). Clone it to `../lastrites-work/nixpacks` for local runs and fixtures; the spec takes the repo as an argument. Hero fixes: swap `actions-rs/toolchain` → `dtolnay/rust-toolchain` (contract proof over the real `with:` inputs; `override`/`profile` have no counterpart and must be declared as dropped in the mapping, so the contract proof shows them), and pin `actions/checkout@vN` style refs to SHAs.
4. **Proof** (`src/proof/`), two kinds, each producing a Proof_Report attempt in the existing proof report format (statuses `proved | counterexample | error`, plus `weak` and the sabotage line):
   - **Pin proof:** the pinned SHA equals the commit the mutable ref resolves to via the GitHub API (`/repos/{o}/{r}/commits/{ref}`), AND the rewritten workflow differs from the original only in the `uses:` value plus the trailing comment on that line (byte-for-byte everywhere else).
   - **Swap contract proof:** every input the workflow passes in `with:` maps to an input declared in the replacement's `action.yml` (via the curated mapping), every `required: true` input of the replacement without a default is supplied, and every `steps.<id>.outputs.<name>` referenced later in the same job exists in the replacement's declared `outputs`. A violation is a counterexample naming the input/output.
   - **Sabotage** (mandatory, per proof-rules.md): mutants that must be caught: pin to a different SHA, rewrite an extra line, drop a required input, rename a referenced output. A survivor marks the proof weak.
5. **CLI**: `npm run scan -w @graveyard-kit/exorcist-actions -- --repo <path> [--out ...]` and `npm run exorcise -w @graveyard-kit/exorcist-actions -- --repo <path> --action <owner/repo> --fix pin|swap [--write]` (`--write` edits the local checkout only; never commits or pushes).

## Correctness properties (fast-check, for the design)

- Inventory completeness/determinism: on generated workflow YAML (random jobs/steps, comments, quoting styles, `uses` with and without paths), every generated `uses` appears exactly once, in order; run twice gives identical output.
- Rewrite surgicality: for any generated workflow and any chosen use, the pin rewrite changes exactly one line, and that line still parses to the same owner/repo/path with the new ref.
- Rewrite idempotence: pinning an already-pinned use is a no-op.
- Pin proof soundness: a candidate pinned to the resolved SHA is proved; any other 40-hex SHA is a counterexample.
- Contract soundness: on generated `with:` maps and action.yml input/output sets, the contract check passes iff every passed input is mapped and declared and every required input is supplied (model-based check against a simple reference implementation).
- Scoring reuse: the evidence → signals mapping never yields a known alive value for a missing source (unknown stays unknown).

## Out of scope

Running workflows, actionlint, Docker actions, GitLab/other CI, automatic PRs, UI work beyond the graveyard showing the actions report via the existing demo path (if the existing UI needs more than a label change, list it as a follow-up instead of building it).
