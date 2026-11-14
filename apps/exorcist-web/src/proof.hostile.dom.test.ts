// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { serializeReport } from "@last-rites/exorcist-npm/report";
import { buildProofText, HOSTILE_STRINGS } from "./test-support/build-proof-report.js";
import type { ProofKind } from "./test-support/build-proof-report.js";
import { buildReport } from "./test-support/build-report.js";
import { mountPage } from "./test-support/dom-harness.js";
import type { Page } from "./test-support/dom-harness.js";
import { DYING_SIGNALS } from "./test-support/signals.js";

let page: Page | undefined;
afterEach(() => page?.destroy());

const report = buildReport([
  { name: "gone", signals: { ...DYING_SIGNALS, deprecated: { kind: "known", value: true }, repoArchived: { kind: "known", value: true } } },
]);

const KINDS: ProofKind[] = ["proved", "weak", "counterexample", "no_call_sites", "error"];

// The elements the proof view itself creates (views/proof-slot.ts) and nothing else.
const ALLOWED = new Set(["DIV", "P", "SPAN", "BUTTON", "STRONG", "DETAILS", "SUMMARY", "UL", "OL", "LI", "H3", "H4", "PRE"]);

async function mountWith(kind: ProofKind, hostile: string, history: readonly ProofKind[]): Promise<HTMLElement> {
  const text = buildProofText(kind, { hostile, importSites: 1 }, history);
  page = mountPage({
    route: "#/demo/pump",
    fetchRoutes: { "GET /api/demo/pump": { body: serializeReport(report) }, "GET /demo/proofs/pump/gone.json": { body: text } },
  });
  await page.flush();
  page.click(page.document.querySelector<HTMLElement>('[data-key="gone"]') as HTMLElement);
  await page.flush();
  return page.dialogRoot.querySelector<HTMLElement>("section.proof") as HTMLElement;
}

describe("hostile proof strings render as text", () => {
  for (const hostile of HOSTILE_STRINGS) {
    it.each(KINDS)(`${hostile} in a %s report`, async (kind) => {
      const proof = await mountWith(kind, hostile, kind === "proved" ? ["counterexample", "error", "weak"] : []);
      expect(proof.querySelector(".proof-badge")).not.toBeNull(); // the report really was shown
      expect(proof.querySelector("a")).toBeNull();
      expect(proof.querySelector("img, script, iframe, object, embed, b, style")).toBeNull();
      for (const el of Array.from(proof.querySelectorAll("*"))) {
        expect(ALLOWED.has(el.tagName), `unexpected <${el.tagName}>`).toBe(true);
        for (const attr of Array.from(el.attributes)) {
          expect(attr.name.startsWith("on")).toBe(false);
          expect(attr.value).not.toContain(hostile);
        }
      }
    });
  }

  it("the hostile text itself is present as text in the counterexample blocks", async () => {
    const hostile = HOSTILE_STRINGS[0];
    const proof = await mountWith("counterexample", hostile, []);
    const pres = Array.from(proof.querySelectorAll("pre")).map((pre) => pre.textContent);
    expect(pres).toEqual([hostile, hostile, hostile]);
  });

  it("views/proof-slot.ts never assigns innerHTML or inserts markup", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "views", "proof-slot.ts"), "utf8");
    expect(source).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|createContextualFragment|DOMParser/);
  });
});
