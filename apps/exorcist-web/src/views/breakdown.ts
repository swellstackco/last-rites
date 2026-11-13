// Breakdown table: one row per signal, the calibration row in its own <tbody>, a total in <tfoot>.
import { toGrade } from "@graveyard-kit/skeleton";
import type { DeathScoreResult } from "@graveyard-kit/skeleton";
import { GRADE_INFO } from "@graveyard-kit/skeleton/graveyard";
import type { Breakdown, CalibrationRow, SignalRow } from "@graveyard-kit/skeleton/graveyard";
import { h, safeHref } from "../dom/h.js";
import type { Child } from "../dom/h.js";

export const UNKNOWN_EXPLANATION = "An unknown signal is scored as partly dead, never as alive.";
export const WITHHELD_TEXT = "Source link withheld: not an http or https URL";

const CATEGORY_WORDS: Record<string, string> = {
  not_found: "not found",
  timeout: "timed out",
  rate_limited: "rate limited",
  malformed_response: "malformed response",
  network_error: "network error",
  not_applicable: "not applicable",
  incomplete: "incomplete",
};

export function categoryInWords(category: string): string {
  return Object.prototype.hasOwnProperty.call(CATEGORY_WORDS, category)
    ? (CATEGORY_WORDS[category] as string)
    : category;
}

function pointsBar(points: number, weight: number): HTMLElement {
  const pct =
    weight > 0 && Number.isFinite(points) ? Math.max(0, Math.min(100, Math.round((points / weight) * 100))) : 0;
  const fill = h("span", { class: "bar-fill" });
  fill.style.width = `${pct}%`;
  return h("span", { class: "bar", "aria-hidden": "true" }, fill);
}

function sourceCell(row: SignalRow): Child {
  if (row.href !== undefined) {
    // Re-validated here: an anchor is only ever built from a Safe_Url.
    const href = safeHref(row.href);
    if (href !== undefined) {
      return h(
        "a",
        {
          href,
          target: "_blank",
          rel: "noopener noreferrer",
          "aria-label": `Source for ${row.label}: ${row.hrefHost ?? ""}, opens in a new tab`,
        },
        row.hrefHost ?? "",
      );
    }
  }
  if (row.withheldUrl !== undefined) {
    return [`${WITHHELD_TEXT}: `, h("span", { class: "num" }, row.withheldUrl)];
  }
  return "No source recorded";
}

function unknownDetail(row: SignalRow): HTMLElement {
  const reason = row.unknownReason;
  return h(
    "p",
    { class: "unknown" },
    h("strong", null, "Unknown"),
    reason
      ? ` (source ${reason.source}, ${categoryInWords(reason.category)}: ${reason.message}). `
      : " (No reason recorded). ",
    UNKNOWN_EXPLANATION,
  );
}

function signalRow(row: SignalRow): HTMLTableRowElement {
  const unknown = row.status === "unknown";
  return h(
    "tr",
    { "data-status": unknown ? "unknown" : "known" },
    h(
      "th",
      { scope: "row" },
      row.label,
      h("br", null),
      h("span", { class: "muted" }, row.explanation),
      unknown ? unknownDetail(row) : null,
    ),
    h(
      "td",
      { "data-label": "Value" },
      unknown ? h("span", { class: "unknown" }, `? ${row.rawDisplay}`) : row.rawDisplay,
    ),
    h("td", { "data-label": "Status" }, unknown ? "Unknown" : "Known"),
    h(
      "td",
      { "data-label": "Points" },
      pointsBar(row.points, row.weight),
      h("span", { class: "num" }, `${row.points} / ${row.weight}`),
    ),
    h("td", { "data-label": "Source" }, sourceCell(row)),
  );
}

function calibrationBody(row: CalibrationRow): HTMLTableSectionElement {
  return h(
    "tbody",
    { class: "calibration" },
    h(
      "tr",
      null,
      h(
        "th",
        { scope: "row" },
        h("span", { class: ["calibration-label", "chip"] }, "Declared abandoned"),
        h("br", null),
        row.text,
        h("br", null),
        h("span", { class: "muted" }, row.explanation),
      ),
      h("td", { "data-label": "Value" }, "n/a"),
      h("td", { "data-label": "Status" }, "Calibration"),
      h("td", { "data-label": "Points" }, h("span", { class: "num" }, `+${row.points}`)),
      h("td", { "data-label": "Source" }, "No source recorded"),
    ),
  );
}

/** Renders a Breakdown. Shows the numbers as given; mismatches are reported, never hidden. */
export function renderBreakdown(
  breakdown: Breakdown,
  record: { name: string; death: DeathScoreResult },
): HTMLTableElement {
  const signalRows = breakdown.rows.filter((r): r is SignalRow => r.kind === "signal");
  const calibration = breakdown.rows.find((r): r is CalibrationRow => r.kind === "calibration");
  const death = record.death;

  return h(
    "table",
    { class: "breakdown" },
    h("caption", null, `Score breakdown for ${record.name}`),
    h(
      "thead",
      null,
      h(
        "tr",
        null,
        h("th", { scope: "col" }, "Signal"),
        h("th", { scope: "col" }, "Value"),
        h("th", { scope: "col" }, "Status"),
        h("th", { scope: "col" }, "Points / weight"),
        h("th", { scope: "col" }, "Source"),
      ),
    ),
    h("tbody", null, signalRows.map(signalRow)),
    calibration ? calibrationBody(calibration) : null,
    h(
      "tfoot",
      null,
      h(
        "tr",
        { class: "total" },
        h("th", { scope: "row" }, "Total"),
        h("td", null, ""),
        h("td", null, ""),
        h("td", { "data-label": "Total" }, h("span", { class: "num" }, `${breakdown.score} / 100`)),
        h("td", null, ""),
      ),
      breakdown.consistent
        ? null
        : h(
            "tr",
            { class: "mismatch" },
            h(
              "td",
              { colspan: 5, role: "alert" },
              `Breakdown does not add up: rows sum to ${breakdown.sum}, score is ${breakdown.score}`,
            ),
          ),
      breakdown.gradeConsistent
        ? null
        : h(
            "tr",
            { class: "mismatch" },
            h(
              "td",
              { colspan: 5 },
              `Grade mismatch: the file says ${death.grade}, but a score of ${death.score} is ${toGrade(death.score)} (${GRADE_INFO[toGrade(death.score)].min}-${GRADE_INFO[toGrade(death.score)].max})`,
            ),
          ),
    ),
  );
}
