// @vitest-environment jsdom
// toe-tag-polish Property TP3 (T5): the home Masthead, hanging Demo_Cards and dead counts. No network.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseReport } from "@last-rites/exorcist-npm/report";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import { mountPage } from "./test-support/dom-harness.js";
import { DEMO_REPOS } from "./model/demo-repos.js";
import { assertHomeStructure, build as tp3, deadCount } from "./test-support/properties/tp3.js";

const demoDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "demo");

describe("TP3: home Masthead, hanging Demo_Cards and dead counts", () => {
  it("masthead, pitch, hanging cards and counts hold for every snapshot outcome and response order", async () => {
    const report = await checkAsyncProperty("TP3: home", tp3());
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, 240_000);

  it("real data: each card shows the dead count recomputed from demo/<name>.json", async () => {
    const texts = DEMO_REPOS.map((d) => readFileSync(join(demoDir, `${d.name}.json`), "utf8"));
    const routes = Object.fromEntries(DEMO_REPOS.map((d, i) => [`GET /api/demo/${d.name}`, { body: texts[i]! }]));
    const page = mountPage({ route: "", fetchRoutes: routes });
    try {
      await page.flush();
      assertHomeStructure(page);
      for (const [i, d] of DEMO_REPOS.entries()) {
        const parsed = parseReport(texts[i]!);
        if (!parsed.ok) throw new Error(`${d.name}.json does not parse`);
        const card = page.document.querySelector(`button.demo-card[data-demo='${d.name}']`)!;
        expect(card.querySelector(":scope > .demo-dead")?.textContent).toBe(`${deadCount(parsed.report)} dead`);
      }
    } finally {
      page.destroy();
    }
  });

  it("clicking a hanging card still opens its demo", async () => {
    const page = mountPage({ route: "" });
    try {
      await page.flush();
      page.click(page.document.querySelector<HTMLElement>("button.demo-card[data-demo='pump']")!);
      expect(page.hash()).toBe("#/demo/pump");
    } finally {
      page.destroy();
    }
  });
});
