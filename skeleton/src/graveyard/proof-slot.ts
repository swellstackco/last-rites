import type { Grave, GraveRecord } from "./types.js";

// Shape for the later proof spec. It follows proof-rules.md (counterexample and seed are
// shown; a sabotage check is required) and migration-rules.md (done means old green,
// new green, sabotage caught). Only `coming_soon` is produced in this version.

export interface ProofLeg {
  target: "old" | "new";
  package: string;
  version?: string;
  result: "green" | "red" | "not_run";
  /** 200 for pin tests (proof-rules.md). */
  numRuns: number;
  seed: number;
}

export interface Counterexample {
  seed: number;
  shrunk: string;
  path?: string;
}

export interface SabotageResult {
  caught: boolean;
  name?: string;
}

export type ProofState =
  | { status: "coming_soon" }
  | { status: "no_call_sites" }
  | { status: "running"; step: "old" | "new" | "sabotage" }
  | { status: "failed"; leg: ProofLeg; counterexample: Counterexample }
  | { status: "verified"; old: ProofLeg; new: ProofLeg; sabotage: SabotageResult };

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
