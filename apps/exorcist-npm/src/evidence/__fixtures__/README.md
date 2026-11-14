# Fixtures

Recorded 2026-11-13 by `npm run record-fixtures -w @last-rites/exorcist-npm -- all`
(`test-support/record-fixtures.ts`), unauthenticated (no GitHub token). One `FixtureEntry` per file; request headers are never stored.

| Case | Package | Files |
|---|---|---|
| `picocolors` | picocolors (healthy) | npm, github-repo, github-commit, osv |
| `request` | request (deprecated; has 1 OSV vuln) | npm (~300 KB, kept as recorded), github-repo, github-commit, osv |
| `left-pad` | left-pad (e18e `native` entry: `String.prototype.padStart`) | npm, github-repo, github-commit, osv |
| `archived-repo` | **gulp-util** (`gulpjs/gulp-util` has `archived: true`) | npm, github-repo, github-commit, osv |
| `no-repository` | **demo** (registry document has no `repository`) | npm, osv (no GitHub fixtures) |
| `shared` | n/a | e18e `native`, `micro-utilities`, `preferred` manifests (~300 KB total), `depsdev-picocolors` |

Notes:
- OSV bodies are `{"package":{"name":..,"ecosystem":"npm"},"version":<dist-tags.latest>}` (key order matters for exact match).
- `left-pad` repo `stevemao/left-pad` answers 301 on the API; the recorded response is the followed (200) one.
- deps.dev v3 fields (for `depsdev.ts`): `versions[].versionKey.version`, `versions[].publishedAt`, `versions[].isDefault`, `versions[].isDeprecated`, `versions[].deprecatedReason`.
