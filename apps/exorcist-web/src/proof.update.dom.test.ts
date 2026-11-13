// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { serializeReport } from "@graveyard-kit/exorcist-npm/report";
import { COPY } from "./constants.js";
import { buildProofText } from "./test-support/build-proof-report.js";
import { buildReport } from "./test-support/build-report.js";
import { mountPage } from "./test-support/dom-harness.js";
import type { Page } from "./test-support/dom-harness.js";
import type { FakeHandler } from "./test-support/fake-fetch.js";
import { DYING_SIGNALS } from "./test-support/signals.js";

let page: Page | undefined;
afterEach(() => page?.destroy());

const report = buildReport([
  { name: "gone", signals: { ...DYING_SIGNALS, deprecated: { kind: "known", value: true }, repoArchived: { kind: "known", value: true } } },
  { name: "sick", signals: DYING_SIGNALS },
]);

function mount(routes: Record<string, FakeHandler>): Page {
  page = mountPage({
    route: "#/demo/pump",
    fetchRoutes: { "GET /api/demo/pump": { body: serializeReport(report) }, ...routes },
  });
  return page;
}

const panelOf = (p: Page): HTMLElement => p.dialogRoot.querySelector<HTMLElement>('[role="dialog"]') as HTMLElement;
const proofOf = (p: Page): HTMLElement => panelOf(p).querySelector<HTMLElement>("section.proof") as HTMLElement;

async function open(p: Page, key: string): Promise<void> {
  await p.flush();
  p.click(p.document.querySelector<HTMLElement>(`[data-key="${key}"]`) as HTMLElement);
}

describe("the Proof_Section updates in place", () => {
  it("opens with the loading line, then only the Proof_Section content changes", async () => {
    const p = mount({});
    const held = p.fake.hold("GET /demo/proofs/pump/gone.json");
    await open(p, "gone");
    await p.flush();
    const panel = panelOf(p);
    const section = proofOf(p);
    expect(section.textContent).toContain(COPY.proofLoading);
    expect(section.textContent).not.toContain("Exorcism coming");

    const outside = Array.from(panel.children).filter((c) => !c.contains(section) && c !== section).map((c) => c.outerHTML);
    const closeButton = panel.querySelector<HTMLElement>("button") as HTMLElement;
    closeButton.focus();
    expect(p.active()).toBe(closeButton);
    const hashBefore = p.hash();

    held.resolve({ body: buildProofText("proved") });
    await p.flush();

    expect(panelOf(p)).toBe(panel);
    expect(proofOf(p)).toBe(section);
    expect(section.textContent).not.toContain(COPY.proofLoading);
    expect(section.querySelector(".proof-badge")?.textContent).toBe("Proved");
    expect(p.active()).toBe(closeButton);
    expect(p.hash()).toBe(hashBefore);
    expect(panel.hidden).toBe(false);
    const outsideAfter = Array.from(panel.children).filter((c) => !c.contains(section) && c !== section).map((c) => c.outerHTML);
    expect(outsideAfter).toEqual(outside);
  });

  it("an absent report falls back to 'Exorcism coming'", async () => {
    const p = mount({ "GET /demo/proofs/pump/gone.json": { status: 404, body: "not found" } });
    await open(p, "gone");
    await p.flush();
    expect(proofOf(p).textContent).toContain("Exorcism coming");
    expect(proofOf(p).textContent).not.toContain(COPY.proofUnreadable);
  });

  it("a failed request falls back to 'Exorcism coming'", async () => {
    const p = mount({ "GET /demo/proofs/pump/gone.json": { status: 500, body: "boom" } });
    await open(p, "gone");
    await p.flush();
    expect(proofOf(p).textContent).toContain("Exorcism coming");
    expect(proofOf(p).textContent).not.toContain(COPY.proofLoading);
    expect(proofOf(p).textContent).not.toContain(COPY.proofUnreadable);
  });

  it("an unreadable report adds the muted unreadable line", async () => {
    const p = mount({ "GET /demo/proofs/pump/gone.json": { body: '{"repo":"x"}' } });
    await open(p, "gone");
    await p.flush();
    const section = proofOf(p);
    expect(section.textContent).toContain("Exorcism coming");
    const line = Array.from(section.querySelectorAll("p")).find((el) => el.textContent === COPY.proofUnreadable);
    expect(line?.classList.contains("muted")).toBe(true);
  });

  it("a proof for another package that arrives late is ignored", async () => {
    const p = mount({ "GET /demo/proofs/pump/sick.json": { status: 404, body: "not found" } });
    const heldGone = p.fake.hold("GET /demo/proofs/pump/gone.json");
    await open(p, "gone");
    await p.flush();
    p.press("Escape");
    await p.flush();
    p.click(p.document.querySelector<HTMLElement>('[data-key="sick"]') as HTMLElement);
    await p.flush();
    expect(panelOf(p).textContent).toContain("sick");
    expect(proofOf(p).textContent).toContain("Exorcism coming");
    const before = panelOf(p).innerHTML;

    heldGone.resolve({ body: buildProofText("proved") });
    await p.flush();

    expect(panelOf(p).innerHTML).toBe(before);
    expect(proofOf(p).querySelector(".proof-badge")).toBeNull();

    // Reopening the first package shows the proof that did arrive.
    p.press("Escape");
    p.click(p.document.querySelector<HTMLElement>('[data-key="gone"]') as HTMLElement);
    await p.flush();
    expect(proofOf(p).querySelector(".proof-badge")?.textContent).toBe("Proved");
  });
});
