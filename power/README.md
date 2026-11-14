# Exorcist power

Find dead npm packages, swap each for a living replacement, and prove with property tests that behavior did not change. This power gives Kiro five tools (a local stdio MCP server) and two skills (the migration and proof rules). It makes no LLM calls and is not published to any registry.

Contents: `plugin.json`, `mcp.json`, `skills/migration-rules/SKILL.md`, `skills/proof-rules/SKILL.md`, this README. The server `server/exorcist-mcp.mjs` is build output and is ignored by git. The skills are generated from `.kiro/steering/` by `npm run power:sync -w @last-rites/exorcist-mcp`; a test fails if they drift.

## Build the server

From the repository root:

```
npm install
npm run build -w @last-rites/exorcist-mcp
```

This writes `mcp/dist/server.mjs` and copies it, with the demo snapshots, to `power/server/exorcist-mcp.mjs` and `power/server/demo/`. Run it again after any change to `mcp/src`.

## Install

- Kiro IDE: open the Powers panel, choose "Add Custom Power", and import from the `power/` folder.
- Kiro CLI: `kiro-cli powers install ./power`

Assumption, not yet verified: the `args` entry `server/exorcist-mcp.mjs` in `mcp.json` is resolved relative to the power folder. This is checked in the final real-use group of the kiro-integration spec (Phase 11) and the result is recorded in `docs/kiro-log.md`.

## Tools

- `scan_repo`: scan a repo for dead packages. Takes a demo name, `owner/repo` (GitHub) or a local path with `package.json` and `package-lock.json`. Returns a Scan_Report.
- `death_report`: the death score of one dependency, with its parts and linked sources.
- `usage_surface`: the call sites and import sites of a package in a local checkout.
- `find_replacement`: the living replacement for a package, from the e18e module-replacements data.
- `generate_pin_tests`: build differential pin tests from the real call sites, run them against the old package and a candidate replacement, and run the sabotage check. Returns a proof report. It writes nothing unless you pass `out`.

`generate_pin_tests` loads and executes the candidate file you pass (`.js`, `.mjs` or `.cjs`) in the server process. Only point it at code you trust. It is the only tool that is not auto-approved in this repository's settings.

## Configuration

- `GITHUB_TOKEN` (optional): raises the GitHub API rate limit for `owner/repo` scans. The power's `mcp.json` sets no environment values, so the server only sees variables Kiro passes to it. Without a token, scans still work at the lower anonymous limit.
- `EXORCIST_CACHE_DIR` (optional): where fetched evidence is cached. Default: `<os temp dir>/exorcist-mcp`.

## Limits

- npm and `package-lock.json` only. No yarn or pnpm lockfiles, no private repos.
- Direct calls only: calls through aliases, wrappers or dynamic access are not pinned, and a package with no direct call sites cannot be proved.
- `runs` is an integer from 100 to 100000 (default 200).
- Scans are bounded by a time limit and report `scan_failed` when it is exceeded.
