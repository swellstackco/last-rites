// Test-only harness option: renders a report with the frozen Reference_Renderer (views-v1)
// instead of the production views. Production controller.ts is not changed; the reference pieces
// (header, tombstones, one breakdown) are assembled here and read with renderedFacts.
import { buildBreakdown } from "@graveyard-kit/skeleton/graveyard";
import type { ScanReport } from "@graveyard-kit/exorcist-npm/report";
import { buildReportView } from "../model/report-view.js";
import { renderBreakdown } from "../__reference__/views-v1/breakdown.js";
import { renderHeader } from "../__reference__/views-v1/header.js";
import { renderTombstone } from "../__reference__/views-v1/tombstone.js";
import { renderedFacts } from "./rendered-facts.js";
import type { Facts } from "./rendered-facts.js";

export function renderReferenceFacts(report: ScanReport, openName: string): Facts {
  const view = buildReportView(report, "demo");
  const root = document.createElement("div");
  root.append(renderHeader({ header: view.header, onFocusGroup: () => {} }).element);
  for (const group of view.graveyard.groups) {
    for (const grave of group.graves) {
      root.append(renderTombstone(grave));
      if (grave.key === openName) root.append(renderBreakdown(buildBreakdown(grave.record), grave.record));
    }
  }
  return renderedFacts(root);
}
