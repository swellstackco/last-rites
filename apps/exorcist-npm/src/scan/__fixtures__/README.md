# Scan fixtures

Recorded 2026-11-13 by `npm run record-scan-fixtures -w @graveyard-kit/exorcist-npm -- pump mafintosh/pump`
(`test-support/record-scan-fixtures.ts`), unauthenticated (no GitHub token). One `FixtureEntry` per file; request headers are never stored.

| Item | Value |
|---|---|
| Case | `pump` |
| Repository | [mafintosh/pump](https://github.com/mafintosh/pump) (public) |
| Commit SHA | `714c0a70a8199104bf65a57582009d42f81d8d94` (scan tests pass this SHA as the ref) |
| License | MIT |
| Lockfile version | 3 |
| Packages in lockfile | 3 (`end-of-stream`, `once`, `wrappy`) |
| Direct registry dependencies | `end-of-stream`, `once` (evidence recorded for each, OSV queried with the lockfile version) |
| Deprecated or e18e-listed direct dependency | **None found.** No direct dependency is deprecated on npm or listed in the shared e18e manifests. |

Layout: `pump/meta.json`, `pump/repo/package-json.json`, `pump/repo/package-lock-json.json`, and `pump/<pkg>/{npm,github-repo,github-commit,osv}.json`.
e18e manifests are reused from `../../evidence/__fixtures__/shared/`.
