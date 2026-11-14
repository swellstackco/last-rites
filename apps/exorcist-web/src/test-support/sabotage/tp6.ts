// DOM sabotages for TP6 (toe-tag-polish): a fix that drops or changes a fact the polish must not touch.
import { toGrade } from "@last-rites/skeleton";
import { GRADE_INFO } from "@last-rites/skeleton/graveyard";
import { each } from "./toe.js";
import type { ToeSabotage } from "./toe.js";

export const TP6_SABOTAGES: readonly ToeSabotage[] = [
  { name: "(u) drop a Breakdown row", mutate: (doc) => doc.querySelector("table.breakdown tbody > tr")?.remove() },
  {
    name: "(u) change the cause text of a tag",
    mutate: (doc) => each(doc, "button.tombstone .tomb-summary", (el) => (el.textContent = `${el.textContent ?? ""}!`)),
  },
  {
    name: "(u) show toGrade(score) instead of death.grade on the Band",
    mutate: (doc) =>
      each(doc, "button.tombstone", (t) => {
        const score = Number(t.querySelector(".tomb-score > span:not(.visually-hidden)")?.textContent);
        const word = t.querySelector(".tomb-grade");
        if (word && !Number.isNaN(score)) word.textContent = GRADE_INFO[toGrade(score)].label;
      }),
  },
  {
    name: "(u) change a demo card blurb or a form hint",
    mutate: (doc) => {
      each(doc, "button.demo-card > span:nth-of-type(3)", (el) => (el.textContent = "changed"));
      each(doc, "form.live-form p.muted", (el) => (el.textContent = "changed"));
    },
  },
  {
    name: "(u) change the proof text of the open panel",
    mutate: (doc) => each(doc, "section.proof p", (el) => (el.textContent = `${el.textContent ?? ""}.`)),
  },
];
