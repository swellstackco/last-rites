// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { serializeReport } from "@graveyard-kit/exorcist-npm/report";
import { buildReport, tamperUrl } from "./test-support/build-report.js";
import { mountPage } from "./test-support/dom-harness.js";
import type { Page } from "./test-support/dom-harness.js";
import { DYING_SIGNALS } from "./test-support/signals.js";

let page: Page | undefined;
afterEach(() => page?.destroy());

const HOSTILE_NAME = "<img src=x onerror=alert(1)>";

function makeReport() {
  let r = buildReport([
    { name: "linky", signals: { ...DYING_SIGNALS, sourceUrls: { deprecated: "https://www.npmjs.com/package/linky" } } },
    { name: HOSTILE_NAME, signals: DYING_SIGNALS },
  ]);
  r = tamperUrl(r, "linky", "repoArchived", "javascript:alert(1)");
  r = tamperUrl(r, "linky", "maintainerCount", "data:text/html,x");
  r = tamperUrl(r, HOSTILE_NAME, "openVulnsNoFix", "javascript:alert(2)");
  return r;
}

async function mount(): Promise<void> {
  page = mountPage({
    route: "#/demo/pump",
    fetchRoutes: { "GET /api/demo/pump": { body: serializeReport(makeReport()) } },
  });
  await page.flush();
}

const unsafeAttr = (root: ParentNode): Element[] =>
  Array.from(root.querySelectorAll("[href], [src]")).filter((el) =>
    [el.getAttribute("href"), el.getAttribute("src")].some((v) => v !== null && /^\s*(javascript|data):/i.test(v)),
  );

describe("links and hostile text (DOM)", () => {
  it("never renders javascript: or data: URLs and shows the withheld text", async () => {
    await mount();
    const p = page as Page;
    p.click(p.document.querySelector<HTMLElement>('[data-key="linky"]') as HTMLElement);
    const panel = p.dialogRoot.querySelector<HTMLElement>('[role="dialog"]') as HTMLElement;
    expect(panel.textContent).toContain("Source link withheld");
    expect(panel.textContent).toContain("javascript:alert(1)"); // shown as text only
    expect(unsafeAttr(p.document)).toHaveLength(0);
  });

  it("renders a valid https URL as a safe link with its accessible name", async () => {
    await mount();
    const p = page as Page;
    p.click(p.document.querySelector<HTMLElement>('[data-key="linky"]') as HTMLElement);
    const link = p.dialogRoot.querySelector<HTMLAnchorElement>("table a[href]");
    expect(link?.getAttribute("href")).toBe("https://www.npmjs.com/package/linky");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("aria-label")).toContain("opens in a new tab");
    expect(link?.getAttribute("aria-label")).toContain("www.npmjs.com");
  });

  it("renders a package name with markup as text and creates no element from it", async () => {
    await mount();
    const p = page as Page;
    expect(p.document.querySelector("img")).toBeNull();
    const tomb = p.document.querySelector<HTMLElement>(".tomb-name");
    const names = Array.from(p.document.querySelectorAll(".tomb-name")).map((e) => e.textContent);
    expect(names).toContain(HOSTILE_NAME);
    expect(tomb).not.toBeNull();
    const hostile = Array.from(p.document.querySelectorAll<HTMLElement>(".tombstone")).find((t) => t.dataset.key === HOSTILE_NAME) as HTMLElement;
    p.click(hostile);
    expect(p.document.querySelector("img")).toBeNull();
    expect(p.dialogRoot.querySelector("h2")?.textContent).toBe(HOSTILE_NAME);
    expect(unsafeAttr(p.document)).toHaveLength(0);
  });
});
