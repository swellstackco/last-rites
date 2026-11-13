// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { serializeReport } from "@graveyard-kit/exorcist-npm/report";
import { buildReport } from "./test-support/build-report.js";
import { mountPage } from "./test-support/dom-harness.js";
import type { Page } from "./test-support/dom-harness.js";
import { ALIVE_SIGNALS, DYING_SIGNALS } from "./test-support/signals.js";

let page: Page | undefined;
afterEach(() => page?.destroy());

// dead: all signals bad and deprecated (calibrated floor); dying: DYING_SIGNALS (50);
// ailing: dying signals with fewer bad parts; alive: ALIVE_SIGNALS.
const report = buildReport([
  {
    name: "gone",
    signals: { ...DYING_SIGNALS, deprecated: { kind: "known", value: true }, repoArchived: { kind: "known", value: true } },
  },
  { name: "sick", signals: DYING_SIGNALS },
  { name: "meh", signals: { ...DYING_SIGNALS, monthsSinceLastCommit: { kind: "known", value: 0 }, openVulnsNoFix: { kind: "known", value: 0 } } },
  { name: "well", signals: ALIVE_SIGNALS },
]);

async function mount(): Promise<Page> {
  page = mountPage({ route: "#/demo/pump", fetchRoutes: { "GET /api/demo/pump": { body: serializeReport(report) } } });
  await page.flush();
  return page;
}

function openPanel(p: Page, key: string): HTMLElement {
  if (!p.document.querySelector(`[data-key="${key}"]`)) {
    p.click(p.document.querySelector<HTMLElement>("[aria-controls='alive-list']") as HTMLElement); // expand the alive group
  }
  p.click(p.document.querySelector<HTMLElement>(`[data-key="${key}"]`) as HTMLElement);
  return p.dialogRoot.querySelector<HTMLElement>('[role="dialog"]') as HTMLElement;
}

const proofOf = (panel: HTMLElement): HTMLElement | null => panel.querySelector<HTMLElement>("section.proof");

describe("Proof slot (DOM)", () => {
  it("the synthetic grades are what the tests assume", () => {
    const grades = Object.fromEntries(report.dependencies.map((d) => [d.name, d.death.grade]));
    expect(grades).toEqual({ gone: "dead", sick: "dying", meh: "ailing", well: "alive" });
  });

  it("a dead Grave shows 'Exorcism coming' and a focusable aria-disabled control that does nothing", async () => {
    const p = await mount();
    const callsBefore = p.fake.calls.length;
    const panel = openPanel(p, "gone");
    const proof = proofOf(panel) as HTMLElement;
    expect(proof.textContent).toContain("Exorcism coming");
    const control = proof.querySelector<HTMLElement>("button") as HTMLElement;
    expect(control.getAttribute("aria-disabled")).toBe("true");
    expect(control.hasAttribute("disabled")).toBe(false);
    expect(control.getAttribute("aria-describedby")).toBeTruthy();

    control.focus();
    expect(p.active()).toBe(control);
    const before = panel.innerHTML;
    p.click(control);
    p.press("Enter");
    p.press(" ");
    await p.flush();
    expect(panel.innerHTML).toBe(before);
    expect(p.dialogRoot.querySelector('[role="dialog"]')).toBe(panel);
    expect(p.fake.calls.length).toBe(callsBefore);
    p.fake.assertNoUnexpected();
  });

  it("a dying Grave shows the Proof section", async () => {
    const p = await mount();
    expect(proofOf(openPanel(p, "sick"))?.textContent).toContain("Exorcism coming");
  });

  it("ailing and alive Graves show no Proof section", async () => {
    const p = await mount();
    expect(proofOf(openPanel(p, "meh"))).toBeNull();
    p.press("Escape");
    expect(proofOf(openPanel(p, "well"))).toBeNull();
  });
});
