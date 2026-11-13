import type { DemoRepo } from "./demo-snapshot.js";

/**
 * Named public repositories for the manual snapshot script (`npm run demo-snapshot`).
 * Each name matches DEMO_NAME_PATTERN and becomes `/demo/<name>.json`.
 *
 * - bower, request, request-promise: archived or deprecated projects whose own dependency trees
 *   contain deprecated packages (request, fstream, q, tough-cookie 2.x, ...).
 * - grunt: a long-lived tool with dated direct dependencies (exit, eventemitter2, grunt-legacy-*).
 * - pump: the small recorded fixture repository (see `__fixtures__/README.md`), a healthy baseline.
 *
 * Refs default to HEAD, so a snapshot reflects the repository at the time the script is run.
 */
export const DEMO_REPOS: readonly DemoRepo[] = [
  { name: "bower", owner: "bower", repo: "bower" },
  { name: "request", owner: "request", repo: "request" },
  { name: "request-promise", owner: "request", repo: "request-promise" },
  { name: "grunt", owner: "gruntjs", repo: "grunt" },
  { name: "pump", owner: "mafintosh", repo: "pump" },
];
