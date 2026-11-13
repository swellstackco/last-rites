// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { mountPage } from "./test-support/dom-harness.js";
import type { Page } from "./test-support/dom-harness.js";

const parseServer = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "parse-server.trim.json"), "utf8");
const FIRST_DEAD = "@babel/plugin-proposal-object-rest-spread"; // dead, score 75, first by name

let page: Page | undefined;
afterEach(() => page?.destroy());

async function mount(route = "#/demo/parse-server"): Promise<Page> {
  page = mountPage({ route, fetchRoutes: { "GET /api/demo/parse-server": { body: parseServer } } });
  await page.flush();
  return page;
}

const panelOf = (p: Page): HTMLElement => p.dialogRoot.querySelector<HTMLElement>('[role="dialog"]') as HTMLElement;
const tombFor = (p: Page, key: string): HTMLElement => p.document.querySelector<HTMLElement>(`[data-key="${key}"]`) as HTMLElement;
const isOpen = (p: Page): boolean => {
  const panel = p.dialogRoot.querySelector<HTMLElement>('[role="dialog"]');
  return panel !== null && !panel.hidden;
};

describe("keyboard and focus (DOM)", () => {
  it("Tab reaches the skip link first, then the first dead Tombstone", async () => {
    const p = await mount();
    (p.active() as HTMLElement).blur(); // a fresh sequential-focus start; the page moved focus to the h1 on load
    p.tab();
    const skip = p.active() as HTMLElement;
    expect(skip.classList.contains("skip-link")).toBe(true);

    // Following the skip link moves focus to the dead group; the next Tab is the first dead Tombstone.
    p.press("Enter");
    expect(p.active()?.id).toBe("group-dead-title");
    p.tab();
    expect(p.active()).toBe(tombFor(p, FIRST_DEAD));

    // Plain Tab from the skip link passes the four count controls before the first Tombstone.
    skip.focus();
    const seen: Element[] = [];
    for (let i = 0; i < 12 && p.active() !== tombFor(p, FIRST_DEAD); i++) {
      p.tab();
      seen.push(p.active() as Element);
    }
    expect(p.active()).toBe(tombFor(p, FIRST_DEAD));
    expect(seen.slice(0, 4).every((el) => el.classList.contains("count"))).toBe(true);
  });

  it("Enter opens the panel with focus on its heading; Tab and Shift+Tab stay inside; the page is inert", async () => {
    const p = await mount();
    const tomb = tombFor(p, FIRST_DEAD);
    tomb.focus();
    p.press("Enter");
    expect(isOpen(p)).toBe(true);
    const panel = panelOf(p);
    expect(p.active()).toBe(p.document.getElementById("detail-title"));
    expect(p.active()?.tagName).toBe("H2");

    for (let i = 0; i < 25; i++) {
      p.tab();
      expect(panel.contains(p.active())).toBe(true);
    }
    for (let i = 0; i < 25; i++) {
      p.shiftTab();
      expect(panel.contains(p.active())).toBe(true);
    }
    expect(p.appRoot.hasAttribute("inert")).toBe(true);
    expect(p.appRoot.getAttribute("aria-hidden")).toBe("true");
  });

  it("Escape closes the panel, returns focus to the same Tombstone and removes inert", async () => {
    const p = await mount();
    const tomb = tombFor(p, FIRST_DEAD);
    tomb.focus();
    p.press("Enter");
    p.press("Escape");
    expect(isOpen(p)).toBe(false);
    expect(p.active()).toBe(tomb);
    expect(p.appRoot.hasAttribute("inert")).toBe(false);
    expect(p.appRoot.hasAttribute("aria-hidden")).toBe(false);
    expect(p.hash()).toBe("#/demo/parse-server");
  });

  it("Space also opens the panel", async () => {
    const p = await mount();
    tombFor(p, FIRST_DEAD).focus();
    p.press(" ");
    expect(isOpen(p)).toBe(true);
  });

  it("a deep link opens the panel on load and restores focus to the Tombstone on close", async () => {
    const p = await mount("#/demo/parse-server?pkg=ldapjs");
    expect(isOpen(p)).toBe(true);
    expect(panelOf(p).querySelector("h2")?.textContent).toBe("ldapjs");
    expect(p.active()?.id).toBe("detail-title");
    p.press("Escape");
    expect(isOpen(p)).toBe(false);
    expect(p.active()).toBe(tombFor(p, "ldapjs"));
    expect(p.hash()).toBe("#/demo/parse-server");
  });

  it("an unknown pkg shows a notice and no panel", async () => {
    const p = await mount("#/demo/parse-server?pkg=no-such-package");
    expect(isOpen(p)).toBe(false);
    expect(p.document.body.textContent).toContain("No package named no-such-package in this scan");
    expect(p.appRoot.hasAttribute("inert")).toBe(false);
  });
});
