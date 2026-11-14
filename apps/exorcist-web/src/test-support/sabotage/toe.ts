// Shared types for the Toe Tag DOM sabotages (toe-tag-redesign tt1 to tt3). A sabotage is a "wrong page":
// a transform of the real page DOM applied inside the property after the package is opened.
import type { ScanReport } from "@last-rites/exorcist-npm/report";
import type { RecordedCall } from "../fake-fetch.js";
import type { ProofReport } from "@last-rites/skeleton/proof";

export interface ToeContext {
  report?: ScanReport;
  /** The name of the opened package. */
  openName?: string;
  /** The Proof_Report served for the open package, when there is one. */
  proof?: ProofReport;
  /** The proof state served: report, absent, failed or invalid. */
  proofCase?: string;
  /** TP1: `pending` while the proof request is held, `final` once it settled. */
  phase?: "pending" | "final" | "left";
  /** TP1: the grade of the opened package and the arrival order. */
  grade?: string;
  order?: "before" | "after";
  /** TP3: the kind of each demo snapshot (DEMO_REPOS order): ok, failed or invalid. */
  snapshots?: Array<"ok" | "failed" | "invalid">;
  /** TP1: the recorded fetch calls (a sabotage may edit them to emulate a wrong request policy). */
  calls?: RecordedCall[];
}

export type ToeMutate = (doc: Document, ctx: ToeContext) => void;

export interface ToeSabotage {
  name: string;
  mutate: ToeMutate;
}

export const each = <T extends Element = HTMLElement>(doc: Document | Element, sel: string, f: (el: T) => void): void => {
  doc.querySelectorAll<T>(sel).forEach(f);
};
