// FROZEN, test-only, never import from production code or main.ts.
// The key logic of `proofFor` in src/app/controller.ts as it was at fe6340b (2026-11-14, before graveyard-ui-actions):
// the request path of a demo dependency, or undefined when no request is made.
import { isProofName } from "@last-rites/skeleton/proof";

/** "demo/proofs/<demo>/<name>.json" without the host, or undefined (the name itself must be a Proof_Name). */
export function referenceProofPath(demo: string, name: string): string | undefined {
  if (!isProofName(demo) || !isProofName(name)) return undefined;
  return `/demo/proofs/${demo}/${name}.json`;
}
