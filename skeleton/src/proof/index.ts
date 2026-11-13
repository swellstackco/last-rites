// Pure entry of the proof harness: types, names and the Proof_Report codec. No fast-check, no Node.
export type * from "./types.js";
export { compareSites, sortSites } from "./usage-surface.js";
export { PROOF_NAME_PATTERN, isProofName, proofReportPath, parseProofReportPath } from "./names.js";
export { serializeProofReport, parseProofReport, appendAttempt, checkConsistency } from "./report.js";
export type { ProofReportParseError, ParseProofReportOutcome } from "./report.js";
