// @vitest-environment jsdom
// toe-tag-polish 3.1: the Toe_Tag DOM the T2/T3 fix relies on (no DOM change is made by the fix; this must pass before and after).
import { afterEach, describe, expect, it } from "vitest";
import { GRADE_INFO } from "@last-rites/skeleton/graveyard";
import { serializeReport } from "@last-rites/exorcist-npm/report";
import { TAG_LABELS } from "./constants.js";
import { buildReport } from "./test-support/build-report.js";
import { mountPage } from "./test-support/dom-harness.js";
import type { Page } from "./test-support/dom-harness.js";
import { gradeLabels } from "./test-support/properties/p9.js";
import { ALIVE_SIGNALS, AILING_SIGNALS, DEAD_SIGNALS, DYING_SIGNALS } from "./test-support/signals.js";

let page: Page | undefined;
afterEach(() => page?.destroy());

const KEYS = ["d", "y", "a", "v"] as const;

async function mountAll(): Promise<Page> {
  const report = buildReport([
    { name: "d", signals: DEAD_SIGNALS },
    { name: "y", signals: DYING_SIGNALS },
    { name: "a", signals: AILING_SIGNALS },
    { name: "v", signals: ALIVE_SIGNALS },
  ]);
  page = mountPage({ route: "#/demo/x", fetchRoutes: { "GET /api/demo/x": { body: serializeReport(report) } } });
  await page.flush();
  page.document.querySelector<HTMLElement>("button.disclosure[aria-controls='alive-list']")?.click();
  return page;
}

const tag = (p: Page, key: string): HTMLElement => p.document.querySelector<HTMLElement>(`button.tombstone[data-key="${key}"]`) as HTMLElement;

describe("toe-tag-polish Toe_Tag DOM", () => {
  describe("T2 band", () => {
    it("the Band is the last visible block with two children: grade word first, then badge or range", async () => {
      const p = await mountAll();
      for (const key of KEYS) {
        const t = tag(p, key);
        const visible = Array.from(t.children).filter((c) => !c.classList.contains("visually-hidden"));
        const band = visible.at(-1) as HTMLElement;
        expect(band.className).toBe("tag-band");
        expect(Array.from(band.children).map((c) => c.className)).toEqual(["tomb-grade", "tag-range"]);
        const grade = t.getAttribute("data-grade") as "dead";
        expect(band.children[0]?.textContent).toBe(GRADE_INFO[grade].label);
        expect(gradeLabels(t, GRADE_INFO[grade].label)).toHaveLength(1);
      }
    });
  });

  describe("T3 fields", () => {
    it("three Tag_Fields in order PACKAGE, SCORE, CAUSE", async () => {
      const p = await mountAll();
      for (const key of KEYS) {
        const fields = Array.from(tag(p, key).querySelectorAll(":scope > .tag-field"));
        expect(fields.map((f) => f.className)).toEqual(["tag-field tag-package", "tag-field tag-score", "tag-field tag-cause"]);
        expect(fields.map((f) => f.querySelector(".tag-label")?.textContent)).toEqual([TAG_LABELS.package, TAG_LABELS.score, TAG_LABELS.cause]);
      }
    });
  });
});
