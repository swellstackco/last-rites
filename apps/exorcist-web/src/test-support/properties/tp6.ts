// Property TP6 (toe-tag-polish): preservation. Everything the fix does not target shows the same Rendered_Facts
// as the frozen Reference_Renderer (views-v3, today's views), for the report page, the open panel with every
// proof state, and the Repo_Picker. The allowed differences are listed in ALLOWED; the list starts empty and is
// extended only by the group that makes the difference on purpose.
import fc from "fast-check";
import { buildProofView } from "@graveyard-kit/skeleton/graveyard";
import { serializeReport } from "@graveyard-kit/exorcist-npm/report";
import type { ScanReport } from "@graveyard-kit/exorcist-npm/report";
import { demoPackageArb, openPackageArb, proofLoadArb } from "../arbitraries.js";
import type { DemoPackageCase, ProofLoadDraw } from "../arbitraries.js";
import { mountPage } from "../dom-harness.js";
import type { ToeMutate } from "../sabotage/toe.js";
import { renderReferenceV3Facts, renderReferenceV3Picker } from "../toe-reference-v3.js";
import type { ProofShown } from "../toe-reference-v3.js";
import { pickerFacts, toeFacts } from "../toe-facts.js";
import { toeScanReportArb } from "./tt1.js";
import { proofRoute } from "./tt2.js";

export class TP6Failure extends Error {}
const fail = (message: string): never => {
  throw new TP6Failure(message);
};
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Differences from the v3 views that a fix group made on purpose. Extended group by group. */
export const ALLOWED: readonly string[] = ["proof-any-grade", "home-masthead"];

export type TP6Case =
  | { kind: "scan"; report: ScanReport; index: number }
  | { kind: "proof"; pkg: DemoPackageCase; draw: ProofLoadDraw }
  | { kind: "picker"; live: boolean };

const clickAlive = (doc: Document): void => {
  const button = doc.querySelector<HTMLElement>("button.disclosure[aria-controls='alive-list']");
  if (button && button.getAttribute("aria-expanded") !== "true") button.click();
};

function shownFor(draw: ProofLoadDraw): ProofShown {
  const load = draw.load;
  if (load.kind === "report") return { state: { status: "report", view: buildProofView(load.report) } };
  return load.kind === "invalid" ? { state: { status: "coming_soon" }, unreadable: true } : { state: { status: "coming_soon" } };
}

async function checkScan(report: ScanReport, index: number, mutate?: ToeMutate): Promise<void> {
  const dep = report.dependencies[index % report.dependencies.length]!;
  const page = mountPage({ route: "#/demo/x", fetchRoutes: { "GET /api/demo/x": { body: serializeReport(report) } } });
  try {
    await page.flush();
    clickAlive(page.document);
    const opener = Array.from(page.document.querySelectorAll<HTMLElement>("button.tombstone")).find((t) => t.getAttribute("data-key") === dep.name);
    if (!opener) fail(`no tombstone for ${dep.name}`);
    page.click(opener!);
    mutate?.(page.document, { report, openName: dep.name });
    const actual = { ...toeFacts(page.document.body), proof: null };
    const reference = { ...renderReferenceV3Facts(report, dep.name), proof: null };
    if (!same(actual, reference)) fail(`facts differ from the v3 views:\nactual=${JSON.stringify(actual)}\nreference=${JSON.stringify(reference)}`);
  } finally {
    page.destroy();
  }
}

async function checkProof(pkg: DemoPackageCase, draw: ProofLoadDraw, mutate?: ToeMutate): Promise<void> {
  const route = `GET /demo/proofs/pump/${pkg.name}.json`;
  const page = mountPage({ route: "#/demo/pump", fetchRoutes: { "GET /api/demo/pump": { body: serializeReport(pkg.report) } } });
  try {
    page.fake.on(route, proofRoute(draw.load));
    await page.flush();
    clickAlive(page.document);
    const open = (): void => {
      const opener = page.document.querySelector<HTMLElement>(`button.tombstone[data-key='${pkg.name}']`);
      if (!opener) fail(`no tombstone for ${pkg.name}`);
      page.click(opener!);
    };
    open();
    await page.flush();
    if (draw.order === "before") {
      page.press("Escape");
      await page.flush();
      open();
      await page.flush();
    }
    mutate?.(page.document, {
      report: pkg.report,
      openName: pkg.name,
      proofCase: draw.load.kind,
      ...(draw.load.kind === "report" ? { proof: draw.load.report } : {}),
    });
    const actual = toeFacts(page.document.body);
    const reference = renderReferenceV3Facts(pkg.report, pkg.name, shownFor(draw));
    const lateGrade = pkg.grade === "ailing" || pkg.grade === "alive";
    if (lateGrade && draw.load.kind === "report" && ALLOWED.includes("proof-any-grade")) {
      if (!same({ ...actual, proof: null }, { ...reference, proof: null })) fail("facts other than the proof differ from the v3 views");
      return;
    }
    if (!same(actual, reference)) fail(`facts differ from the v3 views:\nactual=${JSON.stringify(actual)}\nreference=${JSON.stringify(reference)}`);
  } finally {
    page.destroy();
  }
}

async function checkPicker(live: boolean, mutate?: ToeMutate): Promise<void> {
  // A live route never starts a scan: it shows the picker with the prefill and a notice.
  const page = mountPage({ route: live ? "#/live?repo=owner/name&ref=main" : "" });
  try {
    await page.flush();
    mutate?.(page.document, {});
    const actual = pickerFacts(page.document.body);
    const reference = renderReferenceV3Picker(
      live ? { repo: "owner/name", ref: "main" } : undefined,
      live ? (actual.notice ?? undefined) : undefined,
    );
    if (live && actual.notice === null) fail("a live route shows no notice");
    if (!same(actual, reference)) fail(`picker facts differ from the v3 views:\nactual=${JSON.stringify(actual)}\nreference=${JSON.stringify(reference)}`);
  } finally {
    page.destroy();
  }
}

export async function checkCase(c: TP6Case, mutate?: ToeMutate): Promise<void> {
  if (c.kind === "scan") await checkScan(c.report, c.index, mutate);
  else if (c.kind === "proof") await checkProof(c.pkg, c.draw, mutate);
  else await checkPicker(c.live, mutate);
}

export const tp6CaseArb: fc.Arbitrary<TP6Case> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("scan" as const), report: toeScanReportArb, index: openPackageArb }) },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant("proof" as const), pkg: demoPackageArb, draw: proofLoadArb }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("picker" as const), live: fc.boolean() }) },
);

export function build(mutate?: ToeMutate): fc.IAsyncProperty<[TP6Case]> {
  return fc.asyncProperty(tp6CaseArb, async (c) => {
    await checkCase(c, mutate);
  });
}
