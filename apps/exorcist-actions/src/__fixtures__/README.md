# Fixtures of exorcist-actions

Tests never touch the network. Everything they need is in this folder.

## `nixpacks/repo/`

The seven files in `.github/workflows/` of `railwayapp/nixpacks` at commit
`144b4f9ab1c3943af4dfe76d3c79d91263f5b465`, copied byte for byte from the local clone
`../lastrites-work/nixpacks` (task 2.9). No request was made for them.

## `nixpacks/http/`

Each file is one recorded HTTP exchange in the `FixtureEntry` format of the npm test support
(`method`, `url`, optional exact `body`, `response`). Request headers are never recorded. The only
response headers kept are `content-type`, `link`, `retry-after` and the `x-ratelimit-*` headers.

How they were recorded: `npm run record-fixtures -w @last-rites/exorcist-actions -- --clone <clone path>`
(`src/test-support/record-fixtures.ts`), run from the workspace with the path of the local clone. The script runs the real pipeline (`runScan` on the clone with
`--label railwayapp/nixpacks --ref 144b4f9`, then `runExorcise --fix swap --action actions-rs/toolchain`
and `--fix pin --action actions/checkout`, without `--write`) over a recording `HttpClient`. After that it
fetches the repository metadata and the `action.yml` of every Replacement `from` (at `v1`) and `to` (at
`toRef`, `main` and `master`). All URLs come from the same builders as the production code. The same run
writes `demo/nixpacks-actions.json` and `demo/proofs/nixpacks-actions/*.json`.

- Date: 2026-11-14 (UTC). The first run started at 00:54Z and the completing run at 01:55Z.
- Token: no. Recorded unauthenticated, with no `GITHUB_TOKEN` in the environment.
- Rate limit: the pipeline needs more than the 60 unauthenticated GitHub API calls an hour allows
  (20 actions × 3 calls for the scan, plus the pin resolution and the replacement metadata). The first
  run got two 403s (`actions/checkout` commit resolution and `actions/create-release` metadata). The
  Recorder resumes: a re-run answers every request that already has a recorded 2xx or 404 exchange from
  that exchange, and requests only the missing or failed ones. The re-run after the reset filled the gaps.
  The committed set has no 403, 429 or 5xx. Its only 404s are the `main` manifest lookups of
  `dtolnay/rust-toolchain` and `softprops/action-gh-release`, which use `master`.
- 112 exchanges.

To rebuild the demo files from these fixtures without the network (same pipeline, a fake clock at the
committed `scannedAt`), run `npm run record-fixtures -w @last-rites/exorcist-actions -- --regenerate`.
`src/replay.test.ts` asserts that this gives the committed bytes.

## Tag ordering note

`monthsSinceLastPublish` falls back to `GET /repos/{o}/{r}/tags?per_page=1` when an action has no
release. GitHub does not guarantee that the first tag it lists is the newest one by date, so the
fallback can over- or under-state the months. In this recording all 20 actions have a latest release,
so the fallback was never used and there is no tags fixture.

## Other folders

`inventory/__fixtures__/` (next to the inventory tests) holds the small hand-written workflow files for
the layout cases.
