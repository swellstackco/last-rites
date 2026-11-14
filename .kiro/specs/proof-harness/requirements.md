# Requirements Document

## Introduction

The Proof_Harness is the "prove it" half of the product. Given a local checkout of a target repository, a dead package P that the repository uses, and a Candidate (a replacement module R written by the migration), it proves with fast-check that R behaves like P at the repository's real call sites, or it shows the shrunk input where the two disagree. The old package is the Oracle (`migration-rules.md` rule 4). A proof that cannot fail is a bug (`proof-rules.md`).

It has five parts:

1. The Usage_Surface: a generic interface in `skeleton/src/proof/` and an npm implementation in `apps/exorcist-npm/src/exorcise/` that parses the target's JS/TS source with the TypeScript compiler API and lists every import of P and every call of it (`CallSite`).
2. The Recipe: per hero package, the Oracle loader, the Call_Shapes it supports, a fast-check arbitrary for each, and the Projection (what the repository actually consumes of the result).
3. The Differential_Runner and the Sabotage_Check: generic code in `skeleton/src/proof/runner/` that runs `old(x)` against `new(x)` over generated inputs, then proves the proof can fail by running deliberately broken migrations (Mutators).
4. The Proof_Report: canonical JSON at `demo/proofs/<repo>/<package>.json` with a strict `parseProofReport` validator, and the Proof_Cli `npm run exorcise` that appends one Proof_Attempt to it.
5. The Proof_Section of the Graveyard page: it replaces the "Exorcism coming" placeholder when a Proof_Report exists for the demo repository and the package.

The three hero cases are the real parse-server checkout at commit `3402ee6`, found at `../lastrites-work/parse-server` (read-only, never part of this repository): `intersect@1.0.1` (production code, one call shape with two spellings), `deep-diff@1.0.2` (test code, 23 calls always consumed as "is the result undefined"), and `node-abort-controller@3.1.1` (declared, zero call sites). Tests never read that checkout. They use small synthetic source trees under `__fixtures__/` that mimic the call shapes.

Out of scope: running the target repository's own test suite (it needs MongoDB), network packages, automatic rewriting of the target's code (that is the later power/agent spec), yarn and pnpm, scoped package names (the report file name is guarded, see Requirement 13), and any LLM call. The hosted app and the tests make no network requests and no LLM calls.

Behavioral decisions fixed here, so design does not have to guess:

- A Proof_Attempt is recorded for every CLI run whatever its status, including `counterexample` and `error`. A counterexample is a result, not a failure of the CLI.
- `proved` is a status; `weak` is a flag on a proved attempt (a Sabotage_Check with zero applicable Mutators, or with a survivor). The page shows four badges (Proved, Counterexample, No call sites, Weak) plus a neutral "Proof error" badge.
- A proof covers direct calls only. A call site no Call_Shape accepts is an error, never a silent skip.
- The Proof_Report holds no wall-clock time and no absolute path, so the same inputs give the same bytes.
- The default number of runs is 200 (`proof-rules.md`), the minimum is 100, and the demo uses 1000.

## Glossary

- **Proof_Harness**: the system specified here.
- **Target_Checkout**: a local directory holding the repository under test. Read only.
- **Usage_Surface**: the function type `(input: { root, package }) => Promise<UsageSurfaceResult>` in the skeleton, and its npm implementation `createUsageSurface`.
- **Call_Site**: `{ file, line, column, callee, member, argCount, argTexts, enclosing, consumedAs?, new? }` for one call or `new` expression whose callee is rooted at a binding of the package.
- **Import_Site**: `{ file, line, column, form }` for one place where a source file imports, requires or re-exports the package.
- **Binding**: a local name that refers to the package module or to a member of it, created by an import or a `require`.
- **Member_Path**: the module-relative path of a callee: `""` for the module itself, `big` for `intersect.big`, `diff` for a named import `diff`, `./get` and `./get.x` for a call through the subpath specifier `P/get`, and `<dynamic>` for a computed non-literal access.
- **Enclosing**: `src` or `test`, from the file path.
- **Consumed_As**: the marker `undefined-check` on a Call_Site whose result the surrounding code only compares with `undefined`.
- **Oracle**: the old package, installed as an exact-pinned devDependency of `apps/exorcist-npm` so tests run offline.
- **Candidate**: the replacement module under test. An ESM or TypeScript file whose `default` export stands for the package module (a function with member properties, or an object).
- **Recipe**: the per-package module `apps/exorcist-npm/src/exorcise/recipes/<package>.ts`.
- **Call_Shape**: one supported way of calling the package: `id`, `member`, `argCount`, `accepts(site)`, an arbitrary, `guard`, a Projection, `outputKind`, `orderSensitive`, `classify` and `requiredLabels`.
- **Projection**: what the repository consumes of a result: `identity` (the whole value) or `isUndefined` (only whether it is `undefined`). It declares what it `observes`: `value` or `definedness`.
- **Outcome**: `{ kind: "returned", value }` or `{ kind: "threw" }`. A thrown message is never kept or compared.
- **Differential_Runner**: the generic code that runs one Call_Shape's property `project(old(x)) equals project(new(x))` with fast-check.
- **Coverage_Label**: a string a Call_Shape assigns to a generated input and its Oracle outcome (for example `duplicates-in-last-list`, `equal-pair`). A Required_Label that no run produced makes the proof an error.
- **Proof_Result**: the return value of `runProof`: `status`, `weak`, `runs`, `numRuns`, `seed`, `shapes`, `counterexample?`, `oldOutput?`, `newOutput?`, `oldProjected?`, `newProjected?`, `callSites`, `importSites`, `recommendation?`, `error?`, `sabotage`.
- **Proof_Status**: `proved`, `counterexample`, `no-call-sites` or `error`.
- **Mutator**: a deliberately wrong wrapper of the Candidate: `reverse-array`, `drop-last`, `return-undefined`, `swap-first-two-args`, `add-key`, `return-defined`.
- **Sabotage_Check**: running every applicable Mutator on every Call_Shape that ran and requiring each to produce a counterexample. Reported as `sabotage { applied, caught, survivors }`.
- **Survivor**: a (Call_Shape, Mutator) pair named `<shape id>:<mutator name>` whose mutant stayed green.
- **Weak**: a proved attempt whose Sabotage_Check had `applied` 0 or at least one Survivor.
- **Proof_Attempt**: one entry of `attempts` in a Proof_Report: the Candidate name and source text, the status, the seed and runs, the Call_Shape results, the counterexample if any, and the sabotage result.
- **Proof_Report**: the canonical JSON file for one (repository, package) pair.
- **Proof_Cli**: `npm run exorcise -w @last-rites/exorcist-npm -- ...`.
- **Proof_Name**: a string matching `^[a-z0-9][a-z0-9-]{0,63}$`, used for the repository directory and the package file name under `demo/proofs/`.
- **Proof_View**: the pure view model built from a Proof_Report for the page.
- **Proof_Section**: the `section.proof` element in the Detail_Panel.
- **Sabotage_List**: the test-suite convention (`proof-rules.md`): a list of deliberately wrong implementations of the code under test, one list per property, that the central sabotage test runs. Not to be confused with a Mutator, which is part of the product.
- **Hero_Case**: one of the three real cases above.
- **Canonical_Json**: serialization with object keys in a fixed documented order, two-space indentation, one trailing newline.

## Requirements

### Requirement 1: Usage surface contract

**User Story:** As a maintainer of another adapter, I want the usage-surface shape defined once in the skeleton, so that a second ecosystem can reuse the harness.

#### Acceptance Criteria

1. THE skeleton SHALL export from `@last-rites/skeleton/proof` the types `CallSite`, `ImportSite`, `UsageSurfaceInput`, `UsageSurfaceResult` and `UsageSurface`, and SHALL NOT import `fast-check`, a Node module or any file under `apps/` in that entry point.
2. THE Call_Site SHALL carry `file` (relative to the root, `/` separators), `line` and `column` (1-based, of the start of the call expression), `callee` (source text of the callee expression), `member` (the Member_Path), `argCount`, `argTexts` (the source text of each argument with each whitespace run collapsed to one space and cut to 200 UTF-16 code units followed by `…` when longer), `enclosing`, and optionally `consumedAs` and `new` (only when true).
3. THE Import_Site SHALL carry `file`, `line`, `column` and a `form` that is one of `import-default`, `import-named`, `import-namespace`, `import-side-effect`, `import-type`, `import-equals`, `re-export`, `require`, `require-unbound` or `dynamic-import`.
4. THE UsageSurfaceResult SHALL carry `package`, `filesScanned`, `callSites`, `importSites` and `warnings` (strings).
5. THE UsageSurface SHALL return `callSites` and `importSites` each sorted by `file` in UTF-16 code-unit order, then `line`, then `column`, ascending.
6. WHEN the same files are scanned twice, or the file system lists the same files in a different order, THE UsageSurface SHALL return deep-equal results.
7. THE UsageSurface SHALL list each call or `new` expression of a bound name exactly once, and SHALL list no call expression that is not rooted at a binding of the package.

### Requirement 2: Source walk and parsing (npm)

**User Story:** As a developer, I want the whole source tree read, including files with Flow-style type annotations, so that a call site is not missed because of the syntax.

#### Acceptance Criteria

1. THE npm UsageSurface SHALL walk the root recursively, SHALL skip every directory named `node_modules`, `dist`, `build`, `coverage` or `.git`, and SHALL NOT follow symbolic links.
2. THE npm UsageSurface SHALL read files with the extensions `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts` and `.cts`, and SHALL skip declaration files (`.d.ts`, `.d.mts`, `.d.cts`).
3. THE npm UsageSurface SHALL parse each file with the `typescript` compiler API, using the TSX script kind for `.tsx`, the TS kind for `.ts`, `.mts` and `.cts`, and the JSX script kind for the other extensions, so that Flow-style type annotations in `.js` files do not stop the scan.
4. IF a file has syntax diagnostics, THEN THE npm UsageSurface SHALL still collect the call sites and import sites it can read from that file and SHALL add exactly one warning naming the file and the diagnostic count.
5. IF a file is larger than 2 MiB or cannot be read, THEN THE npm UsageSurface SHALL skip it, SHALL add one warning naming the file, SHALL NOT count it in `filesScanned`, and SHALL NOT throw.
6. IF the root is not a readable directory, THEN THE npm UsageSurface SHALL return `filesScanned` 0 and one warning, and SHALL NOT throw or reject.
7. THE npm UsageSurface SHALL set `enclosing` to `test` when the path has a segment `spec`, `test`, `tests`, `__tests__` or `__mocks__` or a file name containing `.spec.` or `.test.`, and to `src` otherwise.
8. THE npm UsageSurface SHALL perform reads only: no write, no process spawn, no network request, and no read of the environment.
9. THE npm UsageSurface SHALL reach the file system only through an injected `SourceFs` interface, so that tests can supply an in-memory implementation.

### Requirement 3: Bindings, call sites and import sites

**User Story:** As a developer, I want every real use of the package found, so that the proof covers what the code actually does.

#### Acceptance Criteria

1. THE npm UsageSurface SHALL create a Binding for each of these forms whose module specifier is a string literal equal to the package name: `import x from`, `import * as x from`, `import { a, b as c } from`, `import x, { a } from`, `import x = require()`, `const x = require()`, `const { a, b: c } = require()`, and `const x = require().a` (with `const`, `let` or `var`).
2. THE npm UsageSurface SHALL emit a Call_Site for every call expression whose callee is a Binding, a property-access chain rooted at a Binding (`x.big(...)`, `x.a.b(...)`), an element access with a string-literal key rooted at a Binding (`x["big"](...)`), an optional-chain form of these (`x?.big(...)`), or an immediate `require("P")(...)` or `require("P").big(...)`.
3. WHEN a callee uses a computed key that is not a string literal, THE npm UsageSurface SHALL emit the Call_Site with `member` `<dynamic>`.
4. WHEN the call is a `new` expression, THE npm UsageSurface SHALL emit the Call_Site with `new` true.
5. THE npm UsageSurface SHALL set `member` from the Binding: `""` for a default, namespace, `require` or `import =` Binding of the whole module; the imported name for a named import or a destructured `require`; the property path after the `require()` for `require().a`; followed by the property path of the callee chain, joined with `.`.
6. WHEN the specifier is the package name followed by `/` and a subpath, THE npm UsageSurface SHALL emit an Import_Site and SHALL emit Call_Sites whose `member` begins with `./<subpath>`.
7. THE npm UsageSurface SHALL emit an Import_Site for every import, `import type`, `import x = require()`, side-effect import (`import "P"`), re-export (`export ... from "P"`), `require("P")` (bound or not) and dynamic `import("P")` whose specifier is a string literal or a template literal without substitutions, even when no call follows.
8. THE npm UsageSurface SHALL resolve Bindings by name within one file and SHALL NOT model scopes, so that a shadowed name can only add Call_Sites, never remove one.
9. WHEN calls are nested (`x(x(a))`) or appear inside the arguments of another call, THE npm UsageSurface SHALL emit one Call_Site for each.

### Requirement 4: Consumption detection

**User Story:** As a developer, I want the harness to know that the repository only compares a result with `undefined`, so that the property compares exactly what the code observes.

#### Acceptance Criteria

1. WHEN a Call_Site is the only argument of a call to the identifier `expect`, and that `expect(...)` call is followed by an optional `.not` and then a matcher call `toEqual(undefined)`, `toStrictEqual(undefined)`, `toBe(undefined)` (the argument is the identifier `undefined` or `void 0`), `toBeUndefined()` or `toBeDefined()`, THE npm UsageSurface SHALL set `consumedAs` to `undefined-check`.
2. WHEN a Call_Site is an operand of `===` or `!==` and the other operand is the identifier `undefined` or `void 0` (either side, parentheses ignored), THE npm UsageSurface SHALL set `consumedAs` to `undefined-check`.
3. THE npm UsageSurface SHALL NOT set `consumedAs` for any other use, including `==`, `!=`, a truthiness test, an assignment, an argument to another function, and a `.toEqual` whose argument is anything but `undefined`.
4. THE detection SHALL read only the syntax tree of the file containing the call, and SHALL NOT depend on the matcher chain spanning multiple lines.

### Requirement 5: Recipes and call shapes

**User Story:** As a maintainer, I want each hero package described once, with generators shaped by its real calls, so that the property tests real usage and nothing else.

#### Acceptance Criteria

1. THE Proof_Harness SHALL provide one Recipe per hero package at `apps/exorcist-npm/src/exorcise/recipes/<package>.ts` (`intersect`, `deep-diff`, `node-abort-controller`), and a registry `RECIPES` keyed by exact package name.
2. A Recipe SHALL declare the package name, the expected exact Oracle version (or none), an Oracle loader, and its list of Call_Shapes (possibly empty).
3. A Call_Shape SHALL have `accepts(site)` return true only when `site.member` equals the shape's member, `site.argCount` equals the shape's `argCount`, no `argTexts` entry starts with `...`, `site.new` is not true, and, for an `isUndefined` Projection, `site.consumedAs` is `undefined-check`.
4. A Call_Shape's arbitrary SHALL generate argument arrays of exactly `argCount` values shaped from the real call sites and SHALL include edge cases (empty lists, duplicates, repeated and unicode strings, empty objects and arrays, keys such as `*` and `_id`).
5. A Call_Shape SHALL provide `guard(args)` that returns true exactly for argument arrays that really have the call shape, `classify(args, oracleOutcome)` returning Coverage_Labels, and `requiredLabels`.
6. A Call_Shape SHALL declare `outputKind` (`array`, `object`, `boolean`, `opaque`), `orderSensitive` (whether swapping the first two arguments can change the Projection), and a Projection with `observes`.
7. WHEN no Call_Site is accepted by a Call_Shape, THE Proof_Harness SHALL NOT run that Call_Shape and SHALL list it in `shapes` as `skipped`.
8. WHEN the installed Oracle version differs from the Recipe's expected version, THE Proof_Harness SHALL return status `error` with code `oracle_version_mismatch` and SHALL NOT run any property.

### Requirement 6: Differential runner

**User Story:** As a developer, I want the new module compared with the old one on generated inputs, so that a difference is found and shrunk for me.

#### Acceptance Criteria

1. FOR each Call_Shape that has at least one accepted Call_Site, THE Differential_Runner SHALL run the property: for generated `args`, the Projection of the Oracle's Outcome equals the Projection of the Candidate's Outcome.
2. THE Differential_Runner SHALL run `numRuns` runs per Call_Shape, with a default of 200, SHALL reject `numRuns` below 100 with status `error` and code `invalid_runs`, and SHALL pass an explicit seed to fast-check.
3. THE Differential_Runner SHALL record the seed it used, and SHALL produce the same generated inputs for the same seed, Recipe and fast-check version.
4. WHEN both the Oracle and the Candidate throw for an input, THE Differential_Runner SHALL treat the Outcomes as equal whatever the messages; WHEN exactly one throws, it SHALL treat them as different.
5. WHEN neither throws, THE Differential_Runner SHALL compare the Projections structurally: primitives with `Object.is` (so `NaN` equals `NaN` and `-0` differs from `0`), arrays element by element, plain objects by own enumerable string keys independent of key order, `Date` by time value, and any other object by identity.
6. THE Differential_Runner SHALL give the Oracle and the Candidate each their own deep clone of the arguments, so that a function that mutates its input cannot change what the other receives.
7. THE Differential_Runner SHALL call a member function with `this` set to the object holding it (`intersect.big(...)` calls `big` with `this` equal to the module).
8. WHEN a property fails, THE Differential_Runner SHALL return status `counterexample` with the shrunk arguments, their rendering with `fc.stringify`, the shrink count, the replay path, the raw outputs of both sides and their Projections, each rendered with `fc.stringify` and cut to 2000 UTF-16 code units followed by `…`, and `<threw>` for an Outcome that threw.
9. WHEN either side returns a thenable, THE Differential_Runner SHALL return status `error` with code `async_not_supported`.
10. IF a Recipe function (`arbitrary`, `guard`, `classify`, Projection) throws, THEN THE Differential_Runner SHALL return status `error` with code `recipe_failure` and SHALL NOT throw or reject.
11. THE `runProof` function SHALL be synchronous, deterministic given its inputs, and SHALL never throw.
12. THE `runs` of a Proof_Result SHALL be the sum, over the Call_Shapes that ran, of the runs fast-check actually executed.

### Requirement 7: No trivial passes

**User Story:** As a maintainer, I want a green result to be impossible without real evidence, so that "proved" always means something.

#### Acceptance Criteria

1. WHEN `filesScanned` is 0, THE Proof_Harness SHALL return status `error` with code `no_source_files` and SHALL run no property.
2. WHEN the Usage_Surface has zero Call_Sites, THE Proof_Harness SHALL return status `no-call-sites`, SHALL run no property, and SHALL NOT return `proved`.
3. WHEN status is `no-call-sites` and there are zero Import_Sites, THE Proof_Harness SHALL set `recommendation` to `remove-dependency`; WHEN there is at least one Import_Site, it SHALL set `recommendation` to `review-imports`.
4. WHEN a Call_Site is accepted by no Call_Shape of the Recipe, THE Proof_Harness SHALL return status `error` with code `unsupported_call_shapes` whose message names up to five such sites as `file:line`.
5. WHEN there are Call_Sites and the package has no Recipe, THE Proof_Harness SHALL return status `error` with code `no_recipe`.
6. IF the arbitrary of a Call_Shape generates, in any run of the Call_Shape, a value for which `guard` is false, or generates no value for which `guard` is true, THEN THE Proof_Harness SHALL return status `error` with code `arbitrary_mismatch` and SHALL NOT return `proved`.
7. IF a Call_Shape passes all runs but some `requiredLabel` was produced by no run, THEN THE Proof_Harness SHALL return status `error` with code `insufficient_coverage` naming the missing labels, and SHALL NOT return `proved`.
8. IF the Candidate or the Oracle has no function at a Call_Shape's member, THEN THE Proof_Harness SHALL return status `error` with code `candidate_missing_member` or `oracle_missing_member`.
9. THE Proof_Harness SHALL return `proved` only when there is at least one Call_Site, every Call_Site is accepted by a Call_Shape, every Call_Shape with an accepted Call_Site ran all its runs without a counterexample, and every `requiredLabel` was produced.
10. WHEN several error conditions hold, THE Proof_Harness SHALL report the first in this order: `invalid_runs`, `no_source_files`, `no-call-sites`, `no_recipe`, `oracle_version_mismatch`, `unsupported_call_shapes`, `oracle_missing_member`, `candidate_missing_member`, then the errors found while running (`arbitrary_mismatch`, `async_not_supported`, `recipe_failure`), then `counterexample`, then `insufficient_coverage`.

### Requirement 8: Sabotage check

**User Story:** As a maintainer, I want every proof to show that it can fail, so that a suite that checks nothing is rejected (`proof-rules.md`).

#### Acceptance Criteria

1. WHEN the status of a run is `proved`, THE Proof_Harness SHALL run the Sabotage_Check on every Call_Shape that ran, for each Mutator applicable to it; for any other status it SHALL report `sabotage { applied: 0, caught: 0, survivors: [] }` and SHALL NOT run Mutators.
2. THE Proof_Harness SHALL provide these Mutators: `reverse-array` (reverses an array result), `drop-last` (drops the last element of an array result), `return-undefined` (returns `undefined`), `swap-first-two-args` (calls with the first two arguments swapped), `add-key` (returns a deep clone of a plain-object result with an added key `__sabotage__`), and `return-defined` (returns a fixed non-undefined object).
3. A Mutator SHALL be applicable to a Call_Shape as follows: `reverse-array` and `drop-last` when `outputKind` is `array` and the Projection observes `value`; `add-key` when `outputKind` is `object` and the Projection observes `value`; `swap-first-two-args` when `argCount` is at least 2 and `orderSensitive` is true; `return-undefined` always; `return-defined` when the Projection observes `definedness`.
4. THE Sabotage_Check SHALL wrap the Candidate with the Mutator, run the same property with the same `numRuns` and seed, and count the mutant as caught if and only if the result is a counterexample.
5. THE `sabotage` of a Proof_Result SHALL carry `applied` (the number of applicable (Call_Shape, Mutator) pairs), `caught`, and `survivors` (names `<shape id>:<mutator name>`), such that `applied` equals `caught` plus the length of `survivors`.
6. THE Proof_Harness SHALL set `weak` to true if and only if the status is `proved` and (`applied` is 0 or `survivors` is not empty).
7. A Mutator SHALL NOT modify the Candidate module, the Oracle module, the arguments it receives or any global state.
8. FOR every Recipe and every Mutator applicable to each of its Call_Shapes, WHEN the Mutator is applied to the Oracle itself as the Candidate, THE Differential_Runner SHALL return a counterexample.

### Requirement 9: Proof report

**User Story:** As a developer, I want the result stored as a stable, validated file, so that the page can show it and a re-run can be compared byte for byte.

#### Acceptance Criteria

1. THE skeleton SHALL export `serializeProofReport(report)` and `parseProofReport(text)` from `@last-rites/skeleton/proof`, with the Canonical_Json format: fixed key order from the design table, two-space indent, one trailing newline, absent optional fields omitted.
2. THE Proof_Report SHALL hold `repo` (a label such as `parse-community/parse-server`), optional `commit`, `package`, optional `oracleVersion`, `filesScanned`, `callSites`, `importSites`, and `attempts` in the order they were made.
3. EACH Proof_Attempt SHALL hold `attempt` (1-based, consecutive), optional `candidate { name, source }` (the base name and full source text of the Candidate file), `status`, `weak`, `numRuns`, `runs`, `seed`, `shapes` (per Call_Shape `id`, `status` of `passed`, `failed`, `skipped` or `error`, `runs`, and `coverage` counts), optional `counterexample`, optional `recommendation`, optional `error { code, message }`, and `sabotage { applied, caught, survivors }`.
4. THE Proof_Report SHALL NOT contain a timestamp, an absolute path or an environment value.
5. THE `parseProofReport` function SHALL return `{ ok: true, report }` or `{ ok: false, error: { category, message } }`, SHALL never throw, and SHALL use the categories `empty`, `invalid_json`, `missing_field`, `wrong_type`, `not_canonical` and `inconsistent`, with a message that names the path of the offending field.
6. THE `parseProofReport` function SHALL return `not_canonical` for any text that is valid but differs from `serializeProofReport` of the parsed value.
7. THE `parseProofReport` function SHALL return `inconsistent` when: attempt numbers are not 1 to n in order; `status` is `counterexample` and `counterexample` is absent, or the reverse; `status` is `proved` and the report has zero Call_Sites; `status` is `no-call-sites` and the report has Call_Sites, or `recommendation` is absent for it; `status` is `error` and `error` is absent, or the reverse; `sabotage.applied` differs from `caught` plus the length of `survivors`; `weak` differs from the rule in Requirement 8.6; or a non-proved attempt has a non-zero `sabotage.applied`.
8. THE Proof_Report SHALL be written to `demo/proofs/<repo>/<package>.json`, where both names are Proof_Names.

### Requirement 10: Proof CLI

**User Story:** As a developer, I want one command that proves a migration and records the result, so that I can run it, read the output and try again.

#### Acceptance Criteria

1. THE Proof_Cli SHALL be the npm script `exorcise` of `apps/exorcist-npm` (`vite-node src/exorcise/cli.ts --`) and SHALL accept `--repo <path>` and `--package <name>` (required), `--candidate <file>`, `--runs <n>` (default 200), `--seed <n>` (default the fixed seed 20261113), `--out <file>`, `--label <owner/repo>` (default the base name of `--repo`), `--commit <text>` and `--fresh`.
2. THE Proof_Cli SHALL reject unknown flags, a missing value, a `--runs` that is not an integer from 100 to 100000, a `--seed` that is not a non-negative integer, a package name that is not a Proof_Name, and a `--out` path whose directory name is not a Proof_Name under a `proofs` directory, with a usage message and exit code 2, and SHALL write nothing.
3. WHEN `--out` is omitted, THE Proof_Cli SHALL write to `demo/proofs/<last segment of the label, lower-cased>/<package>.json` under the repository root, and SHALL refuse when that segment is not a Proof_Name.
4. THE Proof_Cli SHALL scan the Target_Checkout with the npm Usage_Surface first. WHEN there are Call_Sites and no `--candidate` was given, it SHALL exit 2 and write nothing.
5. THE Proof_Cli SHALL load the Candidate with a dynamic `import()`, SHALL read its source text, and SHALL record the base name and text in the attempt.
6. WHEN the output file exists, THE Proof_Cli SHALL parse it with `parseProofReport`; IF it does not parse, or its `repo` or `package` differs, or its `callSites` or `importSites` differ from the fresh scan, THEN it SHALL exit 1 and write nothing unless `--fresh` was given, in which case it SHALL start a new report.
7. THE Proof_Cli SHALL append one Proof_Attempt for every run that reaches the Proof_Harness, whatever its status, and SHALL write the file atomically (a temp file in the same directory, then a rename), creating the directory when needed and removing the temp file on failure.
8. THE Proof_Cli SHALL print one summary line with the package, the attempt number, the status (and `weak` when set), the runs, the seed, and, for a counterexample, the shrunk input and both outputs; and SHALL print each usage-surface warning (at most 10, then a count).
9. THE Proof_Cli SHALL exit 0 when an attempt was recorded (any status), 1 when it could not run or write, and 2 on a usage error.
10. THE Proof_Cli SHALL read `process.argv` only in `main()`, SHALL read no environment variable, and SHALL contain the orchestration in a function with injected file system, loaders and usage surface, so that tests run it in-process.

### Requirement 11: Dependencies, oracles and package layout

**User Story:** As a maintainer, I want the oracles installed and pinned so that the proofs run offline and the same way everywhere.

#### Acceptance Criteria

1. THE `apps/exorcist-npm/package.json` SHALL declare `intersect` `1.0.1` and `deep-diff` `1.0.2` as exact devDependencies, and SHALL declare `typescript` as an exact dependency at the version already installed in the workspace.
2. THE `skeleton/package.json` SHALL declare `fast-check` as a dependency at the version already installed, and SHALL add the exports `./proof` (pure entry), `./proof/runner` and `./proof/testing`.
3. THE `apps/exorcist-npm/package.json` SHALL add the script `exorcise` and SHALL leave `scan` exports unchanged.
4. THE `@last-rites/skeleton/proof` entry point SHALL NOT, directly or transitively, import `fast-check`, so that the page bundle does not include it.
5. THE Oracle loader SHALL load the pinned package with `createRequire`, SHALL read its installed version from its `package.json`, and SHALL make no network request.
6. THE Proof_Harness SHALL declare no LLM client dependency, and any dependency it adds SHALL be pinned to an exact version.

### Requirement 12: Proof view model and ProofState

**User Story:** As a UI developer, I want a pure view model of a proof, so that the page renders facts and the facts are tested without a DOM.

#### Acceptance Criteria

1. THE `ProofState` of `@last-rites/skeleton/graveyard` SHALL be `{ status: "coming_soon" }`, `{ status: "loading" }` or `{ status: "report", view: ProofView }`, and the earlier placeholder variants and their helper types SHALL be removed, with every consumer updated.
2. THE `buildProofView(report)` function SHALL return a Proof_View with `badge` (`proved`, `weak`, `counterexample`, `no_call_sites` or `error`) and its `badgeLabel` (`Proved`, `Weak`, `Counterexample`, `No call sites`, `Proof error`), taken from the last attempt (`weak` when the last attempt is proved and weak).
3. THE Proof_View SHALL carry `runsText` (`<runs> runs`), `seedText` (`seed <seed>`), the Call_Sites as `file:line` labels in report order (at most 50 shown, with the total count and a `moreCount`), the attempt history in report order, and the sabotage line.
4. THE sabotage line for a proved attempt SHALL be exactly `Sabotage: <caught> of <applied> broken migrations caught`; for an attempt that is not proved it SHALL be `Sabotage: not run`.
5. FOR an attempt with a counterexample, THE Proof_View SHALL carry the shrunk input, the old output and the new output (and the two Projections) as strings, unchanged from the report.
6. WHEN the last attempt has a `recommendation`, THE Proof_View SHALL carry its sentence: `Remove the dependency: no source file imports or requires it.` for `remove-dependency`, and `Review the imports: the package is imported but never called directly.` for `review-imports`.
7. THE `buildProofView` function SHALL be total for any valid Proof_Report, SHALL be pure, and SHALL add no markup to any string it carries.
8. THE `proofSlotFor` function SHALL keep returning a slot for dead and dying graves only.

### Requirement 13: Loading proof reports in the page

**User Story:** As a visitor, I want the proof shown when one exists for the demo repository, and nothing broken when it does not.

#### Acceptance Criteria

1. THE Api_Client SHALL provide `getProof(demoName, packageName, signal)` that, only when both names are Proof_Names, requests `/demo/proofs/<demoName>/<packageName>.json` (same origin, GET, no credentials), and SHALL make no request otherwise.
2. THE `getProof` result SHALL be `{ ok: true, report }` for a body that `parseProofReport` accepts, `{ ok: false, reason: "absent" }` for HTTP 404, an invalid name, or a body that is not JSON (the dev server's HTML fallback), `{ ok: false, reason: "invalid" }` for a body that parses as JSON but is rejected by `parseProofReport`, and `{ ok: false, reason: "failed" }` for a network error or a timeout; it SHALL never throw.
3. THE page SHALL request a proof only when a Detail_Panel opens for a dead or dying package of a demo report, once per (demo, package) per page session, and SHALL abort pending proof requests when the route changes.
4. THE Vite dev middleware SHALL serve `/demo/proofs/<repo>/<package>.json` from `demo/proofs/` only when both names are Proof_Names, with the same 404 behavior as the demo snapshots, and SHALL pass any other path on.
5. THE Vite build SHALL emit `demo/proofs/<repo>/<package>.json` into `dist/demo/proofs/` for every file whose directory name and file name are Proof_Names, and SHALL skip any other entry.
6. THE name guard in `vite.config.ts` SHALL use the same pattern as `PROOF_NAME_PATTERN` of the skeleton, and a test SHALL assert that the two patterns are equal.
7. THE scan API (`/api/*`) SHALL be unchanged and SHALL NOT serve proof files.

### Requirement 14: Proof section rendering

**User Story:** As a visitor, I want to read a proof at a glance: did it pass, on what evidence, and what failed.

#### Acceptance Criteria

1. WHILE a proof request for the open package is pending, THE Proof_Section SHALL show a neutral loading line; WHEN the request ends with `absent`, `failed` or `invalid`, it SHALL show the existing "Exorcism coming" placeholder (for `invalid`, followed by one muted line saying that the proof report could not be read).
2. WHEN a Proof_Report is loaded, THE Proof_Section SHALL show: the badge label, the runs and seed, the Call_Sites list as `file:line` text, the attempt history in order, the sabotage line, and the recommendation when present.
3. FOR a counterexample attempt, THE Proof_Section SHALL show the shrunk input, then the old output and the new output, each as plain text in a preformatted block.
4. THE Proof_Section SHALL write every string of the report with `textContent` only, SHALL create no link from a report string, and SHALL NOT interpret markup.
5. WHEN a proof arrives after the panel opened, THE Detail_Panel SHALL replace only the Proof_Section content and SHALL NOT move focus, change the scroll position of the panel or close it.
6. THE Proof_Section SHALL keep the heading `Proof`, SHALL be reachable by keyboard in the existing tab order, and SHALL use only existing theme tokens, so that the contrast checks of the theme still pass.
7. THE badge SHALL convey its meaning in text, not only by colour.
8. WHEN the Call_Sites list is longer than 50, THE Proof_Section SHALL show the first 50 and a line `and <n> more`.

### Requirement 15: Hero cases

**User Story:** As a user of the demo, I want the three parse-server cases to show three different, honest outcomes.

#### Acceptance Criteria

1. THE `intersect` Recipe SHALL have two Call_Shapes, `intersect` (member `""`) and `intersect.big` (member `big`), each with `argCount` 1, `outputKind` `array`, an `identity` Projection that observes `value`, and `orderSensitive` false.
2. THE `intersect` arbitraries SHALL generate an array of 0 to 6 arrays of 0 to 8 objectId-like strings (10 to 24 characters from a small alphabet so that overlaps are common), with duplicates allowed in every list, and SHALL require the labels `single-list`, `multi-list`, `empty-result`, `non-empty-result` and `duplicates-in-last-list`.
3. THE `deep-diff` Recipe SHALL have one Call_Shape, member `""`, `argCount` 2, accepted only for Call_Sites with `consumedAs` `undefined-check`, an `isUndefined` Projection that observes `definedness`, `outputKind` `opaque`, and `orderSensitive` false.
4. THE `deep-diff` arbitrary SHALL generate pairs of JSON-like values (objects, arrays, strings, integers, booleans, `null`; nesting up to depth 4; keys from a small alphabet that includes `*` and `_id`) drawn from three families: an exact deep clone with keys reordered, a clone with one random change, and two independent values; and SHALL require the labels `equal-pair` and `unequal-pair`.
5. THE `node-abort-controller` Recipe SHALL have no Call_Shape and no Oracle, so that any Call_Site of it yields `unsupported_call_shapes` and zero Call_Sites yield `no-call-sites`.
6. THE Candidates for the Hero_Cases SHALL be written in this repository under `demo/proofs/candidates/parse-server/` and SHALL NOT be copied from the target.
7. WHEN the Candidate for `intersect` is the native `Set` version, THE Proof_Harness SHALL give a truthful result for it, and WHEN that is a counterexample the result SHALL carry the shrunk lists.
8. FOR a package with zero Call_Sites (`node-abort-controller`) THE Proof_Harness SHALL return `no-call-sites` and the recommendation `remove-dependency` when no source file imports or requires the package, and SHALL need no Candidate.

### Requirement 16: Real-checkout run and the log

**User Story:** As the author of the demo, I want the three real proofs recorded, with every outcome written down truthfully.

#### Acceptance Criteria

1. THE final task group SHALL run the real Proof_Cli against `../lastrites-work/parse-server` for `intersect`, `deep-diff` and `node-abort-controller`, with `--runs 1000`, `--label parse-community/parse-server` and `--commit 3402ee6`, and SHALL write `demo/proofs/parse-server/<package>.json` for each.
2. FOR `intersect`, THE first Candidate SHALL be the naive native `Set` version (attempt 1); only if attempt 1 yields a counterexample SHALL a corrected Candidate be written and run as attempt 2; both outcomes SHALL be recorded in the report, whatever they are.
3. IF attempt 1 for `intersect` is proved, THEN THE group SHALL record it as proved and SHALL NOT write a second Candidate.
4. IF `deep-diff` yields a counterexample or an error, THEN THE group SHALL record it as it is and SHALL NOT weaken the arbitrary, the Projection or the acceptance rule to obtain a pass; a corrected Candidate is allowed (`migration-rules.md` rule 6) and SHALL be recorded as the next attempt.
5. THE task group SHALL append a dated entry to `docs/kiro-log.md` with, for each package: the command, the call-site counts (`src` and `test`), the status of each attempt, the seed, the shrunk counterexample if any, the sabotage line, and anything the run showed that differs from what this spec expected.
6. THE task group SHALL treat the target checkout as read only, and SHALL NOT run its test suite, install its dependencies or modify it.
7. THE test suite SHALL parse every committed `demo/proofs/**/*.json` with `parseProofReport` and SHALL assert only the invariants of Requirement 9, never a specific hero outcome.

### Requirement 17: Offline tests and synthetic fixtures

**User Story:** As a maintainer, I want the tests to run anywhere with no network and without the target checkout.

#### Acceptance Criteria

1. THE test suite SHALL make no network request and SHALL NOT read any path outside this repository; no test file SHALL contain the string `lastrites-work`.
2. THE test suite SHALL use synthetic source trees under `apps/exorcist-npm/src/exorcise/__fixtures__/trees/`, written for this repository to mimic the call shapes (a Flow-annotated `.js` file with `import intersect from 'intersect'` and `intersect.big(allIds)`, spec files with `const dd = require('deep-diff')` and `expect(dd(a, b)).toEqual(undefined)`, a tree that only declares a package), and SHALL NOT copy any file of the target.
3. WHEN a test needs a directory the repository's `.gitignore` excludes (`node_modules`, `dist`), THE test SHALL create it in a temporary directory and remove that directory in `finally`.
4. THE property tests of the Usage_Surface SHALL run over an in-memory `SourceFs`, with at most one example test using a real temporary directory.
5. THE tests SHALL load the Oracles from the pinned devDependencies and SHALL NOT download anything.
6. THE test suite SHALL pass `npm run typecheck` with zero errors.

### Requirement 18: Properties and sabotage lists

**User Story:** As a maintainer, I want the harness itself proven by properties that can fail.

#### Acceptance Criteria

1. THE test suite SHALL include one fast-check property for each of these eleven subjects, each with `numRuns` 100: (1) differential soundness, (2) counterexample reality, (3) no trivial passes, (4) sabotage completeness, (5) determinism, (6) usage-surface determinism and completeness, (7) sabotage accounting and the weak flag, (8) outcome equivalence including exceptions, (9) Proof_Report codec, (10) Proof_View faithfulness, (11) Proof_Name and path guard. Properties 7 to 11 are additive to the six named in the brief.
2. THE test suite SHALL contain one Sabotage_List per property, in files `proof-p1.ts` to `proof-p11.ts`, each with at least one entry that is a deliberately wrong implementation, and one central sabotage test per workspace package that owns properties, running each property against every entry of its list with the fixed seed.
3. IF a Sabotage_List entry does not make its property fail, THEN THE test suite SHALL fail with the message `Sabotage "<name>" stayed green for "<property>"`.
4. THE test suite SHALL use the seed policy of `fc-runner.ts`: `FC_SEED` wins, `CI` fixes the seed, and the seed and the shrunk counterexample are printed on failure.
5. THE Sabotage_Lists SHALL include at least: for property 1, a harness that compares outputs with `===`; for property 3, a harness that returns `proved` for zero call sites; for property 4, a Mutator that does not change the output type it claims to; for property 5, a harness that puts the current time or a random value in the report; for property 6, a usage surface that skips `.js` files with type annotations and one that counts a nested call once; for property 9, a codec that accepts non-canonical text.
