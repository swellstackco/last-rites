// @vitest-environment jsdom
// toe-tag-redesign 7.4: the Compare_Box wraps the Old and New cells; order, labels and text are unchanged.
import { afterEach, describe, expect, it } from "vitest";
import { serializeReport } from "@graveyard-kit/exorcist-npm/report";
import { buildProofText } from "./test-support/build-proof-report.js";
import { buildReport } from "./test-support/build-report.js";
import { mountPage } from "./test-support/dom-harness.js";
import type { Page } from "./test-support/dom-harness.js";
import { DYING_SIGNALS } from "./test-support/signals.js";

let page: Page | undefined;
afterEach(() => page?.destroy());

const report = buildReport([
  { name: "gone", signals: { ...DYING_SIGNALS, deprecated: { kind: "known", value: true }, repoArchived: { kind: "known", value: true } } },
]);

async function proofSection(): Promise<HTMLElement> {
  page = mountPage({
    route: "#/demo/pump",
    fetchRoutes: {
      "GET /api/demo/pump": { body: serializeReport(report) },
      "GET /demo/proofs/pump/gone.json": { body: buildProofText("counterexample") },
    },
  });
  await page.flush();
  page.click(page.document.querySelector<HTMLElement>('[data-key="gone"]') as HTMLElement);
  await page.flush();
  return page.dialogRoot.querySelector<HTMLElement>("section.proof") as HTMLElement;
}

describe("Compare_Box DOM", () => {
  it("keeps the order input, old, new and wraps only old and new", async () => {
    const proof = await proofSection();
    const pres = Array.from(proof.querySelectorAll("pre.proof-pre"));
    expect(pres.map((p) => p.previousElementSibling?.textContent)).toEqual(["Shrunk input", "Old output", "New output"]);
    expect(pres.map((p) => p.textContent)).toEqual(['[["a","a"],["a"]]', '["a"]', '["a","a"]']);
    const box = proof.querySelector(".proof-compare") as HTMLElement;
    expect(Array.from(box.children).map((c) => c.className)).toEqual(["stack proof-cell", "stack proof-cell proof-cell-new"]);
    expect(Array.from(box.querySelectorAll("pre"))).toEqual(pres.slice(1));
    const input = pres[0] as HTMLElement;
    expect(box.contains(input)).toBe(false);
    expect(input.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const p of pres) expect(p.getAttribute("tabindex")).toBe("0");
  });

  it("has no anchors in the proof section", async () => {
    const proof = await proofSection();
    expect(proof.querySelectorAll("a")).toHaveLength(0);
  });
});
