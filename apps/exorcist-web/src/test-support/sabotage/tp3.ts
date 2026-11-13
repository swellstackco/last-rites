// DOM sabotages for TP3 (toe-tag-polish T5): wrong home pages. Each edits the real page after the snapshots were
// answered (phase "final") or after the user left the picker (phase "left").
import { each } from "./toe.js";
import type { ToeSabotage } from "./toe.js";

const card = (doc: Document, index: number): Element | null => doc.querySelectorAll("button.demo-card")[index] ?? null;

export const TP3_SABOTAGES: readonly ToeSabotage[] = [
  {
    name: "(j) the home page keeps the p.meta eyebrow",
    mutate: (doc, ctx) => {
      if (ctx.phase !== "final") return;
      const p = doc.createElement("p");
      p.className = "meta";
      p.textContent = "The Graveyard";
      doc.querySelector("header.header")?.prepend(p);
    },
  },
  {
    name: '(k) a second "Last Rites" p is added next to the h1',
    mutate: (doc, ctx) => {
      if (ctx.phase !== "final") return;
      const p = doc.createElement("p");
      p.className = "wordmark";
      p.textContent = "Last Rites";
      doc.querySelector("div.masthead")?.prepend(p);
    },
  },
  {
    name: "(l) the Pitch_Line is the old sentence",
    mutate: (doc, ctx) => {
      if (ctx.phase !== "final") return;
      each(doc, "p.pitch", (p) => (p.textContent = "Find the dead packages in a codebase, and see exactly why each one scores the way it does."));
    },
  },
  {
    name: "(m) a Demo_Card has no .tag-hole",
    mutate: (doc, ctx) => {
      if (ctx.phase !== "final") return;
      card(doc, 1)?.querySelector(".tag-hole")?.remove();
    },
  },
  {
    name: "(n) the count is read wrong (one too many, as if dying counted as dead)",
    mutate: (doc, ctx) => {
      if (ctx.phase !== "final") return;
      each(doc, ".demo-dead", (el) => (el.textContent = `${Number.parseInt(el.textContent ?? "0", 10) + 1} dead`));
    },
  },
  {
    name: "(o) a failed or unreadable snapshot shows 0 dead",
    mutate: (doc, ctx) => {
      if (ctx.phase !== "final") return;
      (ctx.snapshots ?? []).forEach((kind, i) => {
        const c = card(doc, i);
        if (kind === "ok" || !c) return;
        const span = doc.createElement("span");
        span.className = "demo-dead";
        span.textContent = "0 dead";
        c.append(span);
      });
    },
  },
  {
    name: "(p) the picker still paints counts after the user left it",
    mutate: (doc, ctx) => {
      if (ctx.phase !== "left") return;
      const span = doc.createElement("span");
      span.className = "demo-dead";
      span.textContent = "3 dead";
      doc.body.append(span);
    },
  },
];
