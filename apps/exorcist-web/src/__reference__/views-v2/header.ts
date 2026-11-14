// FROZEN, test-only, never import from production code or main.ts.
// Byte copy of src/views/header.ts as it was before toe-tag-redesign (2026-11-13, post graveyard-ui-polish); imports adjusted to ../../.
// Used only by the Toe Tag preservation properties (tt1 to tt3) as the Reference_Views.
// Summary_Header: repo facts, four count controls, legend, warnings, notes, skip link.
import type { GradeBand } from "@last-rites/skeleton";
import { GRADE_INFO, GRADE_ORDER } from "@last-rites/skeleton/graveyard";
import { COPY, PRODUCT_NAME, SCREEN_NAME } from "../../constants.js";
import { constantHref, h } from "../../dom/h.js";
import type { ClassName } from "../../dom/h.js";
import type { SummaryHeader } from "../../model/report-view.js";
import { groupId } from "../../views/graveyard.js";

export interface HeaderOptions {
  header: SummaryHeader;
  /** Focus the group of a grade (or the alive disclosure). */
  onFocusGroup(grade: GradeBand): void;
}

export interface HeaderHandle {
  element: HTMLElement;
  /** The screen's h1 (tabindex -1), focus target on phase change. */
  heading: HTMLElement;
}

const COUNT_BORDER: Record<GradeBand, string> = {
  dead: "var(--ember)",
  dying: "var(--amber)",
  ailing: "var(--lichen)",
  alive: "var(--moss)",
};

export function renderHeader(opts: HeaderOptions): HeaderHandle {
  const { header } = opts;

  const skip = h("a", { class: "skip-link", href: constantHref(`#${groupId("dead")}`) }, COPY.skipToDead);
  skip.addEventListener("click", (event) => {
    // The hash belongs to the router; move focus instead of navigating.
    event.preventDefault();
    opts.onFocusGroup("dead");
  });

  const heading = h("h1", { tabindex: -1 }, `${SCREEN_NAME}: ${header.repo}`);

  const counts = GRADE_ORDER.map((grade) => {
    const label = GRADE_INFO[grade].label;
    const button = h(
      "button",
      {
        type: "button",
        class: ["btn", "count"] satisfies ClassName[],
        "data-grade": grade,
        "aria-label": `${label}: ${header.counts[grade]}. Go to ${label.toLowerCase()} packages`,
      },
      h("span", { class: "num" }, String(header.counts[grade])),
      h("span", null, label),
    );
    button.style.borderTopColor = COUNT_BORDER[grade];
    button.addEventListener("click", () => opts.onFocusGroup(grade));
    return h("li", null, button);
  });

  const legend = h(
    "p",
    { class: "legend" },
    `Score ranges: ${GRADE_ORDER.map((g) => `${GRADE_INFO[g].label} ${GRADE_INFO[g].min}-${GRADE_INFO[g].max}`).join(", ")}. 0 is alive, 100 is dead.`,
  );

  const element = h(
    "header",
    { class: "header" },
    h("nav", { "aria-label": "Skip links" }, skip),
    h(
      "div",
      { class: "stack" },
      h("p", { class: "meta" }, PRODUCT_NAME),
      heading,
      h(
        "p",
        { class: "meta" },
        `${header.sourceLabel} · ref ${header.refLabel} · scanned ${header.scannedAtLabel} · ${header.total} scanned, ${header.skipped} skipped`,
      ),
    ),
    h("ul", { class: "counts", "aria-label": "Packages per grade" }, counts),
    legend,
    header.summaryDisagrees
      ? h(
          "p",
          { class: "notice", role: "status" },
          "This file's summary disagrees with its dependencies. The counts shown are computed from the dependencies.",
        )
      : null,
    header.rangesOnly
      ? h(
          "p",
          { class: "note" },
          "Versions come from declared ranges because no package-lock.json was read. Yarn and pnpm lockfiles are not read in v1.",
        )
      : null,
    header.warnings.length > 0
      ? h(
          "div",
          { class: "warnings" },
          h("p", { id: "report-warnings-title" }, "Warnings"),
          h("ul", { "aria-labelledby": "report-warnings-title" }, header.warnings.map((w) => h("li", null, w))),
        )
      : null,
  );

  return { element, heading };
}
