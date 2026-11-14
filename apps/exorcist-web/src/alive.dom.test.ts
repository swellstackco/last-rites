// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { serializeReport } from "@last-rites/exorcist-npm/report";
import { buildReport } from "./test-support/build-report.js";
import { mountPage } from "./test-support/dom-harness.js";
import type { Page } from "./test-support/dom-harness.js";
import { ALIVE_SIGNALS, DYING_SIGNALS } from "./test-support/signals.js";

let page: Page | undefined;
afterEach(() => page?.destroy());

const report = buildReport([
  { name: "sick", signals: DYING_SIGNALS },
  { name: "well-a", signals: ALIVE_SIGNALS },
  { name: "well-b", signals: ALIVE_SIGNALS },
  { name: "well-c", signals: ALIVE_SIGNALS },
]);

async function mount(): Promise<Page> {
  page = mountPage({ route: "#/demo/pump", fetchRoutes: { "GET /api/demo/pump": { body: serializeReport(report) } } });
  await page.flush();
  return page;
}

const aliveButton = (p: Page): HTMLElement => p.document.querySelector<HTMLElement>("[aria-controls='alive-list']") as HTMLElement;
const aliveTombs = (p: Page): HTMLElement[] =>
  Array.from(p.document.querySelectorAll<HTMLElement>("#alive-list [data-key]"));
const aliveCountControl = (p: Page): HTMLElement => p.document.querySelector<HTMLElement>("button.count[data-grade='alive']") as HTMLElement;

describe("alive group (DOM)", () => {
  it("the synthetic grades are what the tests assume", () => {
    const grades = report.dependencies.map((d) => d.death.grade);
    expect(grades).toEqual(["dying", "alive", "alive", "alive"]);
  });

  it("is collapsed with the count text and has no alive Tombstone in the DOM", async () => {
    const p = await mount();
    const button = aliveButton(p);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.textContent).toBe("3 alive packages");
    expect((p.document.getElementById("alive-list") as HTMLElement).hidden).toBe(true);
    expect(aliveTombs(p)).toHaveLength(0);
    for (const name of ["well-a", "well-b", "well-c"]) {
      expect(p.document.querySelector(`[data-key="${name}"]`)).toBeNull();
    }
    // Non-alive Tombstones are present.
    expect(p.document.querySelector('[data-key="sick"]')).not.toBeNull();
  });

  it("Enter expands and creates the Tombstones; Enter again collapses", async () => {
    const p = await mount();
    const button = aliveButton(p);
    button.focus();
    p.press("Enter");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect((p.document.getElementById("alive-list") as HTMLElement).hidden).toBe(false);
    expect(aliveTombs(p).map((t) => t.getAttribute("data-key"))).toEqual(["well-a", "well-b", "well-c"]);

    p.press("Enter");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect((p.document.getElementById("alive-list") as HTMLElement).hidden).toBe(true);
  });

  it("the alive count control in the header expands the group and focuses its button", async () => {
    const p = await mount();
    const control = aliveCountControl(p);
    expect(control.textContent).toContain("3");
    control.focus();
    p.press("Enter");
    // Per the spec the control "expands and focuses" the alive disclosure.
    const button = aliveButton(p);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(aliveTombs(p)).toHaveLength(3);
    expect(p.active()).toBe(button);
  });
});
