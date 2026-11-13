// Rendered_Facts: what a page shows about a Scan_Report, read from stable data hooks only
// (data-key, data-grade, aria-label, td[data-label]), never from layout classes or the Source column.

export interface BreakdownFacts {
  /** Signal rows then the calibration row, in DOM order. */
  rows: Array<{ label: string; value: string; status: string; points: string }>;
  total: string;
}

export interface Facts {
  /** Header count buttons in DOM order: grade and number. */
  counts: Array<{ grade: string; count: string }>;
  /** Tombstones in DOM order. */
  tombstones: Array<{ key: string; grade: string; name: string }>;
  breakdown: BreakdownFacts | null;
}

const text = (el: Element | null | undefined): string => (el?.textContent ?? "").trim();

export function renderedFacts(root: ParentNode): Facts {
  const counts = Array.from(root.querySelectorAll<HTMLElement>("ul.counts button[data-grade]")).map((b) => ({
    grade: b.getAttribute("data-grade") ?? "",
    count: text(b.querySelector(".num")),
  }));
  const tombstones = Array.from(root.querySelectorAll<HTMLElement>("button.tombstone")).map((b) => ({
    key: b.getAttribute("data-key") ?? "",
    grade: b.getAttribute("data-grade") ?? "",
    name: b.getAttribute("aria-label") ?? "",
  }));
  const table = root.querySelector("table.breakdown");
  let breakdown: BreakdownFacts | null = null;
  if (table) {
    const rows = Array.from(table.querySelectorAll("tbody > tr")).map((tr) => ({
      label: text(tr.querySelector("th")),
      value: text(tr.querySelector("td[data-label='Value']")),
      status: text(tr.querySelector("td[data-label='Status']")),
      points: text(tr.querySelector("td[data-label='Points'] .num")),
    }));
    breakdown = { rows, total: text(table.querySelector("tfoot tr.total td[data-label='Total'] .num")) };
  }
  return { counts, tombstones, breakdown };
}
