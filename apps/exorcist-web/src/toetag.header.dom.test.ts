// @vitest-environment jsdom
// toe-tag-redesign 4.1: the masthead wraps the heading and meta line; text, labels and clicks are unchanged.
import { describe, expect, it } from "vitest";
import { GRADE_INFO, GRADE_ORDER } from "@last-rites/skeleton/graveyard";
import type { GradeBand } from "@last-rites/skeleton";
import { FORM_SUBTITLE, PRODUCT_NAME, SCREEN_NAME } from "./constants.js";
import { buildReportView } from "./model/report-view.js";
import { buildReport } from "./test-support/build-report.js";
import { ALIVE_SIGNALS, DYING_SIGNALS } from "./test-support/signals.js";
import { renderHeader } from "./views/header.js";

function build() {
  const report = buildReport([
    { name: "a", signals: DYING_SIGNALS },
    { name: "b", signals: ALIVE_SIGNALS },
  ]);
  const { header } = buildReportView(report, "demo");
  const clicked: GradeBand[] = [];
  const handle = renderHeader({ header, onFocusGroup: (g) => clicked.push(g) });
  document.body.replaceChildren(handle.element);
  return { header, handle, clicked };
}

describe("masthead", () => {
  it("h1 is SCREEN_NAME: repo and the first heading; the wordmark is a p", () => {
    const { header, handle } = build();
    const first = handle.element.querySelector("h1, h2, h3, h4, h5, h6");
    expect(first).toBe(handle.heading);
    expect(handle.heading.textContent).toBe(`${SCREEN_NAME}: ${header.repo}`);
    expect(handle.heading.getAttribute("tabindex")).toBe("-1");
    const wordmark = handle.element.querySelector(".masthead > .wordmark");
    expect(wordmark?.tagName).toBe("P");
    expect(wordmark?.textContent).toBe(PRODUCT_NAME);
    expect(handle.element.querySelector(".masthead > .form-subtitle")?.textContent).toBe(FORM_SUBTITLE);
    expect(handle.heading.parentElement?.className).toBe("masthead");
  });

  it("the meta line text equals the view model's and PRODUCT_NAME is not a p.meta", () => {
    const { header, handle } = build();
    const metas = Array.from(handle.element.querySelectorAll("p.meta"));
    expect(metas).toHaveLength(1);
    expect(metas[0]?.textContent).toBe(
      `${header.sourceLabel} · ref ${header.refLabel} · scanned ${header.scannedAtLabel} · ${header.total} scanned, ${header.skipped} skipped`,
    );
  });

  it("count buttons keep aria-label, data-grade, no inline style, and click behavior", () => {
    const { header, handle, clicked } = build();
    const buttons = Array.from(handle.element.querySelectorAll<HTMLButtonElement>("ul.counts button"));
    expect(buttons.map((b) => b.getAttribute("data-grade"))).toEqual([...GRADE_ORDER]);
    for (const b of buttons) {
      const grade = b.getAttribute("data-grade") as GradeBand;
      const label = GRADE_INFO[grade].label;
      expect(b.getAttribute("aria-label")).toBe(`${label}: ${header.counts[grade]}. Go to ${label.toLowerCase()} packages`);
      expect(b.hasAttribute("style")).toBe(false);
      b.click();
    }
    expect(clicked).toEqual([...GRADE_ORDER]);
  });

  it("the skip link is first and focuses the dead group", () => {
    const { handle, clicked } = build();
    const skip = handle.element.querySelector<HTMLAnchorElement>("nav a.skip-link");
    expect(handle.element.firstElementChild?.tagName).toBe("NAV");
    skip?.click();
    expect(clicked).toEqual(["dead"]);
  });
});
