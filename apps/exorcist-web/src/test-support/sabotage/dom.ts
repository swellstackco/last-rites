// DOM sabotages (graveyard-ui-polish a-j). The production controller takes no injected views, so a "wrong
// implementation" is a transform of the real page DOM at a named stage, applied inside the property.

export type Stage = "tombstones" | "opened";
export type Mutate = (doc: Document, stage: Stage) => void;

export interface DomSabotage {
  name: string;
  mutate: Mutate;
}

const each = <T extends Element>(doc: Document, sel: string, f: (el: T) => void): void => {
  doc.querySelectorAll<T>(sel).forEach(f);
};

/** Sabotages the fix-checking property (Property 9). */
export const P9_SABOTAGES: readonly DomSabotage[] = [
  {
    name: "(a) tombstone keeps both tomb-label and tomb-grade",
    mutate: (doc, stage) => {
      if (stage !== "tombstones") return;
      each(doc, "button.tombstone", (t) => {
        const span = doc.createElement("span");
        span.className = "tomb-label chip";
        span.textContent = t.getAttribute("data-grade") ?? "";
        t.prepend(span);
      });
    },
  },
  {
    name: "(b) calibration source stays No source recorded",
    mutate: (doc, stage) => {
      if (stage !== "opened") return;
      each(doc, "tbody.calibration td[data-label='Source']", (td) => {
        td.textContent = "No source recorded";
      });
    },
  },
  {
    name: "(c) Total_Row keeps empty cells",
    mutate: (doc, stage) => {
      if (stage !== "opened") return;
      each(doc, "tfoot tr.total", (tr) => tr.append(doc.createElement("td")));
    },
  },
  {
    name: "(d) two tr.total rows",
    mutate: (doc, stage) => {
      if (stage !== "opened") return;
      each(doc, "tfoot tr.total", (tr) => tr.after(tr.cloneNode(true)));
    },
  },
  {
    name: "(e) wrong rule text",
    mutate: (doc, stage) => {
      if (stage !== "opened") return;
      each(doc, "tbody.calibration td[data-label='Source']", (td) => {
        td.textContent = "Engine rule: calibration";
      });
    },
  },
  {
    name: "(f) fix drops the focus call",
    mutate: (doc, stage) => {
      if (stage !== "opened") return;
      doc.querySelector<HTMLElement>("button.tombstone")?.focus();
    },
  },
];

/** Sabotages the preservation property (Property 10). */
export const P10_SABOTAGES: readonly DomSabotage[] = [
  {
    name: "(g1) fix drops one Breakdown row",
    mutate: (doc, stage) => {
      if (stage === "opened") doc.querySelector("table.breakdown tbody > tr")?.remove();
    },
  },
  {
    name: "(g2) fix prints points instead of points / weight",
    mutate: (doc, stage) => {
      if (stage !== "opened") return;
      each(doc, "table.breakdown td[data-label='Points'] .num", (n) => {
        n.textContent = (n.textContent ?? "").split(" / ")[0] ?? "";
      });
    },
  },
  {
    name: "(g3) fix upper-cases data-grade",
    mutate: (doc, stage) => {
      if (stage !== "opened") return;
      each(doc, "button.tombstone", (t) => t.setAttribute("data-grade", (t.getAttribute("data-grade") ?? "").toUpperCase()));
    },
  },
  {
    name: "(h) fix drops the calibration row",
    mutate: (doc, stage) => {
      if (stage === "opened") doc.querySelector("tbody.calibration")?.remove();
    },
  },
  {
    name: "(i) fix hides the alive tombstones",
    mutate: (doc, stage) => {
      if (stage === "opened") each(doc, "button.tombstone[data-grade='alive']", (t) => t.remove());
    },
  },
  {
    name: "(j) fix renders an a[href] for an unsafe URL",
    mutate: (doc, stage) => {
      if (stage !== "opened") return;
      const a = doc.createElement("a");
      a.setAttribute("href", "javascript:alert(1)");
      a.textContent = "source";
      doc.body.append(a);
    },
  },
];
