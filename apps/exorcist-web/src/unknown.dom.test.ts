// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { serializeReport } from "@last-rites/exorcist-npm/report";
import { buildReport } from "./test-support/build-report.js";
import { mountPage } from "./test-support/dom-harness.js";
import type { Page } from "./test-support/dom-harness.js";
import { ALIVE_SIGNALS, ALL_UNKNOWN_SIGNALS } from "./test-support/signals.js";

let page: Page | undefined;
afterEach(() => page?.destroy());

const report = buildReport(
  [
    {
      name: "mystery",
      signals: ALL_UNKNOWN_SIGNALS,
      unknownReasons: {
        deprecated: { source: "npm", category: "not_found", message: "registry returned 404" },
        repoArchived: { source: "github", category: "rate_limited", message: "API rate limit exceeded" },
      },
    },
    { name: "fine", signals: ALIVE_SIGNALS },
  ],
);

async function openMystery(): Promise<HTMLElement> {
  page = mountPage({
    route: "#/demo/pump",
    fetchRoutes: { "GET /api/demo/pump": { body: serializeReport(report) } },
  });
  await page.flush();
  page.click(page.document.querySelector<HTMLElement>('[data-key="mystery"]') as HTMLElement);
  return page.dialogRoot.querySelector<HTMLElement>('[role="dialog"]') as HTMLElement;
}

describe("Unknown_Row (DOM)", () => {
  it("shows Unknown, source, category, message and the explanation, or 'No reason recorded'", async () => {
    const panel = await openMystery();
    const rows = Array.from(panel.querySelectorAll<HTMLElement>("tr[data-status='unknown']"));
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(row.textContent).toContain("Unknown");
      expect(row.textContent).toContain("scored as partly dead, never as alive");
    }
    const deprecated = rows[0] as HTMLElement;
    expect(deprecated.textContent).toContain("source npm");
    expect(deprecated.textContent).toContain("not found");
    expect(deprecated.textContent).toContain("registry returned 404");
    expect(rows[1]?.textContent).toContain("source github");
    expect(rows[1]?.textContent).toContain("rate limited");
    expect(rows[1]?.textContent).toContain("API rate limit exceeded");
    expect(rows[2]?.textContent).toContain("No reason recorded");
  });

  it("counts the points of unknown rows in the sum", async () => {
    const panel = await openMystery();
    const dep = report.dependencies[0] as (typeof report.dependencies)[number];
    const rowPoints = Array.from(panel.querySelectorAll("table.breakdown > tbody > tr td[data-label='Points'] .num")).map(
      (el) => Number((el.textContent ?? "").split("/")[0]?.trim()),
    );
    const total = rowPoints.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBe(dep.death.score);
    expect(panel.querySelector("tfoot .total")?.textContent).toContain(`${dep.death.score} / 100`);
  });

  it("shows the 'n unknown' badge on the tombstone, and none on a fully known package", async () => {
    await openMystery();
    const mystery = page?.document.querySelector('[data-key="mystery"] .tomb-badge');
    expect(mystery?.textContent).toBe("7 unknown");
    expect(mystery?.getAttribute("aria-label")).toBe("7 unknown signals");
    // The alive group is collapsed, so the known package has no tombstone yet and thus no badge.
    expect(page?.document.querySelector('[data-key="fine"]')).toBeNull();
  });
});
