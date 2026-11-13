// DOM sabotages for Property 1 (toe-tag-redesign): each is a "wrong page" applied after the package is opened.
import { toGrade } from "@graveyard-kit/skeleton";
import { GRADE_INFO } from "@graveyard-kit/skeleton/graveyard";
import { each } from "./toe.js";
import type { ToeSabotage } from "./toe.js";

const tags = (doc: Document): HTMLElement[] => Array.from(doc.querySelectorAll<HTMLElement>("button.tombstone"));
const scoreSpan = (t: Element): HTMLElement | null => t.querySelector<HTMLElement>(".tomb-score > span:not(.visually-hidden)");

export const TT1_SABOTAGES: readonly ToeSabotage[] = [
  {
    name: "drop the last tombstone of a group",
    mutate: (doc) => {
      for (const g of Array.from(doc.querySelectorAll("section.group"))) {
        const all = g.querySelectorAll("button.tombstone");
        const last = all[all.length - 1];
        if (last) {
          (last.closest("li") ?? last).remove();
          return;
        }
      }
    },
  },
  {
    name: "swap the score text of two tags",
    mutate: (doc) => {
      const spans = tags(doc).map(scoreSpan).filter((s): s is HTMLElement => s !== null);
      for (const a of spans) {
        const b = spans.find((s) => s.textContent !== a.textContent);
        if (b) {
          const t = a.textContent;
          a.textContent = b.textContent;
          b.textContent = t;
          return;
        }
      }
    },
  },
  {
    name: "show toGrade(score) instead of death.grade on the Band",
    mutate: (doc, ctx) => {
      for (const t of tags(doc)) {
        const dep = ctx.report?.dependencies.find((d) => d.name === t.getAttribute("data-key"));
        const band = t.querySelector(".tomb-grade");
        if (dep && band) band.textContent = GRADE_INFO[toGrade(dep.death.score)].label;
      }
    },
  },
  { name: "omit the Calibration_Row", mutate: (doc) => each(doc, "tbody.calibration", (e) => e.remove()) },
  {
    name: "show the weight where points belong",
    mutate: (doc) =>
      each(doc, "tbody:not(.calibration) td[data-label='Points'] .num", (n) => {
        const t = n.textContent ?? "";
        n.textContent = t.split(" / ")[1] ?? `${t}!`;
      }),
  },
  { name: "hide the n unknown badge", mutate: (doc) => each(doc, ".tomb-badge", (e) => e.remove()) },
  { name: "cut every name to 20 characters", mutate: (doc) => each(doc, ".tomb-name", (e) => (e.textContent = (e.textContent ?? "").slice(0, 20))) },
  {
    name: "reverse the order of the dead group",
    mutate: (doc) => {
      const ul = doc.querySelector("section#group-dead ul");
      if (ul) for (const c of Array.from(ul.children).reverse()) ul.append(c);
    },
  },
  {
    name: "take header counts from report.summary",
    mutate: (doc, ctx) => {
      const s = ctx.report?.summary;
      if (!s) return;
      each(doc, "header.header ul.counts button[data-grade]", (b) => {
        const n = b.querySelector(".num");
        const g = b.getAttribute("data-grade") as "dead" | "dying" | "ailing" | "alive";
        if (n) n.textContent = String(s[g]);
      });
    },
  },
  { name: "replace the cause text with the package name", mutate: (doc) => each(doc, ".tomb-summary", (e) => (e.textContent = e.closest("button")?.getAttribute("data-key") ?? "")) },
  {
    name: "write the open package's total as score / 10",
    mutate: (doc) =>
      each(doc, "table.breakdown tfoot tr.total td[data-label='Total'] .num", (n) => {
        n.textContent = (n.textContent ?? "").replace(/ \/ 100$/, " / 10");
      }),
  },
];
