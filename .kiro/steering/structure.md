---
inclusion: always
---

# Structure

```
/skeleton              reusable kit: adapter interface, death-score engine, proof harness, graveyard UI component
/apps/exorcist-npm     flagship app: npm scanner, evidence fetchers, pin-test generator, spec export
/apps/exorcist-actions thin second app: GitHub Actions scanner (optional, can be cut)
/mcp                   MCP server exposing scan_repo, death_report, usage_surface, find_replacement, generate_pin_tests
/power                 Kiro power (plugin.json + skills/ + mcp.json)
/demo                  pre-scanned demo repos (cached JSON) used by the hosted app
/docs                  kiro-log.md (dated build notes), write-up material
/.kiro                 specs, steering, hooks, agents, settings
```

## Rules
- An app may import from `/skeleton`; `/skeleton` never imports from an app.
- Each adapter implements the same four stages: `inventory`, `evidence`, `replacement`, `proof`.
- One spec per component under `.kiro/specs/<component>/`. Commits reference spec task numbers (e.g. `death-score 2.1: ...`).
- Fixtures live next to the tests that use them, under `__fixtures__/`.
