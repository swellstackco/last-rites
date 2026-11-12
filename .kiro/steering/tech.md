---
inclusion: always
---

# Tech

- **Language:** TypeScript (strict). Node 22+. ESM only.
- **Repo:** npm workspaces. Packages: `skeleton`, `apps/exorcist-npm`, `apps/exorcist-actions`, `mcp`, `power`.
- **Tests:** Vitest + **fast-check** for property-based tests. Every pure module gets at least one property, not just examples.
- **Server:** Hono on Node, one small API. It serves cached scans from disk (JSON) and rate-limits live scans.
- **Web UI:** Vite + TypeScript, no heavy framework unless a spec justifies one. The graveyard UI must look distinctive: no generic purple gradients and no cream/serif look.
- **Data sources (all free, no keys required, GitHub token optional):** npm registry, GitHub REST API, OSV.dev, deps.dev, e18e `module-replacements`.
- **Caching:** every external fetch goes through one cache layer (disk, with a TTL). Tests never hit the network; they use recorded fixtures.
- **Hosting:** a single small VPS behind nginx. No paid cloud services.
- **No LLM calls** anywhere in the hosted app or the tests.

## Commands
- `npm test` runs all workspace tests (Vitest).
- `npm run typecheck` runs `tsc --noEmit` across workspaces.
- `npm run dev` starts the API + web UI locally.
