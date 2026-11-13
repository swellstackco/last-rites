// @vitest-environment jsdom
// toe-tag-redesign 9.2: the swing is CSS-only; the DOM facts it relies on (one fresh .sheet-tag per open, none on proof update).
import { afterEach, describe, expect, it } from "vitest";
import { serializeReport } from "@graveyard-kit/exorcist-npm/report";
import { buildProofText } from "./test-support/build-proof-report.js";
import { buildReport } from "./test-support/build-report.js";
import { mountPage } from "./test-support/dom-harness.js";
import type { Page } from "./test-support/dom-harness.js";
import { DYING_SIGNALS } from "./test-support/signals.js";

let page: Page | undefined;
afterEach(() => page?.destroy());

const report = buildReport([
  { name: "gone", signals: { ...DYING_SIGNALS, deprecated: { kind: "known", value: true }, repoArchived: { kind: "known", value: true } } },
  { name: "sick", signals: DYING_SIGNALS },
]);

const panelOf = (p: Page): HTMLElement => p.dialogRoot.querySelector<HTMLElement>('[role="dialog"]') as HTMLElement;
const tags = (p: Page): HTMLElement[] => Array.from(p.dialogRoot.querySelectorAll<HTMLElement>(".sheet-tag"));
const tombstone = (p: Page, key: string): HTMLElement => p.document.querySelector<HTMLElement>(`[data-key="${key}"]`) as HTMLElement;

describe("Tag_Swing DOM facts", () => {
  it("is open, focused and has one sheet tag right after the click, with no timer advanced", async () => {
    page = mountPage({ route: "#/demo/pump", fetchRoutes: { "GET /api/demo/pump": { body: serializeReport(report) } } });
    await page.flush();
    page.click(tombstone(page, "gone"));
    expect(panelOf(page).hidden).toBe(false);
    expect(page.active()).toBe(panelOf(page).querySelector("h2#detail-title"));
    expect(page.hash()).toContain("pkg=");
    expect(tags(page)).toHaveLength(1);
  });

  it("replaces the sheet tag when another package opens, and on close then reopen", async () => {
    page = mountPage({ route: "#/demo/pump", fetchRoutes: { "GET /api/demo/pump": { body: serializeReport(report) } } });
    await page.flush();
    page.click(tombstone(page, "gone"));
    await page.flush();
    const first = tags(page)[0];
    page.click(tombstone(page, "sick"));
    await page.flush();
    expect(tags(page)).toHaveLength(1);
    const second = tags(page)[0];
    expect(second).not.toBe(first);
    expect(second?.textContent).toBe("sick");

    const close = Array.from(panelOf(page).querySelectorAll<HTMLElement>("button")).find((b) => b.textContent === "Close") as HTMLElement;
    page.click(close);
    await page.flush();
    page.click(tombstone(page, "sick"));
    await page.flush();
    expect(tags(page)).toHaveLength(1);
    expect(tags(page)[0]).not.toBe(second);
  });

  it("keeps the same sheet tag node when a proof arrives", async () => {
    page = mountPage({ route: "#/demo/pump", fetchRoutes: { "GET /api/demo/pump": { body: serializeReport(report) } } });
    const held = page.fake.hold("GET /demo/proofs/pump/gone.json");
    await page.flush();
    page.click(tombstone(page, "gone"));
    await page.flush();
    const tag = tags(page)[0];
    held.resolve({ body: buildProofText("proved") });
    await page.flush();
    expect(tags(page)).toHaveLength(1);
    expect(tags(page)[0]).toBe(tag);
    expect(panelOf(page).querySelector(".proof-badge")?.textContent).toBe("Proved");
  });
});
