import type { DemoRepo } from "./demo-snapshot.js";

/**
 * Named public repositories for the manual snapshot script (`npm run demo-snapshot`).
 * Each name matches DEMO_NAME_PATTERN and becomes `/demo/<name>.json`.
 *
 * Hero repos: famous, actively maintained projects that still carry dead or replaceable
 * direct dependencies (screened 2026-11-13 against npm deprecation and the e18e manifests):
 * - jest: `pkg-dir` deprecated; `slash` (micro-utility), `promise` (native).
 * - prettier: `remark-footnotes` deprecated; `escape-string-regexp`, `collapse-white-space`, `micromatch`.
 * - parse-server: `ldapjs`, `deep-diff`, `mongodb-runner`, `@babel/plugin-proposal-object-rest-spread` deprecated; `form-data` (native).
 * - pump: the small recorded fixture repository (see `__fixtures__/README.md`), a healthy baseline.
 *
 * Refs default to HEAD, so a snapshot reflects the repository at the time the script is run.
 */
export const DEMO_REPOS: readonly DemoRepo[] = [
  { name: "jest", owner: "jestjs", repo: "jest" },
  { name: "prettier", owner: "prettier", repo: "prettier" },
  { name: "parse-server", owner: "parse-community", repo: "parse-server" },
  { name: "pump", owner: "mafintosh", repo: "pump" },
];
