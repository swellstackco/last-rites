// Test-only subpath: arbitraries, sabotage runner and the fast-check runner helpers.
export * from "./test-support/arbitraries.js";
export { assertAllSabotagesCaught, ensure } from "./test-support/sabotage-runner.js";
export type { Sabotage } from "./test-support/sabotage-runner.js";
export {
  assertProperty,
  checkProperty,
  NUM_RUNS,
  FIXED_SEED,
  resolveSeed,
} from "../death-score/fc-runner.js";
