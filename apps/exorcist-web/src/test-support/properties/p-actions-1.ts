// Property 1 (graveyard-ui-actions, B1, fail-first): the proof of a github-actions dependency is found under its
// Action_Proof_Name. The expected names come from an independent model passed in by the caller.
import fc from "fast-check";
import { serializeReport } from "@last-rites/exorcist-npm/report";
import type { ScanReport } from "@last-rites/exorcist-npm/report";
import { actionsReportArb } from "../arbitraries.js";
import type { ActionsProofCase } from "../arbitraries.js";
import { mountPage } from "../dom-harness.js";
import type { Page } from "../dom-harness.js";

export class ActionsP1Failure extends Error {}

export const DEMO = "nixpacks-actions";

function fail(message: string): never {
  throw new ActionsP1Failure(message);
}

/** The settled text of the Proof_Section of an open panel, or null when there is no section. */
export function proofSectionText(page: Page): string | null {
  return page.dialogRoot.querySelector("section.proof")?.textContent ?? null;
}

export async function openPackage(page: Page, key: string): Promise<void> {
  const find = (): HTMLElement | undefined =>
    Array.from(page.document.querySelectorAll<HTMLElement>("button.tombstone")).find((t) => t.getAttribute("data-key") === key);
  if (!find()) page.click(page.document.querySelector<HTMLElement>("[aria-controls='alive-list']") as HTMLElement);
  const tombstone = find();
  if (!tombstone) fail(`no tombstone for ${key}`);
  page.click(tombstone);
  await page.flush();
}

export const proofUrls = (page: Page): string[] =>
  page.fake.calls.filter((c) => c.url.includes("/demo/proofs/")).map((c) => c.url);

export function mountActions(report: ScanReport, store: Record<string, string>): Page {
  const fetchRoutes: Record<string, { body: string }> = { [`GET /api/demo/${DEMO}`]: { body: serializeReport(report) } };
  for (const [name, text] of Object.entries(store)) fetchRoutes[`GET /demo/proofs/${DEMO}/${name}.json`] = { body: text };
  return mountPage({ route: `#/demo/${DEMO}`, fetchRoutes });
}

/** Opens every dependency in turn and checks the settled state and the requests. */
export async function checkActionsProof(
  { report, store }: ActionsProofCase,
  nameOf: (actionName: string) => string,
): Promise<void> {
  const page = mountActions(report, store);
  try {
    await page.flush();
    const expectedUrls: string[] = [];
    for (const dep of report.dependencies) {
      const proofName = nameOf(dep.name);
      const has = Object.hasOwn(store, proofName);
      await openPackage(page, dep.name);
      expectedUrls.push(`/demo/proofs/${DEMO}/${proofName}.json`);
      const text = proofSectionText(page);
      const grade = dep.death.grade;
      if (grade === "dead" || grade === "dying") {
        if (has && !(text ?? "").includes("Proved")) fail(`${dep.name} (${grade}) has a report but shows ${JSON.stringify(text)}`);
        if (!has && !(text ?? "").includes("Exorcism coming")) fail(`${dep.name} (${grade}) has no report but shows ${JSON.stringify(text)}`);
      } else if (has !== (text !== null)) {
        fail(`${dep.name} (${grade}): report ${has ? "exists" : "absent"} but section is ${text === null ? "missing" : "shown"}`);
      }
      page.press("Escape");
      await page.flush();
    }
    const urls = proofUrls(page);
    if (JSON.stringify(urls) !== JSON.stringify(expectedUrls)) {
      fail(`requested ${JSON.stringify(urls)}, expected one per name: ${JSON.stringify(expectedUrls)}`);
    }
  } finally {
    page.destroy();
  }
}

export function build(nameOf: (actionName: string) => string): fc.IAsyncProperty<[ActionsProofCase]> {
  return fc.asyncProperty(actionsReportArb(nameOf), async (c) => {
    await checkActionsProof(c, nameOf);
  });
}
