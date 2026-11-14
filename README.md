# Last Rites 🪦

**Bury your dead dependencies, with proof.**

Last Rites finds the dead dependencies in a repo, scores how dead each one is (0 to 100, every point shown with its source), and proves with property-based tests that a replacement behaves the same **at your real call sites** before anything changes.

**Live:** https://lastrites.swellstackco.com → open `parse-server` → click `intersect` → scroll to Proof.

## The moment it's built for

A Kiro custom agent was asked to replace `intersect` in parse-server. Its first replacement deduplicated the result. Last Rites ran old vs new on generated inputs shaped like parse-server's real call sites and shrank the difference to one line:

```
input  [[["x","x"]]]
old    ["x","x"]
new    ["x"]
```

The agent read the counterexample, fixed its code, and proved it: 2,000 runs, zero differences, 6 of 6 sabotage mutants caught. Only then did it touch the target, with one commit on a local branch and nothing pushed. The full report is `demo/proofs/parse-server/intersect.json`.

## Two apps, one skeleton

| | `apps/exorcist-npm` | `apps/exorcist-actions` |
|---|---|---|
| Finds | dead npm packages (lockfile or ranges) | dead GitHub Actions in `.github/workflows` |
| Evidence | npm registry, GitHub, OSV, e18e module-replacements | GitHub (archived, releases, `runs.using` node12/16), OSV GitHub Actions |
| Fix | replacement module | swap action, or pin a mutable tag to its SHA |
| Proof | differential fast-check vs the old package on real call shapes | input/output contract vs the replacement's `action.yml`; SHA = what the tag resolves to; one-line surgical rewrite |
| Demo | parse-server, prettier, jest, pump | railwayapp/nixpacks |

`skeleton/` holds what both share: the death-score engine (with calibration), the proof report format and differential runner, the sabotage check, and the graveyard view model. `apps/exorcist-web` is The Graveyard UI; `mcp/` is the MCP server; `power/` is the Kiro power.

## Proof rules (no fake green)

- The old package is the oracle; inputs are shaped by the real call sites.
- Only what the code consumes is compared (parse-server only checks `deepDiff(a, b) === undefined`, so that is the projection).
- Zero call sites never passes: `node-abort-controller` gets NO CALL SITES and "remove the dependency".
- Every proof runs a sabotage check: deliberately broken versions of the candidate must each be caught, or the proof is marked weak.

## Built with Kiro

Everything under `.kiro/` was used to build this repo:

- **12 specs** (`.kiro/specs/`), including 4 bugfix specs. EARS requirements, designs with numbered correctness properties, every task checked off; commits name their spec and batch.
- **6 steering files** (product, tech, structure, migration-rules, proof-rules, graveyard-ui).
- **4 hooks**: rescan on lockfile save, re-prove on candidate save, re-check the death-score monotonicity property on engine save, typecheck + tests on agent stop.
- **2 custom agents**: `coroner` (read-only investigation) and `exorcist` (migrates, but must prove first; never pushes).
- **MCP server** (`scan_repo`, `death_report`, `usage_surface`, `find_replacement`, `generate_pin_tests`) and a **Kiro power** (`power/`).
- Kiro IDE for spec authoring; Kiro CLI headless for task batches, each gated by typecheck and the full test suite before commit. Build notes: `docs/kiro-log.md`.

## Run it

```bash
npm ci
npm test                 # ~2,100 tests, offline (recorded fixtures)
npm run dev              # The Graveyard + scan API on 127.0.0.1
npm run exorcise -w @last-rites/exorcist-npm -- --repo <path> --package <name> --candidate <file> --runs 1000
npm run scan -w @last-rites/exorcist-actions -- --repo <path>
```

Live scans call public APIs (npm, GitHub, OSV); set `GITHUB_TOKEN` for a higher GitHub rate limit.

## License

MIT
