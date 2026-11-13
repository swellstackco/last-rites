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
