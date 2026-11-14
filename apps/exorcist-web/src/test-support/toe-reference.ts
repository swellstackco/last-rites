// Test-only: renders facts with the frozen Reference_Views (views-v2) instead of the production views.
// Groups and the skipped list are assembled here from the view model (those views are not frozen).
import { buildBreakdown, GRADE_INFO } from "@last-rites/skeleton/graveyard";
import type { ProofState } from "@last-rites/skeleton/graveyard";
import type { ScanReport } from "@last-rites/exorcist-npm/report";
import { h } from "../dom/h.js";
import { buildReportView } from "../model/report-view.js";
import { renderSkipped } from "../views/skipped.js";
import { renderBreakdown } from "../__reference__/views-v2/breakdown.js";
import { renderHeader } from "../__reference__/views-v2/header.js";
import { renderProofSlot } from "../__reference__/views-v2/proof-slot.js";
import { renderTombstone } from "../__reference__/views-v2/tombstone.js";
import { toeFacts } from "./toe-facts.js";
import type { ProofFacts, ToeFacts } from "./toe-facts.js";

export function renderReferenceToeFacts(report: ScanReport, openName: string | undefined): ToeFacts {
  const view = buildReportView(report, "demo");
  const root = document.createElement("div");
  root.append(renderHeader({ header: view.header, onFocusGroup: () => {} }).element);
  const openGrave = view.graveyard.groups.flatMap((g) => g.graves).find((g) => g.key === openName);
  for (const group of view.graveyard.groups) {
    const items = group.graves.map((grave) => h("li", null, renderTombstone(grave)));
    root.append(
      h(
        "section",
        { class: "group", id: `group-${group.grade}` },
        h("h2", { class: "group-title" }, `${GRADE_INFO[group.grade].label} (${group.count})`),
        h("ul", { class: "grid" }, items),
      ),
    );
  }
  const skipped = renderSkipped(view.skipped);
  if (skipped) root.append(skipped);
  if (openGrave) root.append(renderBreakdown(buildBreakdown(openGrave.record), openGrave.record));
  return toeFacts(root);
}

export type ReferenceProofState = ProofState | { status: "unreadable" };

/** Proof facts of the frozen `renderProofSlot`; `unreadable` is a coming-soon slot with the unreadable line. */
export function renderReferenceProofFacts(state: ReferenceProofState, pkg = "gone"): ProofFacts {
  const unreadable = state.status === "unreadable";
  const slotState: ProofState = state.status === "unreadable" ? { status: "coming_soon" } : state;
  const root = document.createElement("div");
  root.append(renderProofSlot({ package: pkg, state: slotState }, "grave-0-proof", unreadable));
  return toeFacts(root).proof as ProofFacts;
}
