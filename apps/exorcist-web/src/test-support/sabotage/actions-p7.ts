// Sabotage_List for Property 7 (graveyard-ui-actions 4.3, design.md): wrong npm pages the property must catch.
// Each tampers with the mounted npm page the way the wrong implementation would render it.
import type { Page } from "../dom-harness.js";

export interface P7Sabotage {
  name: string;
  tamper: (page: Page) => void;
}

export const P7_SABOTAGES: readonly P7Sabotage[] = [
  {
    name: "(a) the label override applied to every ecosystem",
    tamper: (page) => {
      for (const th of Array.from(page.dialogRoot.querySelectorAll("table.breakdown tbody th"))) {
        if (th.textContent?.startsWith("Deprecated on npm")) th.textContent = th.textContent.replace("Deprecated on npm", "Deprecated");
      }
    },
  },
  {
    name: "(b) buildBreakdown default options change the output (a row is lost)",
    tamper: (page) => {
      page.dialogRoot.querySelector("table.breakdown tbody tr")?.remove();
    },
  },
  {
    name: "(c) the header note appended for npm reports",
    tamper: (page) => {
      const header = page.document.querySelector("header.header");
      if (!header) return;
      const p = page.document.createElement("p");
      p.className = "note";
      p.textContent = "Refs come from workflow uses: lines.";
      header.appendChild(p);
    },
  },
];
