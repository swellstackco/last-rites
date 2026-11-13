import type { ProofView } from "./proof-view.js";
import type { Grave, GraveRecord } from "./types.js";

// The proof state of one detail panel (proof-harness Requirement 12.1). `report` carries the pure
// view model built from a Proof_Report; the page only renders it.
export type ProofState =
  | { status: "coming_soon" }
  | { status: "loading" }
  | { status: "report"; view: ProofView };

export interface ProofSlot {
  package: string;
  state: ProofState;
}

/** Dead and dying graves get a slot; ailing and alive do not. */
export function proofSlotFor<T extends GraveRecord>(g: Grave<T>): ProofSlot | undefined {
  const grade = g.record.death.grade;
  if (grade === "dead" || grade === "dying") {
    return { package: g.record.name, state: { status: "coming_soon" } };
  }
  return undefined;
}
