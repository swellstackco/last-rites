// Property 9 (graveyard-ui-polish): fix checking, DOM half. Mounts the page for a generated report,
// opens one package and asserts the single grade label, calibration source, one clean Total_Row and kept focus.
import fc from "fast-check";
import { GRADE_INFO } from "@graveyard-kit/skeleton/graveyard";
import { serializeReport } from "@graveyard-kit/exorcist-npm/report";
import type { ScanReport } from "@graveyard-kit/exorcist-npm/report";
import { mountPage } from "../dom-harness.js";
import type { Mutate } from "../sabotage/dom.js";
import { openPackageArb, scanReportArb } from "../arbitraries.js";

export class P9Failure extends Error {}

function fail(message: string): never {
  throw new P9Failure(message);
}

/** Visible Grade_Labels: leaf elements whose text equals the grade word, outside name and summary. */
export function gradeLabels(tombstone: Element, label: string): Element[] {
  return Array.from(tombstone.querySelectorAll("*")).filter(
    (el) =>
      el.childElementCount === 0 &&
      !el.classList.contains("visually-hidden") &&
      !el.classList.contains("tomb-name") &&
      !el.classList.contains("tomb-summary") &&
      (el.textContent ?? "").trim().toLowerCase() === label.toLowerCase(),
  );
}

export type Part = "labels" | "calibration" | "total" | "focus";
export const PARTS: readonly Part[] = ["labels", "calibration", "total", "focus"];

export async function checkPage(report: ScanReport, openIndex: number, parts: readonly Part[] = PARTS, mutate?: Mutate): Promise<void> {
  const on = (part: Part): boolean => parts.includes(part);
  const dep = report.dependencies[openIndex % report.dependencies.length]!;
  const page = mountPage({
    route: "#/demo/x",
    fetchRoutes: { "GET /api/demo/x": { body: serializeReport(report) } },
  });
  try {
    await page.flush();
    if (on("focus") && page.document.activeElement?.tagName !== "H1") fail("the screen h1 lost programmatic focus");

    // Alive tombstones exist only after the disclosure is expanded.
    page.document.querySelector<HTMLElement>("button.disclosure[aria-controls='alive-list']")?.click();
    mutate?.(page.document, "tombstones");
    const tombstones = Array.from(page.document.querySelectorAll<HTMLElement>("button.tombstone"));
    if (tombstones.length !== report.dependencies.length) fail(`expected ${report.dependencies.length} tombstones, got ${tombstones.length}`);
    for (const t of on("labels") ? tombstones : []) {
      const grade = t.getAttribute("data-grade") as keyof typeof GRADE_INFO;
      const labels = gradeLabels(t, GRADE_INFO[grade].label);
      if (labels.length !== 1) fail(`tombstone ${t.getAttribute("data-key")} has ${labels.length} grade labels`);
      if (t.querySelector(".tomb-label")) fail("a .tomb-label is still rendered");
    }

    const opener = tombstones.find((t) => t.getAttribute("data-key") === dep.name);
    if (!opener) fail(`no tombstone for ${dep.name}`);
    page.click(opener);
    mutate?.(page.document, "opened");
    const panel = page.dialogRoot.querySelector<HTMLElement>('[role="dialog"]');
    if (!panel || panel.hidden) fail("the detail panel did not open");
    if (on("focus") && page.document.activeElement?.id !== "detail-title") fail("#detail-title lost programmatic focus");

    const calibration = dep.death.calibration;
    if (on("calibration")) checkCalibration(panel, calibration);
    if (on("total")) checkTotal(panel, dep.death.score);
  } finally {
    page.destroy();
  }
}

function checkCalibration(panel: HTMLElement, calibration: { rule: string } | undefined): void {
    const calRows = panel.querySelectorAll("tbody.calibration tr");
    if (calibration) {
      if (calRows.length !== 1) fail(`expected one calibration row, got ${calRows.length}`);
      const source = (calRows[0]!.querySelector("td[data-label='Source']")?.textContent ?? "").trim();
      if (source !== `Engine rule: ${calibration.rule}`) fail(`calibration source reads "${source}"`);
    } else if (calRows.length !== 0) {
      fail("a calibration row without calibration");
    }
    for (const cell of panel.querySelectorAll("tbody.calibration td[data-label='Source']")) {
      if ((cell.textContent ?? "").includes("No source recorded")) fail("calibration source says No source recorded");
    }

}

function checkTotal(panel: HTMLElement, score: number): void {
    const totals = panel.querySelectorAll("tfoot tr.total");
    if (totals.length !== 1) fail(`expected one Total_Row, got ${totals.length}`);
    const total = totals[0]!;
    const cells = Array.from(total.querySelectorAll("td, th"));
    if (cells.some((c) => (c.textContent ?? "").trim() === "")) fail("the Total_Row has an empty cell");
    if (!(total.textContent ?? "").includes(`${score} / 100`)) fail(`the Total_Row does not show ${score} / 100`);
    const span = cells.reduce((n, c) => n + Number(c.getAttribute("colspan") ?? 1), 0);
    if (span !== 5) fail(`the Total_Row spans ${span} columns, expected 5`);
}
export function build(parts: readonly Part[] = PARTS, mutate?: Mutate): fc.IAsyncProperty<[ScanReport, number]> {
  return fc.asyncProperty(scanReportArb, openPackageArb, async (report, index) => {
    await checkPage(report, index, parts, mutate);
  });
}
