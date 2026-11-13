// DOM sabotages for TP1 (toe-tag-polish, T1). Each emulates the page a wrong implementation would produce.
// The property passes a context with the grade, the arrival order, the phase and the recorded fetch calls.
import { COPY } from "../../constants.js";
import type { ToeContext, ToeSabotage } from "./toe.js";

const isLate = (ctx: ToeContext): boolean => ctx.grade === "ailing" || ctx.grade === "alive";
const section = (doc: Document): HTMLElement | null => doc.querySelector<HTMLElement>("section.proof");

function addSection(doc: Document, text: string): void {
  const el = doc.createElement("section");
  el.className = "proof";
  const p = doc.createElement("p");
  p.textContent = text;
  el.append(p);
  doc.querySelector(".sheet")?.append(el);
}

export const TP1_SABOTAGES: readonly ToeSabotage[] = [
  {
    name: "(a) the controller still gates the request on dead/dying",
    mutate: (doc, ctx) => {
      if (!isLate(ctx) || !ctx.calls) return;
      section(doc)?.remove();
      for (let i = ctx.calls.length - 1; i >= 0; i--) if (ctx.calls[i]!.url.includes("/demo/proofs/")) ctx.calls.splice(i, 1);
    },
  },
  {
    name: "(b) updateProof ignores a missing section (report arrives after the panel opened)",
    mutate: (doc, ctx) => {
      if (isLate(ctx) && ctx.order === "after" && ctx.phase === "final") section(doc)?.remove();
    },
  },
  {
    name: "(c) renderContent ignores the proof for ailing/alive (report arrived before the panel opened)",
    mutate: (doc, ctx) => {
      if (isLate(ctx) && ctx.order === "before" && ctx.phase === "final") section(doc)?.remove();
    },
  },
  {
    name: "(d) the placeholder is shown for an ailing/alive package without a report",
    mutate: (doc, ctx) => {
      if (isLate(ctx) && ctx.phase === "final" && ctx.proofCase !== "report") addSection(doc, COPY.exorcismComing);
    },
  },
  {
    name: "(e) a loading section is shown for ailing/alive while the request is pending",
    mutate: (doc, ctx) => {
      if (isLate(ctx) && ctx.phase === "pending") addSection(doc, COPY.proofLoading);
    },
  },
];

export const TP1_LIVE_SABOTAGES: readonly ToeSabotage[] = [
  {
    name: "(f) the proof is requested for a live source",
    mutate: (_doc, ctx) => {
      ctx.calls?.push({ method: "GET", url: "/demo/proofs/live/x.json", headers: {}, body: undefined, credentials: "omit" });
    },
  },
];
