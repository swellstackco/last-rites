// DOM sabotages for TP2 (toe-tag-polish T4): wrong subtitles.
import { each } from "./toe.js";
import type { ToeSabotage } from "./toe.js";

const rebuild = (doc: Document, parts: readonly string[]): void =>
  each(doc, "p.form-subtitle", (p) => {
    p.replaceChildren(
      ...parts.flatMap((t, i) => {
        const span = doc.createElement("span");
        span.className = "subtitle-phrase";
        span.textContent = t;
        return i === 0 ? [span] : [doc.createTextNode(" "), span];
      }),
    );
  });

export const TP2_SABOTAGES: readonly ToeSabotage[] = [
  {
    name: "(g) the subtitle is one text node",
    mutate: (doc) => each(doc, "p.form-subtitle", (p) => p.replaceChildren(doc.createTextNode(p.textContent ?? ""))),
  },
  {
    name: '(h) "Form LR-1" is split across two phrase spans',
    mutate: (doc) => rebuild(doc, ["Office of the Dependency Examiner · Form", "LR-1"]),
  },
  {
    name: '(i) the subtitle text changes ("Form LR1")',
    mutate: (doc) => rebuild(doc, ["Office of the Dependency Examiner ·", "Form LR1"]),
  },
];
