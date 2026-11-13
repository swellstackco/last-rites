// Shared types for the Toe Tag DOM sabotages (toe-tag-redesign tt1 to tt3). A sabotage is a "wrong page":
// a transform of the real page DOM applied inside the property after the package is opened.
import type { ScanReport } from "@graveyard-kit/exorcist-npm/report";
import type { ProofReport } from "@graveyard-kit/skeleton/proof";

export interface ToeContext {
  report?: ScanReport;
  /** The name of the opened package. */
  openName?: string;
  /** The Proof_Report served for the open package, when there is one. */
  proof?: ProofReport;
  /** The proof state served: report, absent, failed or invalid. */
  proofCase?: string;
}

export type ToeMutate = (doc: Document, ctx: ToeContext) => void;

export interface ToeSabotage {
  name: string;
  mutate: ToeMutate;
}

export const each = <T extends Element = HTMLElement>(doc: Document | Element, sel: string, f: (el: T) => void): void => {
  doc.querySelectorAll<T>(sel).forEach(f);
};
