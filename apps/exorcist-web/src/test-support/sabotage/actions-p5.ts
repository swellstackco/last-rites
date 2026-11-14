// Sabotage_List for Property 5 (graveyard-ui-actions 4.3, design.md): wrong header notes the property must catch.
import type { P5Mutation } from "../properties/p-actions-5.js";
import { ACTIONS_NOTE, NPM_SENTENCE } from "../properties/p-actions-5.js";

export interface P5Sabotage {
  name: string;
  mutate: P5Mutation;
}

export const P5_SABOTAGES: readonly P5Sabotage[] = [
  { name: "(a) always the npm sentence", mutate: () => [NPM_SENTENCE] },
  { name: "(b) never a note", mutate: () => [] },
  {
    name: "(c) note when dependencies are empty",
    mutate: (notes, { c, dependencies }) => (dependencies === 0 ? [c.ecosystem === "github-actions" ? ACTIONS_NOTE : NPM_SENTENCE] : notes),
  },
  {
    name: "(d) note when only some versionSources are range",
    mutate: (notes, { c, dependencies, someRange }) =>
      dependencies > 0 && someRange ? [c.ecosystem === "github-actions" ? ACTIONS_NOTE : NPM_SENTENCE] : notes,
  },
  {
    name: "(e) npm sentence changed by one character",
    mutate: (notes, { c }) => (c.ecosystem === "github-actions" ? notes : notes.map((n) => (n === NPM_SENTENCE ? n.slice(0, -1) : n))),
  },
];
