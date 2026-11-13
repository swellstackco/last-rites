# Brief: Kiro integration (MCP server, power, hooks, custom agents), 2026-11-13

Written by Claude (planning) as input for the Kiro spec `.kiro/specs/kiro-integration`. Kiro writes the spec and builds it. Follow Kiro's own current documented formats for powers, hooks, custom agents and MCP settings (you know them better than this brief; where this brief's file names disagree with Kiro's format, Kiro's format wins and the spec says so).

## Goal
Make Last Rites usable from inside Kiro itself, and use it that way on this repo during the build, so the `.kiro/` folder shows real use: an MCP server, a Kiro power that packages it, hooks that fire, and two custom agents.

## 1. MCP server (`/mcp`, new workspace package)
stdio server using the official MCP TypeScript SDK (exact pinned version). Tools, each a thin wrapper over existing code (no new logic, no LLM calls):
- `scan_repo { repo: "owner/name" | local path, ref? }` → the Scan_Report (canonical JSON) or a cached demo when the name matches a demo.
- `death_report { repo, package }` → one package's score, grade, parts, calibration, evidence sources.
- `usage_surface { path, package }` → call sites from the proof-harness usage surface.
- `find_replacement { package }` → the known replacement from evidence (e18e module-replacements) or `none`.
- `generate_pin_tests { path, package, candidate, runs? }` → runs the proof harness (recipe + differential + sabotage) and returns the Proof_Report attempt; never writes outside the given output path.
Input validation with the same guards as the Scan_Api (repo name pattern, path must exist and be a directory, package name pattern). Tests: each tool against fixtures offline; a property that every tool's output parses with the existing validators.
Register it in `.kiro/settings/mcp.json` (workspace) so Kiro in this repo can call it.

## 2. Kiro power (`/power`)
Package the MCP server plus steering for migrations (`migration-rules.md`, `proof-rules.md`) as a Kiro power in Kiro's documented format, with a README explaining install into another workspace. A test checks the power manifest is valid JSON/YAML and its MCP entry points at the built server.

## 3. Hooks (`.kiro/hooks/`)
Four hooks in Kiro's hook file format:
1. On save of `package.json` / `package-lock.json`: run the scanner on this repo and warn about new dead packages.
2. On save of `skeleton/src/death-score/**` weights or config: re-run the monotonicity property test.
3. After an agent turn ends (agent stop): `npm run typecheck` and the affected tests.
4. On save of any file under `demo/proofs/candidates/**`: re-run the proof for that candidate and show the status.
Each hook has a short description. A test validates each hook file's shape.

## 4. Custom agents (`.kiro/agents/`)
- `coroner`: read-only; tools limited to reading files and the MCP tools `scan_repo`, `death_report`, `usage_surface`, `find_replacement`; prompt: gather death evidence and call sites, never edit.
- `exorcist`: may edit files and run npm/git in a target repo; must follow `migration-rules.md` and `proof-rules.md`; always calls `generate_pin_tests` before declaring a migration done and reports the Proof_Report status honestly (counterexample means not done).
A test validates each agent file's shape and that `coroner` has no write tools.

## 5. Real use (final task group, manual, outside npm test)
- From this repo, run `kiro-cli chat --agent coroner` (non-interactive) against `../lastrites-work/parse-server` for `deep-diff` and save the transcript summary to `docs/kiro-log.md`.
- Run the `exorcist` agent to migrate `intersect` in `../lastrites-work/parse-server` on a new local branch (never push), writing its candidate under `demo/proofs/candidates/parse-server/intersect.agent.js` and running `generate_pin_tests`; record every attempt's status truthfully in the log and append it to `demo/proofs/parse-server/intersect.json` only if the CLI attempt format matches.
- Record which hooks fired during the build, with dates, in `docs/kiro-log.md`.

## Out of scope
Publishing the power to any registry, network calls in tests, any change to scoring or proof logic.
