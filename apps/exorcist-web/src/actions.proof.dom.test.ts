// @vitest-environment jsdom
// graveyard-ui-actions 1.1: B1 exploratory tests (Property 1). They FAIL on the unfixed page (the proof of an
// action is never requested) and stay as regression tests. No network.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parseReport } from "@last-rites/exorcist-npm/report";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import type { Page } from "./test-support/dom-harness.js";
import { build as p1, mountActions, openPackage, proofSectionText, proofUrls } from "./test-support/properties/p-actions-1.js";

/** Test-only model of actionProofName with node:crypto (independent of the code under test). */
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export const modelName = (name: string): string => {
  const lower = name.toLowerCase();
  return `${slug(lower).slice(0, 55) || "x"}-${createHash("sha256").update(lower).digest("hex").slice(0, 8)}`;
};

const demoDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "demo");
const read = (path: string): string => readFileSync(join(demoDir, path), "utf8");
const CHECKOUT = "actions-checkout-728eabd6";
const TOOLCHAIN = "actions-rs-toolchain-a103c84e";

let page: Page | undefined;
afterEach(() => page?.destroy());

describe("Property 1: proofs of github-actions demos are found (B1)", () => {
  it("the model reproduces the two committed names", () => {
    expect(modelName("actions/checkout")).toBe(CHECKOUT);
    expect(modelName("actions-rs/toolchain")).toBe(TOOLCHAIN);
  });

  it("every action with a report shows it, and each name is requested once", async () => {
    const report = await checkAsyncProperty("Property 1: action proofs", p1(modelName));
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, 120_000);

  for (const [action, file] of [
    ["actions-rs/toolchain", TOOLCHAIN],
    ["actions/checkout", CHECKOUT],
  ] as const) {
    it(`${action} shows Proved from the committed demo file`, async () => {
      const snapshot = parseReport(read("nixpacks-actions.json"));
      if (!snapshot.ok) throw new Error("demo/nixpacks-actions.json does not parse");
      page = mountActions(snapshot.report, { [file]: read(`proofs/nixpacks-actions/${file}.json`) });
      await page.flush();
      await openPackage(page, action);
      expect(proofUrls(page)).toEqual([`/demo/proofs/nixpacks-actions/${file}.json`]);
      expect(proofSectionText(page)).toContain("Proved");
      expect(proofSectionText(page)).not.toContain("Exorcism coming");
      expect(proofSectionText(page)).toMatch(/Sabotage: \d+ of \d+ broken migrations caught/);
    });
  }
});
