// Test support for proof code: synthetic recipes, the report arbitrary and the fault family.
export {
  SYNTHETIC_CASES,
  FAULT_FAMILY,
  moduleFor,
  usageFor,
  usageResultFor,
} from "./test-support/synthetic-recipes.js";
export type { SyntheticCase, Fault } from "./test-support/synthetic-recipes.js";
export { proofReportArb, callSiteArb, importSiteArb } from "./test-support/arbitraries/report.js";
export { runShape } from "./runner/differential.js";
export type { ResolvedMember, ShapeRun } from "./runner/differential.js";
export { resolveMember } from "./runner/outcome.js";
