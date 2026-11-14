// @vitest-environment jsdom
// toe-tag-redesign 7.1: the sheet head is a Sheet_Tag around the h2; dialog behavior and Close are unchanged.
import { afterEach, describe, expect, it } from "vitest";
import { serializeReport } from "@last-rites/exorcist-npm/report";
import { buildReport } from "./test-support/build-report.js";
import { mountPage } from "./test-support/dom-harness.js";
import type { Page } from "./test-support/dom-harness.js";
import { DYING_SIGNALS } from "./test-support/signals.js";

let page: Page | undefined;
afterEach(() => page?.destroy());

const report = buildReport([
  { name: "gone", signals: { ...DYING_SIGNALS, deprecated: { kind: "known", value: true }, repoArchived: { kind: "known", value: true } } },
]);

async function open(): Promise<HTMLElement> {
  page = mountPage({
    route: "#/demo/pump",
    fetchRoutes: {
      "GET /api/demo/pump": { body: serializeReport(report) },
      "GET /demo/proofs/pump/gone.json": { status: 404, body: "not found" },
    },
  });
  await page.flush();
  page.click(page.document.querySelector<HTMLElement>('[data-key="gone"]') as HTMLElement);
  await page.flush();
  return page.dialogRoot.querySelector<HTMLElement>('[role="dialog"]') as HTMLElement;
}

describe("Sheet_Tag", () => {
  it("keeps the dialog attributes and focuses the h2 inside the tag", async () => {
    const panel = await open();
    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(panel.getAttribute("aria-labelledby")).toBe("detail-title");
    const title = panel.querySelector<HTMLElement>("h2#detail-title") as HTMLElement;
    expect(title.closest(".sheet-tag")).not.toBeNull();
    expect(title.getAttribute("tabindex")).toBe("-1");
    expect(page?.active()).toBe(title);
    expect(title.textContent).toBe("gone");
  });

  it("puts decorations in the tag, the Close button outside it, and no text in the band", async () => {
    const panel = await open();
    const tag = panel.querySelector<HTMLElement>(".sheet-head > .sheet-tag") as HTMLElement;
    expect(tag.getAttribute("data-grade")).toBe("dead");
    const hole = tag.querySelector(".tag-hole");
    const band = tag.querySelector(".tag-band");
    expect(hole?.getAttribute("aria-hidden")).toBe("true");
    expect(band?.getAttribute("aria-hidden")).toBe("true");
    expect(band?.textContent).toBe("");
    const close = panel.querySelector<HTMLElement>(".sheet-head > button") as HTMLElement;
    expect(close.textContent).toBe("Close");
    expect(tag.contains(close)).toBe(false);
    expect(Array.from(tag.children).map((c) => c.tagName)).toEqual(["SPAN", "H2", "SPAN"]);
  });

  it("shows the grade word once, as the grade chip", async () => {
    const panel = await open();
    const chips = panel.querySelectorAll(".grade-chip");
    expect(chips).toHaveLength(1);
    const word = (chips[0]?.textContent ?? "").split(" ")[0] as string;
    const leaves = Array.from(panel.querySelectorAll("*")).filter((e) => e.children.length === 0 && e.textContent === word);
    expect(leaves).toHaveLength(0);
    expect(panel.querySelector(".sheet-tag")?.textContent).toBe("gone");
  });
});
