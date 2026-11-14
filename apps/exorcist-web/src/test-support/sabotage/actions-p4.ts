// Sabotage_List for Property 4 (graveyard-ui-actions 4.3, design.md): wrong proof views the property must catch.
import type { AttemptViewK, P4Case, P4Mutation } from "../properties/p-actions-4.js";
import { CONTRACT_LINE, PIN_LINE, expectedCoverage } from "../properties/p-actions-4.js";

export interface P4Sabotage {
  name: string;
  mutation: P4Mutation;
}

const withKind = (a: AttemptViewK, c: P4Case, kind: "pin" | "contract"): AttemptViewK => {
  const lines = c.source.split("\n");
  const coverageText = c.shapes[0] ? expectedCoverage(c.shapes[0], kind) : undefined;
  return {
    ...a,
    kind,
    kindLine: kind === "pin" ? PIN_LINE : CONTRACT_LINE,
    ...(coverageText === undefined ? {} : { coverageText }),
    rewrite: { lines: lines.slice(0, 40), moreCount: Math.max(0, lines.length - 40) },
  };
};

const stripKind = (a: AttemptViewK): AttemptViewK => {
  const { kind: _k, kindLine: _l, coverageText: _c, rewrite: _r, ...rest } = a;
  return rest;
};

export const P4_SABOTAGES: readonly P4Sabotage[] = [
  {
    name: "(a) kind read from the candidate name prefix",
    mutation: {
      view: (a, c) => {
        const base = stripKind(a);
        if (c.candidateName.startsWith("pin-")) return withKind(base, c, "pin");
        if (c.candidateName.startsWith("swap-")) return withKind(base, c, "contract");
        return base;
      },
    },
  },
  { name: "(b) kindLine swapped", mutation: { view: (a) => ({ ...a, kindLine: a.kind === "pin" ? CONTRACT_LINE : a.kind === "contract" ? PIN_LINE : a.kindLine }) } },
  {
    name: "(c) coverage dropped",
    mutation: {
      view: (a) => {
        const { coverageText: _c, ...rest } = a;
        return rest;
      },
    },
  },
  {
    name: "(d) rewrite unbounded",
    mutation: { view: (a, c) => (a.rewrite ? { ...a, rewrite: { lines: c.source.split("\n"), moreCount: 0 } } : a) },
  },
  {
    name: "(e) rewrite inserted as markup (parsed, not set as text)",
    mutation: {
      rendered: (r, a) => {
        if (!a.rewrite) return r;
        // Parsing the text as HTML is what an HTML sink does; the page sources may not name such a sink (safety.test.ts).
        const parsed = new DOMParser().parseFromString(`<pre>${a.rewrite.lines.join("\n")}</pre>`, "text/html");
        return { text: r.text, elements: r.elements + parsed.querySelectorAll("pre *").length };
      },
    },
  },
  {
    name: "(f) new fields filled for npm attempts",
    mutation: { view: (a, c) => (a.kind === undefined ? withKind(a, c, "pin") : a) },
  },
];
