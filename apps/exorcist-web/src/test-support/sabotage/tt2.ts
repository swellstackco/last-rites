// DOM sabotages for Property 2 (toe-tag-redesign): wrong Proof sections.
import { buildProofView } from "@graveyard-kit/skeleton/graveyard";
import type { ToeSabotage } from "./toe.js";

const topLines = (doc: Document): HTMLElement[] =>
  Array.from(doc.querySelectorAll<HTMLElement>("section.proof p")).filter(
    (p) => !p.closest("ol.proof-attempts") && !p.closest("details.proof-sites"),
  );
const pres = (doc: Document): HTMLElement[] => Array.from(doc.querySelectorAll<HTMLElement>("section.proof pre.proof-pre"));
const label = (pre: Element): string => (pre.previousElementSibling?.textContent ?? "").trim();

export const TT2_SABOTAGES: readonly ToeSabotage[] = [
  {
    name: "swap old and new output",
    mutate: (doc) => {
      const all = pres(doc);
      for (const o of all.filter((p) => label(p) === "Old output")) {
        const n = o.closest("li") && Array.from(o.closest("li")!.querySelectorAll("pre.proof-pre")).find((p) => label(p) === "New output");
        if (n) {
          const t = o.textContent;
          o.textContent = n.textContent;
          n.textContent = t;
        }
      }
    },
  },
  { name: "drop the shrunk input", mutate: (doc) => pres(doc).filter((p) => label(p) === "Shrunk input").forEach((p) => p.remove()) },
  {
    name: "render only the first attempt",
    mutate: (doc) => Array.from(doc.querySelectorAll("section.proof ol.proof-attempts > li")).slice(1).forEach((li) => li.remove()),
  },
  {
    name: "truncate call sites at 20 without the more line",
    mutate: (doc) => Array.from(doc.querySelectorAll("section.proof details.proof-sites li")).slice(20).forEach((li) => li.remove()),
  },
  {
    name: "omit the seed",
    mutate: (doc) =>
      topLines(doc).forEach((p) => {
        const t = p.textContent ?? "";
        const i = t.lastIndexOf(", ");
        if (i > 0 && /seed/i.test(t.slice(i))) p.textContent = t.slice(0, i);
      }),
  },
  { name: "omit the sabotage line", mutate: (doc) => topLines(doc)[2]?.remove() },
  { name: "hide the recommendation", mutate: (doc) => topLines(doc)[3]?.remove() },
  { name: "trim whitespace of outputs", mutate: (doc) => pres(doc).forEach((p) => (p.textContent = (p.textContent ?? "").trim())) },
  {
    name: "show proved for a weak report",
    mutate: (doc, ctx) => {
      if (!ctx.proof || buildProofView(ctx.proof).badge !== "weak") return;
      const b = Array.from(doc.querySelectorAll<HTMLElement>("section.proof .proof-badge")).find((x) => !x.closest("ol.proof-attempts"));
      if (b) b.textContent = "Proved";
    },
  },
  {
    name: "drop the unreadable line for invalid",
    mutate: (doc, ctx) => {
      if (ctx.proofCase === "invalid") topLines(doc).pop()?.remove();
    },
  },
];
