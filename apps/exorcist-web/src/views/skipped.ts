// Collapsed "Skipped (n)" disclosure. Text only.
import type { SkippedEntry } from "@graveyard-kit/exorcist-npm/report";
import { h } from "../dom/h.js";

export function renderSkipped(skipped: readonly SkippedEntry[]): HTMLElement | null {
  if (skipped.length === 0) return null;
  return h(
    "details",
    { class: "skipped" },
    h("summary", null, `Skipped (${skipped.length})`),
    h(
      "ul",
      null,
      skipped.map((s) =>
        h("li", null, h("span", { class: "tomb-name" }, s.name), ` ${s.specifier}: ${s.reason} (${s.kind})`),
      ),
    ),
  );
}
