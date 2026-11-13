// DOM sabotages for Property 3 (toe-tag-redesign): pages that let report text become markup, style or links.
import { each } from "./toe.js";
import type { ToeSabotage } from "./toe.js";

export const TT3_SABOTAGES: readonly ToeSabotage[] = [
  {
    name: "render report text through a parsed fragment",
    mutate: (doc) =>
      each(doc, ".warnings li", (li) => li.replaceChildren(doc.createRange().createContextualFragment(li.textContent ?? ""))),
  },
  {
    name: "make call sites anchors",
    mutate: (doc) =>
      each(doc, "section.proof details.proof-sites li", (li) => {
        const a = doc.createElement("a");
        a.setAttribute("href", "https://example.com/");
        a.textContent = li.textContent;
        li.replaceChildren(a);
      }),
  },
  {
    name: "copy a report string into a style attribute",
    mutate: (doc) => each(doc, ".tomb-name", (n) => n.setAttribute("style", `x: ${n.textContent ?? ""}`)),
  },
  {
    name: "set href from the unsafe sourceUrl",
    mutate: (doc) => {
      const a = doc.createElement("a");
      a.setAttribute("href", "data:text/html,x");
      a.textContent = "source";
      doc.querySelector("table.breakdown td[data-label='Source']")?.append(a);
    },
  },
  {
    name: "copy the counterexample input into a data attribute",
    mutate: (doc, ctx) => {
      const input = ctx.proof?.attempts.find((a) => a.counterexample)?.counterexample?.input ?? "x";
      doc.querySelector("section.proof")?.setAttribute("data-content", input);
    },
  },
  {
    name: "add an onclick attribute built from a name",
    mutate: (doc) => each(doc, "button.tombstone", (t) => t.setAttribute(["on", "click"].join(""), t.getAttribute("data-key") ?? "")),
  },
];
