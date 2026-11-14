// Property TP2 (toe-tag-polish, T4): the Form_Subtitle has no Orphan. Its text is FORM_SUBTITLE, split into exactly
// two Subtitle_Phrases, and "Form LR-1" is one element with no child element. The expected parts are written here
// (not imported) so the property does not depend on the code under test. Home page: added by task 5.1.
import fc from "fast-check";
import { serializeReport } from "@last-rites/exorcist-npm/report";
import type { ScanReport } from "@last-rites/exorcist-npm/report";
import { FORM_SUBTITLE } from "../../constants.js";
import { mountPage } from "../dom-harness.js";
import type { ToeMutate } from "../sabotage/toe.js";
import { toeScanReportArb } from "./tt1.js";

export const EXPECTED_PARTS = ["Office of the Dependency Examiner ·", "Form LR-1"] as const;

export class TP2Failure extends Error {}
const fail = (message: string): never => {
  throw new TP2Failure(message);
};

/** Asserts the structure of one `p.form-subtitle`. */
export function assertSubtitle(subtitle: Element | null, where: string): void {
  if (!subtitle) return fail(`${where}: no p.form-subtitle`);
  if (subtitle.textContent !== FORM_SUBTITLE) fail(`${where}: subtitle text is ${JSON.stringify(subtitle.textContent)}`);
  if (FORM_SUBTITLE !== "Office of the Dependency Examiner · Form LR-1") fail(`${where}: FORM_SUBTITLE changed`);
  const phrases = Array.from(subtitle.querySelectorAll(".subtitle-phrase"));
  if (phrases.length !== 2) return fail(`${where}: expected 2 .subtitle-phrase elements, found ${phrases.length}`);
  if (subtitle.children.length !== 2) fail(`${where}: the subtitle has ${subtitle.children.length} child elements, expected 2`);
  const texts = phrases.map((p) => p.textContent);
  if (texts.join("|") !== EXPECTED_PARTS.join("|")) fail(`${where}: phrases are ${JSON.stringify(texts)}`);
  const last = phrases[1]!;
  if (last.children.length > 0 || last.textContent !== "Form LR-1") fail(`${where}: "Form LR-1" is not one plain phrase`);
  if (!(phrases[0]!.textContent ?? "").endsWith(" ·")) fail(`${where}: the first phrase does not end with " ·"`);
}

export async function checkSubtitle(report: ScanReport, mutate?: ToeMutate): Promise<void> {
  const page = mountPage({ route: "#/demo/x", fetchRoutes: { "GET /api/demo/x": { body: serializeReport(report) } } });
  try {
    await page.flush();
    mutate?.(page.document, { report });
    assertSubtitle(page.document.querySelector("p.form-subtitle"), "graveyard page");
  } finally {
    page.destroy();
  }
}

export function build(mutate?: ToeMutate): fc.IAsyncProperty<[ScanReport]> {
  return fc.asyncProperty(toeScanReportArb, async (report) => {
    await checkSubtitle(report, mutate);
  });
}
