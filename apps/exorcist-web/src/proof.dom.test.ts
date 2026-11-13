// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { serializeReport } from "@graveyard-kit/exorcist-npm/report";
import { buildProofText } from "./test-support/build-proof-report.js";
import type { ProofKind } from "./test-support/build-proof-report.js";
import { buildReport } from "./test-support/build-report.js";
import { mountPage } from "./test-support/dom-harness.js";
import type { Page } from "./test-support/dom-harness.js";
import { ALIVE_SIGNALS, DYING_SIGNALS } from "./test-support/signals.js";

let page: Page | undefined;
afterEach(() => page?.destroy());

// dead: all signals bad and deprecated (calibrated floor); dying: DYING_SIGNALS (50);
// ailing: dying signals with fewer bad parts; alive: ALIVE_SIGNALS.
const report = buildReport([
  {
    name: "gone",
    signals: { ...DYING_SIGNALS, deprecated: { kind: "known", value: true }, repoArchived: { kind: "known", value: true } },
  },
  { name: "sick", signals: DYING_SIGNALS },
  { name: "meh", signals: { ...DYING_SIGNALS, monthsSinceLastCommit: { kind: "known", value: 0 }, openVulnsNoFix: { kind: "known", value: 0 } } },
  { name: "well", signals: ALIVE_SIGNALS },
]);

const PROOF_404 = {
  "GET /demo/proofs/pump/gone.json": { status: 404, body: "not found" },
  "GET /demo/proofs/pump/sick.json": { status: 404, body: "not found" },
};

async function mount(proofs: Record<string, { status?: number; body?: unknown }> = PROOF_404): Promise<Page> {
  page = mountPage({
    route: "#/demo/pump",
    fetchRoutes: { "GET /api/demo/pump": { body: serializeReport(report) }, ...proofs },
  });
  await page.flush();
  return page;
}

function openPanel(p: Page, key: string): HTMLElement {
  if (!p.document.querySelector(`[data-key="${key}"]`)) {
    p.click(p.document.querySelector<HTMLElement>("[aria-controls='alive-list']") as HTMLElement); // expand the alive group
  }
  p.click(p.document.querySelector<HTMLElement>(`[data-key="${key}"]`) as HTMLElement);
  return p.dialogRoot.querySelector<HTMLElement>('[role="dialog"]') as HTMLElement;
}

const proofOf = (panel: HTMLElement): HTMLElement | null => panel.querySelector<HTMLElement>("section.proof");

describe("Proof slot (DOM)", () => {
  it("the synthetic grades are what the tests assume", () => {
    const grades = Object.fromEntries(report.dependencies.map((d) => [d.name, d.death.grade]));
    expect(grades).toEqual({ gone: "dead", sick: "dying", meh: "ailing", well: "alive" });
  });

  it("a dead Grave shows 'Exorcism coming' and a focusable aria-disabled control that does nothing", async () => {
    const p = await mount();
    const panel = openPanel(p, "gone");
    await p.flush();
    const callsBefore = p.fake.calls.length;
    const proof = proofOf(panel) as HTMLElement;
    expect(proof.textContent).toContain("Exorcism coming");
    const control = proof.querySelector<HTMLElement>("button") as HTMLElement;
    expect(control.getAttribute("aria-disabled")).toBe("true");
    expect(control.hasAttribute("disabled")).toBe(false);
    expect(control.getAttribute("aria-describedby")).toBeTruthy();

    control.focus();
    expect(p.active()).toBe(control);
    const before = panel.innerHTML;
    p.click(control);
    p.press("Enter");
    p.press(" ");
    await p.flush();
    expect(panel.innerHTML).toBe(before);
    expect(p.dialogRoot.querySelector('[role="dialog"]')).toBe(panel);
    expect(p.fake.calls.length).toBe(callsBefore);
    p.fake.assertNoUnexpected();
  });

  it("a dying Grave shows the Proof section", async () => {
    const p = await mount();
    const panel = openPanel(p, "sick");
    await p.flush();
    expect(proofOf(panel)?.textContent).toContain("Exorcism coming");
  });

  it("ailing and alive Graves show no Proof section", async () => {
    const p = await mount();
    expect(proofOf(openPanel(p, "meh"))).toBeNull();
    p.press("Escape");
    expect(proofOf(openPanel(p, "well"))).toBeNull();
  });

  // ---- a loaded proof report ---------------------------------------------------------------

  const KINDS: Array<[ProofKind, string]> = [
    ["proved", "Proved"],
    ["weak", "Weak"],
    ["counterexample", "Counterexample"],
    ["no_call_sites", "No call sites"],
    ["error", "Proof error"],
  ];

  async function withProof(kind: ProofKind, history: readonly ProofKind[] = [], callSites?: number): Promise<HTMLElement> {
    const text = buildProofText(kind, callSites === undefined ? {} : { callSites }, history);
    const p = await mount({ "GET /demo/proofs/pump/gone.json": { body: text } });
    const panel = openPanel(p, "gone");
    await p.flush();
    return proofOf(panel) as HTMLElement;
  }

  it.each(KINDS)("shows the %s badge as text", async (kind, label) => {
    const proof = await withProof(kind);
    const badge = proof.querySelector<HTMLElement>(".proof-badge") as HTMLElement;
    expect(badge.textContent).toBe(label);
    expect(badge.classList.contains(`proof-badge-${kind}`)).toBe(true);
    expect(proof.querySelector("h3")?.textContent).toBe("Proof");
    expect(proof.textContent).not.toContain("Exorcism coming");
  });

  it("shows runs and seed, the sabotage line and the call sites as file:line", async () => {
    const proof = await withProof("proved");
    expect(proof.textContent).toContain("400 runs, seed 1235");
    expect(proof.textContent).toContain("Sabotage: 4 of 4 broken migrations caught");
    const items = Array.from(proof.querySelectorAll(".proof-sites li")).map((li) => li.textContent);
    expect(items).toEqual(["src/file-0.js:1 (src)", "src/file-1.js:2 (test)"]);
  });

  it("shows the weak sabotage line", async () => {
    const proof = await withProof("weak");
    expect(proof.textContent).toContain("Sabotage: 3 of 4 broken migrations caught");
  });

  it("lists attempts in order", async () => {
    const proof = await withProof("proved", ["counterexample", "error"]);
    const attempts = Array.from(proof.querySelectorAll(".proof-attempts > li"));
    expect(attempts.map((li) => li.querySelector(".proof-badge")?.textContent)).toEqual([
      "Counterexample",
      "Proof error",
      "Proved",
    ]);
    expect(attempts.map((li) => /Attempt (\d)/.exec(li.textContent ?? "")?.[1])).toEqual(["1", "2", "3"]);
  });

  it("shows the counterexample as three labelled pre blocks", async () => {
    const proof = await withProof("counterexample");
    const pres = Array.from(proof.querySelectorAll("pre")).map((pre) => [
      pre.previousElementSibling?.textContent,
      pre.textContent,
    ]);
    expect(pres).toEqual([
      ["Shrunk input", '[["a","a"],["a"]]'],
      ["Old output", '["a"]'],
      ["New output", '["a","a"]'],
    ]);
    expect(proof.textContent).toContain("Shrunk counterexample");
  });

  it("shows the recommendation for no call sites", async () => {
    const proof = await withProof("no_call_sites");
    expect(proof.textContent).toContain("Remove the dependency");
  });

  it("shows the error code and message", async () => {
    const proof = await withProof("error");
    expect(proof.textContent).toContain("no_recipe: no recipe for this package");
  });

  it("51 call sites show 50 and 'and 1 more'", async () => {
    const proof = await withProof("proved", [], 51);
    const items = Array.from(proof.querySelectorAll(".proof-sites li")).map((li) => li.textContent);
    expect(items).toHaveLength(51);
    expect(items[50]).toBe("and 1 more");
  });
});
