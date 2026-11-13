// Runner entry of the proof harness. Imports fast-check; the page must use "../index.js" (pure) only.
export { runProof } from "./run-proof.js";
export { BUILT_IN_MUTATORS, applicableMutators } from "./mutators.js";
export { structuralEqual } from "./equal.js";
export { deepClone } from "./clone.js";
export type * from "./types.js";
