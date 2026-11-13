// @vitest-environment jsdom
// graveyard-ui-polish 6.2: example tests for the fixed markup. No network (fake fetch, fixtures).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { serializeReport } from "@graveyard-kit/exorcist-npm/report";
import { buildReport } from "./test-support/build-report.js";
import { mountPage } from "./test-support/dom-harness.js";
import type { Page } from "./test-support/dom-harness.js";
import { ALIVE_SIGNALS, DYING_SIGNALS } from "./test-support/signals.js";
import { gradeLabels } from "./test-support/properties/p9.js";
import { GRADE_INFO } from "@graveyard-kit/skeleton/graveyard";

const parseServer = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "parse-server.trim.json"), "utf8");
let page: Page | undefined;
afterEach(() => page?.destroy());

async function mount(body: string): Promise<Page> {
  page = mountPage({ route: "#/demo/x", fetchRoutes: { "GET /api/demo/x": { body } } });
  await page.flush();
  page.document.querySelector<HTMLElement>("button.disclosure[aria-controls='alive-list']")?.click();
  return page;
}

function openFirst(p: Page, key?: string): HTMLElement {
  const tomb = key ? p.document.querySelector<HTMLElement>(`[data-key="${key}"]`) : p.document.querySelector<HTMLElement>("button.tombstone");
  if (!tomb) throw new Error("no tombstone");
  p.click(tomb);
  const panel = p.dialogRoot.querySelector<HTMLElement>('[role="dialog"]');
  if (!panel || panel.hidden) throw new Error("panel not open");
  return panel;
}

describe("graveyard-ui-polish examples", () => {
  it("ldapjs: calibration +3, Engine rule text, one clean Total_Row 75 / 100, one grade label", async () => {
    const p = await mount(parseServer);
    const tomb = p.document.querySelector<HTMLElement>('[data-key="ldapjs"]') as HTMLElement;
    expect(gradeLabels(tomb, GRADE_INFO.dead.label)).toHaveLength(1);
    const panel = openFirst(p, "ldapjs");
    expect(panel.querySelector("tbody.calibration td[data-label='Points']")?.textContent).toContain("+3");
    expect(panel.querySelector("tbody.calibration td[data-label='Source']")?.textContent).toBe("Engine rule: declared_abandoned");
    const totals = panel.querySelectorAll("tfoot tr.total");
    expect(totals).toHaveLength(1);
    expect(Array.from(totals[0]!.querySelectorAll("td, th")).every((c) => (c.textContent ?? "").trim() !== "")).toBe(true);
    expect(totals[0]?.textContent).toContain("75 / 100");
  });

  it("a package without calibration has no calibration body and still one Total_Row", async () => {
    const p = await mount(parseServer);
    const panel = openFirst(p, "cross-env");
    expect(panel.querySelectorAll("tbody.calibration")).toHaveLength(0);
    expect(panel.querySelectorAll("tfoot tr.total")).toHaveLength(1);
  });

  it("a 47-character scoped name renders once, as text, with one grade label", async () => {
    const long = `@${"s".repeat(20)}/${"p".repeat(25)}`;
    expect(long).toHaveLength(47);
    const p = await mount(serializeReport(buildReport([{ name: long, signals: DYING_SIGNALS }])));
    const tomb = p.document.querySelector<HTMLElement>("button.tombstone") as HTMLElement;
    expect(tomb.getAttribute("aria-label")).toContain(long);
    expect(gradeLabels(tomb, GRADE_INFO[tomb.getAttribute("data-grade") as "dead"].label)).toHaveLength(1);
    expect(openFirst(p).querySelectorAll("tfoot tr.total")).toHaveLength(1);
  });

  it("duplicate names render one tombstone each, each with one grade label", async () => {
    const p = await mount(serializeReport(buildReport([
      { name: "twin", signals: DYING_SIGNALS },
      { name: "twin", signals: ALIVE_SIGNALS },
    ])));
    const tombs = Array.from(p.document.querySelectorAll<HTMLElement>("button.tombstone"));
    expect(tombs).toHaveLength(2);
    for (const t of tombs) expect(gradeLabels(t, GRADE_INFO[t.getAttribute("data-grade") as "dead"].label)).toHaveLength(1);
  });

  it("a hostile name is written as text only", async () => {
    const hostile = "<img src=x onerror=alert(1)>";
    const p = await mount(serializeReport(buildReport([{ name: hostile, signals: DYING_SIGNALS }])));
    openFirst(p);
    expect(p.document.querySelector("img")).toBeNull();
    expect(p.document.body.textContent).toContain(hostile);
  });
});
