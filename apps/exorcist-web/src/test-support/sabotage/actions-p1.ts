// Sabotage_List for Property 1 (graveyard-ui-actions 4.2, design.md): deliberately wrong pages and wrong name
// functions that the property must catch. "Wrong name function" entries replace the oracle `nameOf`; "wrong page"
// entries rewrite what the page was observed to show or request.
import type { P1Mutation } from "../properties/p-actions-1.js";

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const isLate = (grade: string): boolean => grade === "ailing" || grade === "alive";

export interface P1Sabotage {
  name: string;
  /** A wrong name function (the page is then compared with a wrong oracle). */
  nameOf?: (actionName: string) => string;
  mutation?: P1Mutation;
}

export const P1_SABOTAGES: readonly P1Sabotage[] = [
  { name: "(a) proofFor passes the raw name (today's bug)", nameOf: (n) => n },
  {
    name: "(b) repoProofName used instead of actionProofName",
    nameOf: (n) => `${slug(n.includes("/") ? n.slice(n.indexOf("/") + 1) : n).slice(0, 54) || "repo"}-actions`,
  },
  { name: "(c) lower-cased slug without the hash", nameOf: (n) => slug(n).slice(0, 55) || "x" },
  {
    name: "(d) the right file but no request for ailing/alive",
    mutation: { observed: (o) => (isLate(o.grade) && o.has ? { ...o, text: null } : o) },
  },
  { name: "(e) two requests per name (key uses the raw name)", mutation: { urls: (urls) => urls.flatMap((u) => [u, u]) } },
  {
    name: "(f) a report is shown for a name not in the store (404 swallowed)",
    mutation: { observed: (o) => (o.has ? o : { ...o, text: "Proved" }) },
  },
];
