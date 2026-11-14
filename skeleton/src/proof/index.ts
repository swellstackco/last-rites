// Pure entry of the proof harness: types, names and the Proof_Report codec. No fast-check, no Node.
export type * from "./types.js";
export { compareSites, sortSites } from "./usage-surface.js";
export { PROOF_NAME_PATTERN, isProofName, proofReportPath, parseProofReportPath, actionProofName, proofNameFor } from "./names.js";
export type { Ecosystem } from "./names.js";
export { sha256Hex } from "./sha256.js";
export { serializeProofReport, parseProofReport, appendAttempt, checkConsistency } from "./report.js";
export type { ProofReportParseError, ParseProofReportOutcome } from "./report.js";
