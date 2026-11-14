// @vitest-environment jsdom
// graveyard-ui-actions 1.3: B2 exploratory tests (Property 5). The github-actions half FAILS on the unfixed
// header (it shows the npm sentence); the npm half PASSES. No network.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseReport } from "@last-rites/exorcist-npm/report";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import { ACTIONS_NOTE, NPM_SENTENCE, build as p5, headerOf } from "./test-support/properties/p-actions-5.js";

const demo = (name: string): string =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "demo", `${name}.json`), "utf8");

async function headerOfDemo(name: string): ReturnType<typeof headerOf> {
  const parsed = parseReport(demo(name));
  if (!parsed.ok) throw new Error(`${name} does not parse`);
  return headerOf(parsed.report);
}

describe("Property 5: the Lockfile_Note follows the ecosystem (B2)", () => {
  it("github-actions reports show the uses: note exactly when all versions are ranges", async () => {
    const report = await checkAsyncProperty("Property 5: actions note", p5({ actions: true, npm: false }));
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, 60_000);

  it("npm reports keep the npm sentence exactly when all versions are ranges", async () => {
    const report = await checkAsyncProperty("Property 5: npm note", p5({ actions: false, npm: true }));
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, 60_000);

  it("the committed nixpacks demo shows the uses: note and no npm sentence", async () => {
    const { text, notes } = await headerOfDemo("nixpacks-actions");
    expect(text).not.toContain("package-lock.json");
    expect(notes).toEqual([ACTIONS_NOTE]);
  });

  it("the committed jest demo keeps the npm sentence", async () => {
    expect((await headerOfDemo("jest")).notes).toEqual([NPM_SENTENCE]);
  });
});
