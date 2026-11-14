// Test-only: renders facts with the frozen graveyard-ui-actions Reference_Views (__reference__/actions-v1 and the
// skeleton's proof-view-v1): header, report-view model, proof slot and Detail_Panel exactly as they were before the fix.
// Tombstones, groups and the skipped list are the production views (the fix does not touch them). The production
// controller is not changed and not used; `mountPage` stays as it is (deviation from task 2.1, see docs/kiro-log.md:
// the controller takes no injected views, so the reference is assembled here, like toe-reference-v3.ts).
// Rendering happens in detached nodes.
import { GRADE_INFO } from "@last-rites/skeleton/graveyard";
import type { ProofReport } from "@last-rites/skeleton/proof";
import type { ScanReport } from "@last-rites/exorcist-npm/report";
import { h } from "../dom/h.js";
import { createDetail } from "../__reference__/actions-v1/detail.js";
import type { ProofShown } from "../__reference__/actions-v1/detail.js";
import { renderHeader } from "../__reference__/actions-v1/header.js";
import { buildReportView } from "../__reference__/actions-v1/report-view.js";
import { buildProofView as buildReferenceProofView } from "../../../../skeleton/src/graveyard/__reference__/proof-view-v1.js";
import { renderSkipped } from "../views/skipped.js";
import { renderTombstone } from "../views/tombstone.js";
import { toeFacts } from "./toe-facts.js";
import type { ToeFacts } from "./toe-facts.js";

export type { ProofShown };
export { buildReferenceProofView };

/** The proof states a page can reach, as the unfixed controller shows them. */
export type ProofLoad = { kind: "report"; report: ProofReport } | { kind: "absent" | "failed" | "invalid" };

export function referenceShown(load: ProofLoad): ProofShown {
  if (load.kind === "report") return { state: { status: "report", view: buildReferenceProofView(load.report) } };
  return load.kind === "invalid" ? { state: { status: "coming_soon" }, unreadable: true } : { state: { status: "coming_soon" } };
}

/** The whole report page as the frozen views draw it, with the panel open on `openName` (when given). */
export function renderActionsReferenceFacts(report: ScanReport, openName: string | undefined, proof?: ProofShown): ToeFacts {
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
