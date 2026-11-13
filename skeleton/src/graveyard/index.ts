// Public API of the Graveyard view model. Pure: no DOM, no I/O, no clock.
export { GRADE_ORDER, GRADE_INFO } from "./grade-order.js";
export type { GradeInfo } from "./grade-order.js";
export { SIGNAL_INFO, formatRawValue } from "./signal-info.js";
export { buildGraveyard, compareGraves } from "./build-graveyard.js";
export { buildBreakdown, formatCalibration, topSignals, summaryLine } from "./breakdown.js";
export { safeHttpUrl, hostOf } from "./safe-url.js";
export { proofSlotFor } from "./proof-slot.js";
export type { ProofLeg, Counterexample, SabotageResult, ProofState, ProofSlot } from "./proof-slot.js";
export type {
  UnknownReasonView,
  GraveRecord,
  Grave,
  GradeGroup,
  GraveyardView,
  SignalRow,
  CalibrationRow,
  BreakdownRow,
  Breakdown,
} from "./types.js";
