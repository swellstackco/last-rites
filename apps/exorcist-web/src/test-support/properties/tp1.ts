// Property TP1 (toe-tag-polish, T1): the Proof_Report of a demo package is requested for every grade and shown
// whenever it is valid, whether it arrives before or after the panel opens. Without a readable report an ailing or
// alive panel has no Proof_Section and no placeholder; a dead or dying panel is exactly as before.
import fc from "fast-check";
import { serializeReport } from "@last-rites/exorcist-npm/report";
import { COPY } from "../../constants.js";
import { demoPackageArb, proofLoadArb } from "../arbitraries.js";
import type { DemoPackageCase, ProofLoadDraw } from "../arbitraries.js";
import { mountPage } from "../dom-harness.js";
import type { Page } from "../dom-harness.js";
import type { ToeMutate } from "../sabotage/toe.js";
import { proofFacts } from "../toe-facts.js";
import { expectedProofFacts, proofRoute } from "./tt2.js";

export class TP1Failure extends Error {}
const fail = (message: string): never => {
  throw new TP1Failure(message);
};
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const proofCalls = (page: Page): string[] => page.fake.calls.filter((c) => c.url.includes("/demo/proofs/")).map((c) => `${c.method} ${c.url}`);

const expandAlive = (doc: Document): void => {
  const button = doc.querySelector<HTMLElement>("button.disclosure[aria-controls='alive-list']");
  if (button && button.getAttribute("aria-expanded") !== "true") button.click();
};

const openTag = (page: Page, name: string): void => {
  const opener = page.document.querySelector<HTMLElement>(`button.tombstone[data-key='${name}']`);
  if (!opener) fail(`no tombstone for ${name}`);
  page.click(opener!);
};

export async function checkProofAnyGrade(pkg: DemoPackageCase, draw: ProofLoadDraw, mutate?: ToeMutate): Promise<void> {
  const { name, grade } = pkg;
  const late = grade === "ailing" || grade === "alive";
  const url = `/demo/proofs/pump/${name}.json`;
  const page = mountPage({ route: "#/demo/pump", fetchRoutes: { "GET /api/demo/pump": { body: serializeReport(pkg.report) } } });
  const ctx = (phase: "pending" | "final") => ({
    report: pkg.report,
    openName: name,
    grade,
    order: draw.order,
    phase,
    proofCase: draw.load.kind,
    calls: page.fake.calls,
    ...(draw.load.kind === "report" ? { proof: draw.load.report } : {}),
  });
  try {
    const held = draw.order === "after" ? page.fake.hold(`GET ${url}`) : undefined;
    if (!held) page.fake.on(`GET ${url}`, proofRoute(draw.load));
    await page.flush();
    expandAlive(page.document);
    openTag(page, name);
    await page.flush();

    let sheetTag: Element | null = null;
    if (held) {
      // The request is pending: an ailing or alive panel has no section; a dead or dying one shows the loading line.
      mutate?.(page.document, ctx("pending"));
      const section = page.document.querySelector("section.proof");
      if (late && section) fail(`pending ${grade} panel has a Proof_Section: ${section.textContent}`);
      if (!late && !(section?.textContent ?? "").includes(COPY.proofLoading)) fail(`pending ${grade} panel shows no loading line`);
      sheetTag = page.document.querySelector(".sheet-tag");
      held.resolve(proofRoute(draw.load));
      await page.flush();
    } else {
      page.press("Escape");
      await page.flush();
      openTag(page, name);
      await page.flush();
    }

    mutate?.(page.document, ctx("final"));
    const calls = proofCalls(page);
    if (calls.length !== 1) fail(`expected one proof request for ${name}, got ${JSON.stringify(calls)}`);
    if (!calls[0]!.endsWith(url)) fail(`wrong proof url ${calls[0]}`);

    const actual = proofFacts(page.document.body);
    const text = page.document.querySelector(".sheet")?.textContent ?? "";
    if (draw.load.kind === "report") {
      const want = expectedProofFacts(draw.load);
      if (actual === null) fail(`no Proof_Section for a valid report at grade ${grade}`);
      if (!same(actual, want)) fail(`proof facts differ from the report's:\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(want)}`);
    } else if (late) {
      if (actual !== null) fail(`${draw.load.kind} report at grade ${grade} shows a Proof_Section`);
      if (text.includes(COPY.exorcismComing) || text.includes(COPY.proofLoading)) fail(`${grade} panel shows a proof placeholder`);
    } else {
      const want = expectedProofFacts(draw.load);
      if (!same(actual, want)) fail(`${grade} proof facts changed:\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(want)}`);
    }
    if (sheetTag && page.document.querySelector(".sheet-tag") !== sheetTag) fail("the .sheet-tag was rebuilt when the proof arrived");
  } finally {
    page.destroy();
  }
}

/** A live scan never requests a proof, whatever the grades. */
export async function checkLiveNoProof(pkg: DemoPackageCase, mutate?: ToeMutate): Promise<void> {
  const page = mountPage({ fetchRoutes: { "POST /api/scan": { body: serializeReport(pkg.report) } } });
  try {
    await page.flush();
    const input = page.document.querySelector<HTMLInputElement>("#live-repo")!;
    input.value = "owner/name";
    page.document.querySelector("form.live-form")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await page.flush();
    expandAlive(page.document);
    openTag(page, pkg.name);
    await page.flush();
    mutate?.(page.document, { report: pkg.report, openName: pkg.name, grade: pkg.grade, phase: "final", calls: page.fake.calls });
    const calls = proofCalls(page);
    if (calls.length > 0) fail(`a live scan requested proofs: ${JSON.stringify(calls)}`);
    if (page.document.querySelector("section.proof") && pkg.grade !== "dead" && pkg.grade !== "dying") fail("live panel shows a Proof_Section");
  } finally {
    page.destroy();
  }
}

export function build(mutate?: ToeMutate): fc.IAsyncProperty<[DemoPackageCase, ProofLoadDraw]> {
  return fc.asyncProperty(demoPackageArb, proofLoadArb, async (pkg, draw) => {
    await checkProofAnyGrade(pkg, draw, mutate);
  });
}

export function buildLive(mutate?: ToeMutate): fc.IAsyncProperty<[DemoPackageCase]> {
  return fc.asyncProperty(demoPackageArb, async (pkg) => {
    await checkLiveNoProof(pkg, mutate);
  });
}
