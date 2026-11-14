// Sabotage_List for Property 3 (graveyard-ui-actions 4.2, design.md): wrong npm proof paths the property must catch.
import { actionProofName, isProofName } from "@last-rites/skeleton/proof";
import type { P3Mutation } from "../properties/p-actions-3.js";

export interface P3Sabotage {
  name: string;
  mutate: P3Mutation;
}

export const P3_SABOTAGES: readonly P3Sabotage[] = [
  {
    name: "(a) proofNameFor for npm returns actionProofName(n)",
    mutate: (urls) => urls.map((u) => u.replace(/\/([^/]+)\.json$/, (_m, n: string) => `/${actionProofName(n)}.json`)),
  },
  {
    name: "(b) accepts names the pattern rejects (scoped names get a request)",
    mutate: (urls, names) => [...urls, ...names.filter((n) => !isProofName(n)).slice(0, 1).map((n) => `/demo/proofs/pump/${n}.json`)],
  },
];
