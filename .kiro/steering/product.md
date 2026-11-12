---
inclusion: always
---

# Product: Graveyard Kit + Exorcist

**One line:** find the dead packages in a codebase, swap each for a living replacement, and prove with property tests that the code still behaves the same.

## The problem
Every codebase depends on open-source packages that have died: archived repo, no publish in years, deprecated on npm, open vulnerabilities that will never be fixed. Existing tools *flag* risky packages. None of them **migrate you off with proof** that behavior did not change.

## What we ship
- **Graveyard Kit (`/skeleton`)**: a reusable starter for "find dead things, replace them, prove it" tools. It provides an adapter interface (inventory → evidence → replacement → proof), a transparent death-score engine, a graveyard UI component, a differential proof harness and a Kiro power template.
- **Exorcist for npm (`/apps/exorcist-npm`)**: the flagship app built on the kit. It scans a repo's `package-lock.json`, shows one tombstone per dead package with linked evidence, generates differential pin tests from real call sites, and exports a Kiro spec to run the migration.
- **Exorcist for GitHub Actions (`/apps/exorcist-actions`)**: a thin second app on the same kit, proving the skeleton is reusable. It is optional and can be cut.

## Principles
- **Proof over claims.** A migration is done only when pin tests are green against the old package AND the new one, and a sabotage check shows the tests can actually fail.
- **Evidence is visible.** Every death score shows its parts and links to its sources. No black box.
- **The hosted app is deterministic.** It makes no LLM calls. Agent work runs in the user's own Kiro.
- **Judge-proof demo.** Cached pre-scanned repos load instantly, live scans are rate-limited, and nothing breaks on cold start.

## Users
Developers and maintainers with an old JS/TS codebase who want to remove dead dependencies safely.

## Out of scope (v1)
Ecosystems other than npm, yarn/pnpm lockfiles, private repos, accounts, transitive exorcism, the fork-and-resurrect path.
