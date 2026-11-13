// Test-only: renders facts with the frozen Reference_Renderer (views-v3, today's views at 6f860b4) for the
// toe-tag-polish preservation properties. The pieces are assembled here from the view model; the production
// controller is not changed and not used. Rendering happens in detached nodes (no focus, no document writes).
import { GRADE_INFO } from "@graveyard-kit/skeleton/graveyard";
import type { ScanReport } from "@graveyard-kit/exorcist-npm/report";
import { h } from "../dom/h.js";
import { buildReportView } from "../model/report-view.js";
import { renderSkipped } from "../views/skipped.js";
import { createDetail } from "../__reference__/views-v3/detail.js";
import type { ProofShown } from "../__reference__/views-v3/detail.js";
import { renderHeader } from "../__reference__/views-v3/header.js";
import { renderPicker } from "../__reference__/views-v3/picker.js";
import { renderTombstone } from "../__reference__/views-v3/tombstone.js";
import { pickerFacts, toeFacts } from "./toe-facts.js";
import type { PickerFacts, ToeFacts } from "./toe-facts.js";

export type { ProofShown };

/**
 * The whole report page as the v3 views draw it, with the Detail_Panel open on `openName` (when given) and
 * `proof` as its proof state (the v3 panel shows a Proof_Section for dead and dying packages only).
 */
export function renderReferenceV3Facts(report: ScanReport, openName: string | undefined, proof?: ProofShown): ToeFacts {
  const view = buildReportView(report, "demo");
  const root = document.createElement("div");
  root.append(renderHeader({ header: view.header, onFocusGroup: () => {} }).element);
  for (const group of view.graveyard.groups) {
    root.append(
      h(
        "section",
        { class: "group", id: `group-${group.grade}` },
        h("h2", { class: "group-title" }, `${GRADE_INFO[group.grade].label} (${group.count})`),
        h("ul", { class: "grid" }, group.graves.map((grave) => h("li", null, renderTombstone(grave)))),
      ),
    );
  }
  const skipped = renderSkipped(view.skipped);
  if (skipped) root.append(skipped);
  const grave = view.graveyard.groups.flatMap((g) => g.graves).find((g) => g.key === openName);
  if (grave) {
    const appRoot = document.createElement("div");
    const host = document.createElement("div");
    const detail = createDetail({ appRoot, host, onRequestClose: () => {} });
    detail.open(grave, proof ? { proof } : {});
    root.append(host);
  }
  return toeFacts(root);
}

/** The Repo_Picker as the v3 views draw it. */
export function renderReferenceV3Picker(prefill?: { repo: string; ref: string }, notice?: string): PickerFacts {
  const picker = renderPicker({
    ...(prefill ? { prefill } : {}),
    ...(notice ? { notice } : {}),
    onOpenDemo: () => {},
    onSubmitLive: () => {},
  });
  const root = document.createElement("div");
  root.append(picker.element);
  return pickerFacts(root);
}
