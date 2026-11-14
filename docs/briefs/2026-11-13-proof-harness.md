# Brief: proof harness ("pin tests"), 2026-11-13

Written by Claude (planning) as input for the Kiro spec `.kiro/specs/proof-harness`. Kiro writes the spec and builds it.

## Goal

Given a local checkout of a target repo, a dead package P used by it, and a candidate replacement module R (the migration), prove with fast-check that R behaves like P **at the repo's real call sites**, or show the shrunk input where they disagree. The old package is the oracle (see `.kiro/steering/proof-rules.md`). No trivial passes.

## Real hero cases (parse-server @ 3402ee6, checked out at ../lastrites-work/parse-server, NOT part of this repo)

1. `intersect@1.0.1`, production code `src/Controllers/DatabaseController.js` lines 1395-1397: `intersect.big(allIds)` and `intersect(allIds)` where `allIds: Array<Array<string>>` (objectId lists). Candidate replacement: a native `Set`-based function with the same call shape. Expected: the first naive attempt may differ on duplicates or ordering; the harness must surface that as a shrunk counterexample.
2. `deep-diff@1.0.2`, test code `spec/Schema.spec.js`, `spec/schemas.spec.js`, `spec/MongoTransform.spec.js`: always `dd(a, b)` inside `expect(...).toEqual(undefined)`. The repo only consumes the projection "is the result undefined" (equal vs not equal). Candidate: `util.isDeepStrictEqual` wrapped to return `undefined` when equal. The property compares only that projection.
3. `node-abort-controller@3.1.1`: declared in package.json, **zero call sites** in the repo. The harness must refuse to produce a passing proof (status `no-call-sites`) and recommend removing the dependency; the "proof" for removal is that no source file imports or requires it.

## Components

1. **Usage surface** (`skeleton/src/proof/usage-surface.ts` interface + npm implementation in `apps/exorcist-npm/src/exorcise/usage-surface.ts`): walk the target repo's JS/TS source (skip node_modules, dist, build, coverage), parse each file (use the `typescript` compiler API already in the workspace if available, else a parser added as a dependency; tolerate Flow-style type annotations in .js files), find `import x from 'P'`, `import {a} from 'P'`, `const x = require('P')`, then every call of the bound name or its member (`x(...)`, `x.big(...)`). Output `CallSite { file, line, column, callee, argCount, argTexts, enclosing: 'src' | 'test', consumedAs?: 'undefined-check' }` where `consumedAs` is detected for the `expect(x(...)).toEqual(undefined)` / `=== undefined` pattern. Deterministic order (file, line, column).
2. **Recipe** (`apps/exorcist-npm/src/exorcise/recipes/<package>.ts`): for each hero package: the oracle loader (old package installed as a pinned devDependency of exorcist-npm, so tests are offline), the call shapes it supports, the fast-check arbitrary for each call shape (shaped from the call sites: e.g. arrays of 0..6 arrays of objectId-like strings, with duplicates allowed), and the projection (identity, or `isUndefined`). A recipe with no matching call site is never run.
3. **Differential runner** (`skeleton/src/proof/differential.ts`, generic): runs `fc.assert(fc.property(arb, x => deepEqual(project(old(x)), project(new(x)))))` with `numRuns` >= 100 (configurable, demo uses 1000) and a recorded seed; returns `ProofResult { status: 'proved' | 'counterexample' | 'no-call-sites' | 'error', runs, seed, counterexample?, oldOutput?, newOutput?, callSites, sabotage }`. Exceptions thrown by old and new must match by "threw vs did not throw" (message not compared).
4. **Sabotage check** (generic): built-in mutators wrap the candidate (reverse array results, drop the last element of array results, return undefined, swap the first two arguments, deep-clone-and-add a key to object results, where applicable to the output type). Each applicable mutant must make the property fail. Report `sabotage { applied, caught, survivors[] }`. Any survivor marks the proof `weak` and it is shown as such; a proof with zero applicable mutants is also `weak`.
5. **Proof report** JSON (`demo/proofs/<repo>/<package>.json`, canonical JSON like the scan report) holding the attempts in order (attempt 1 might be a counterexample, attempt 2 proved), call sites, seeds, sabotage results, and the candidate source text. Parsed by a `parseProofReport` validator like `parseReport`.
6. **CLI**: `npm run exorcise -w @last-rites/exorcist-npm -- --repo <path> --package <name> --candidate <file> [--runs 1000] [--out demo/proofs/...]` appends an attempt to the report.
7. **UI**: replace the "Exorcism coming" placeholder in the breakdown panel's Proof section: when a proof report exists for the demo repo and package, show status badge (Proved / Counterexample / No call sites / Weak), runs and seed, the call sites (file:line), the attempt history with the shrunk counterexample shown as old output vs new output, and the sabotage line "Sabotage: k of n broken migrations caught". Load from `/demo/proofs/<repo>/<package>.json` (same dev middleware/build emit pattern as demo snapshots; same name guard).

## Correctness properties (for the spec's design)

- Differential soundness: if `new` is the same function as `old`, status is `proved` for every recipe.
- Counterexample reality: whenever status is `counterexample`, re-running old and new on the reported counterexample really gives different projected outputs.
- No trivial passes: zero call sites never yields `proved`; a recipe whose arbitrary cannot generate a value matching any call shape never yields `proved`.
- Sabotage completeness: for every applicable mutator, the mutant of the oracle itself is caught (status counterexample).
- Determinism: same repo files, recipe, candidate and seed give the same report bytes.
- Usage-surface determinism and completeness on generated small source trees: every generated call of the bound name appears exactly once.

## Out of scope

Running the target repo's own test suite (needs MongoDB), network packages, automatic code rewriting of the target repo (that is the later power/agent spec), yarn/pnpm.
