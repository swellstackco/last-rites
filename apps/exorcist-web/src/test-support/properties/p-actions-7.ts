// Property 7 (graveyard-ui-actions, preservation of npm rendering, 3.2 to 3.5): the page shows the same facts as the
// frozen Reference_Views (header, groups, tombstones, panel, breakdown, proof state); the proof view keeps the
// fields it has today; the npm panel has no Repository fact and keeps "Deprecated on npm".
import fc from "fast-check";
import { buildProofView } from "@last-rites/skeleton/graveyard";
import type { ProofReport } from "@last-rites/skeleton/proof";
import { serializeReport } from "@last-rites/exorcist-npm/report";
import type { ScanReport } from "@last-rites/exorcist-npm/report";
import { demoPackageArb, openPackageArb, proofLoadArb, proofReportArb, scanReportArb } from "../arbitraries.js";
import type { DemoPackageCase, ProofLoadDraw } from "../arbitraries.js";
import { mountPage } from "../dom-harness.js";
import { buildReferenceProofView, referenceShown, renderActionsReferenceFacts } from "../actions-reference.js";
import { toeFacts } from "../toe-facts.js";
import { proofRoute } from "./tt2.js";

export class ActionsP7Failure extends Error {}

function fail(message: string): never {
  throw new ActionsP7Failure(message);
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const NEW_ATTEMPT_FIELDS = ["kind", "kindLine", "coverageText", "rewrite"] as const;

/** The proof view with the fields task 3.4 adds removed: what exists today. */
export function viewFieldsOfToday(report: ProofReport): unknown {
  const view = buildProofView(report);
  return {
    ...view,
    attempts: view.attempts.map((a) => {
      const copy: Record<string, unknown> = { ...a };
      for (const f of NEW_ATTEMPT_FIELDS) delete copy[f];
      return copy;
    }),
  };
}

export function checkProofView(report: ProofReport): void {
  // Generated npm reports have no pin or contract attempt: the whole view, new fields included, is the old one.
  const now = buildProofView(report);
  const before = buildReferenceProofView(report);
  if (!same(now, before)) fail(`the proof view of an npm report changed:\nnow=${JSON.stringify(now)}\nbefore=${JSON.stringify(before)}`);
  if (!same(viewFieldsOfToday(report), before)) fail("a field that exists today changed");
}

const expandAlive = (doc: Document): void => {
  const button = doc.querySelector<HTMLElement>("button.disclosure[aria-controls='alive-list']");
  if (button && button.getAttribute("aria-expanded") !== "true") button.click();
};

/** Mounts `report`, opens `openName` (after `serve` registered its proof routes) and compares every fact with the frozen views. */
export async function checkPageFacts(
  report: ScanReport,
  openName: string,
  demo: string,
  serve: (page: ReturnType<typeof mountPage>) => void,
  proof: ProofLoadDraw["load"] | undefined,
  /** Emulates a wrong page (4.3): called with the open page before the comparison. Default: none. */
  tamper?: (page: ReturnType<typeof mountPage>) => void,
): Promise<void> {
  const page = mountPage({ route: `#/demo/${demo}`, fetchRoutes: { [`GET /api/demo/${demo}`]: { body: serializeReport(report) } } });
  try {
    serve(page);
    await page.flush();
    expandAlive(page.document);
    const opener = Array.from(page.document.querySelectorAll<HTMLElement>("button.tombstone")).find((t) => t.getAttribute("data-key") === openName);
    if (!opener) fail(`no tombstone for ${openName}`);
    page.click(opener);
    await page.flush();
    tamper?.(page);
    const actual = toeFacts(page.document.body);
    const reference = renderActionsReferenceFacts(report, openName, proof ? referenceShown(proof) : undefined);
    if (!same(actual, reference)) fail(`facts differ from the Reference_Views:\nactual=${JSON.stringify(actual)}\nreference=${JSON.stringify(reference)}`);
    if (page.dialogRoot.querySelectorAll("p.muted").length > 0) {
      const labels = Array.from(page.dialogRoot.querySelectorAll("p.muted")).map((p) => p.textContent);
      if (labels.includes("Repository")) fail("an npm panel has a Repository fact");
    }
    const rows = Array.from(page.dialogRoot.querySelectorAll("table.breakdown tbody th")).map((t) => t.textContent ?? "");
    if (rows.length > 0 && !rows[0]?.startsWith("Deprecated on npm")) fail(`first breakdown row is ${JSON.stringify(rows[0])}, not "Deprecated on npm"`);
  } finally {
    page.destroy();
  }
}

export interface P7Scan {
  report: ScanReport;
  index: number;
  ecosystem: "npm" | undefined;
}

export const p7ScanArb: fc.Arbitrary<P7Scan> = fc.record({
  report: scanReportArb,
  index: openPackageArb,
  ecosystem: fc.constantFrom<"npm" | undefined>(undefined, "npm"),
});

export async function checkScan({ report, index, ecosystem }: P7Scan, tamper?: (page: ReturnType<typeof mountPage>) => void): Promise<void> {
  const withEcosystem = ecosystem === undefined ? report : { ...report, ecosystem };
  const dep = withEcosystem.dependencies[index % withEcosystem.dependencies.length]!;
  // Every proof request of an unregistered path is a 404 ("Exorcism coming" or no section), as in the reference.
  await checkPageFacts(withEcosystem, dep.name, "x", () => {}, undefined, tamper);
}

export async function checkProof(pkg: DemoPackageCase, draw: ProofLoadDraw): Promise<void> {
  await checkPageFacts(
    pkg.report,
    pkg.name,
    "pump",
    (page) => page.fake.on(`GET /demo/proofs/pump/${pkg.name}.json`, proofRoute(draw.load)),
    draw.load,
  );
}

export function buildScan(tamper?: (page: ReturnType<typeof mountPage>) => void): fc.IAsyncProperty<[P7Scan]> {
  return fc.asyncProperty(p7ScanArb, async (c) => checkScan(c, tamper));
}

export function buildProof(): fc.IAsyncProperty<[DemoPackageCase, ProofLoadDraw]> {
  return fc.asyncProperty(demoPackageArb, proofLoadArb, async (pkg, draw) => checkProof(pkg, draw));
}

export function buildView(): fc.IAsyncProperty<[ProofReport]> {
  return fc.asyncProperty(proofReportArb, async (r) => checkProofView(r));
}
