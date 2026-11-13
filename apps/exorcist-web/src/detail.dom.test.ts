// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { mountPage } from "./test-support/dom-harness.js";
import type { Page } from "./test-support/dom-harness.js";

const parseServer = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "parse-server.trim.json"), "utf8");
let page: Page | undefined;
afterEach(() => page?.destroy());

async function open(key: string): Promise<{ page: Page; panel: HTMLElement }> {
  page = mountPage({ route: "#/demo/parse-server", fetchRoutes: { "GET /api/demo/parse-server": { body: parseServer } } });
  await page.flush();
  const tomb = page.document.querySelector<HTMLElement>(`[data-key="${key}"]`);
  if (!tomb) throw new Error(`no tombstone ${key}`);
  page.click(tomb);
  const panel = page.dialogRoot.querySelector<HTMLElement>('[role="dialog"]');
  if (!panel || panel.hidden) throw new Error("panel not open");
  return { page, panel };
}

const pointsOf = (cell: Element): number => {
  const text = cell.querySelector(".num")?.textContent ?? "";
  return Number(text.replace("+", "").split("/")[0]?.trim());
};

describe("Detail_Panel breakdown (DOM)", () => {
  it("shows one signal row per part, one calibration row, and rows that add up to the score", async () => {
    const { panel } = await open("ldapjs");
    const signalRows = panel.querySelectorAll("table.breakdown > tbody:not(.calibration) > tr");
    expect(signalRows).toHaveLength(7);
    const calibration = panel.querySelectorAll("tbody.calibration tr");
    expect(calibration).toHaveLength(1);
    expect(calibration[0]?.querySelector("th")?.textContent).toContain("Declared abandoned: deprecated + repo archived, +3");

    const total = pointsOf(panel.querySelector("tfoot tr.total td[data-label='Total']") as Element);
    expect(total).toBe(75);
    const rows = [...signalRows, ...calibration].map((tr) => pointsOf(tr.querySelector("td[data-label='Points']") as Element));
    expect(rows.reduce((a, b) => a + b, 0)).toBe(total);
    expect(panel.textContent).toContain("75 / 100");
  });

  it("shows the calibration text with the reason and points for every calibrated dead package", async () => {
    const { panel } = await open("deep-diff");
    expect(panel.querySelector("tbody.calibration th")?.textContent).toContain(
      "Declared abandoned: deprecated + no publish for 98 months (threshold 24), +27",
    );
  });

  it("has no calibration row for a package without calibration", async () => {
    const { page: p, panel } = await open("cross-env");
    expect(panel.querySelectorAll("tbody.calibration")).toHaveLength(0);
    expect(panel.textContent).not.toContain("Declared abandoned:");
    expect(p.dialogRoot.querySelector("[role='dialog']")).toBe(panel);
  });
});
