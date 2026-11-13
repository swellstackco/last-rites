# Fixtures for exorcist-web

All files are canonical scan reports (they pass `parseReport`). They are copies or trimmed copies of the
pre-scanned snapshots in the repo-root `demo/` directory. No network is used to make or read them.

| fixture | source | what is kept |
|---|---|---|
| `parse-server.trim.json` | `demo/parse-server.json` | the five dead, calibrated packages (`@babel/plugin-proposal-object-rest-spread`, `@saithodev/semantic-release-backmerge`, `deep-diff`, `ldapjs`, `node-abort-controller`), two ailing (`cross-env`, `jasmine-spec-reporter`) and two alive (`pg-monitor`, `lodash`) |
| `prettier.trim.json` | `demo/prettier.json` | the one dead package `remark-footnotes` plus `cross-env`, `unified`, `leven`; the "no lockfile" warning |
| `jest.trim.json` | `demo/jest.json` | four ailing packages, no dead, no dying; both warnings and all eight skipped workspace entries; ranges only |
| `pump.json` | `demo/pump.json` | the whole file, unchanged |

## Trimming rule

`src/test-support/trim-report.ts` keeps the named dependencies in their original order, recomputes `summary`
from the kept dependencies (`skipped` is the number of kept skipped entries, which are all of them), and keeps
`warnings` and `skipped` verbatim. The output is written with `serializeReport`.

Regenerate by hand (not part of any test run): `npx vite-node apps/exorcist-web/scripts/trim-fixtures.ts`.
