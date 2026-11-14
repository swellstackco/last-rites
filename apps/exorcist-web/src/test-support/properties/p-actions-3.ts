// Property 3 (graveyard-ui-actions, preservation of npm proof paths, 3.1): for a report with ecosystem absent or
// "npm", the page requests exactly the proof paths of the frozen key logic: `demo/proofs/<demo>/<name>.json` for
// names that are Proof_Names, none for the others (scoped names), one request per opened name.
import fc from "fast-check";
import { isProofName } from "@last-rites/skeleton/proof";
import { serializeReport } from "@last-rites/exorcist-npm/report";
import type { ScanReport } from "@last-rites/exorcist-npm/report";
import { referenceProofPath } from "../../__reference__/actions-v1/proof-key.js";
import { scanReportArb } from "../arbitraries.js";
import { mountPage } from "../dom-harness.js";
import type { Page } from "../dom-harness.js";

export class ActionsP3Failure extends Error {}

function fail(message: string): never {
  throw new ActionsP3Failure(message);
}

export const requestedProofUrls = (page: Page): string[] =>
  page.fake.calls.filter((c) => c.url.includes("/demo/proofs/")).map((c) => c.url);

async function openByKey(page: Page, key: string): Promise<void> {
  const find = (): HTMLElement | undefined =>
    Array.from(page.document.querySelectorAll<HTMLElement>("button.tombstone")).find((t) => t.getAttribute("data-key") === key);
  const disclosure = page.document.querySelector<HTMLElement>("button.disclosure[aria-controls='alive-list']");
  if (!find() && disclosure) page.click(disclosure);
  const tombstone = find();
  if (!tombstone) fail(`no tombstone for ${key}`);
  page.click(tombstone);
  await page.flush();
  page.press("Escape");
  await page.flush();
}

/** Opens every dependency of `report` (served as demo `demo`) and returns the proof URLs the page requested. */
export async function proofUrlsFor(report: ScanReport, demo: string, names: readonly string[]): Promise<string[]> {
  const page = mountPage({ route: `#/demo/${demo}`, fetchRoutes: { [`GET /api/demo/${demo}`]: { body: serializeReport(report) } } });
  try {
    await page.flush();
    for (const name of names) await openByKey(page, name);
    return requestedProofUrls(page);
  } finally {
    page.destroy();
  }
}

export async function checkNpmPaths(report: ScanReport, ecosystem: "npm" | undefined): Promise<void> {
  const withEcosystem = ecosystem === undefined ? report : { ...report, ecosystem };
  const names = withEcosystem.dependencies.map((d) => d.name);
  const urls = await proofUrlsFor(withEcosystem, "pump", names);
  const want = names.map((n) => referenceProofPath("pump", n)).filter((u): u is string => u !== undefined);
  if (JSON.stringify(urls) !== JSON.stringify(want)) fail(`requested ${JSON.stringify(urls)}, the reference requests ${JSON.stringify(want)}`);
  for (const n of names) {
    if (!isProofName(n) && urls.some((u) => u.includes(encodeURIComponent(n)) || u.endsWith(`/${n}.json`))) fail(`a request was made for ${n}`);
  }
}

export function build(): fc.IAsyncProperty<[ScanReport, "npm" | undefined]> {
  return fc.asyncProperty(scanReportArb, fc.constantFrom<"npm" | undefined>(undefined, "npm"), async (report, ecosystem) => {
    await checkNpmPaths(report, ecosystem);
  });
}
