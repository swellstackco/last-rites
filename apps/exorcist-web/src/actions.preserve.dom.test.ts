// @vitest-environment jsdom
// graveyard-ui-actions 2.2: preservation baseline (Properties 3 and 7). Everything here PASSES on the unfixed code
// and must stay green. The pure `proofNameFor` half of Property 3 is in names.actions.test.ts. No network.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseProofReport } from "@last-rites/skeleton/proof";
import { parseReport } from "@last-rites/exorcist-npm/report";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import { build as p3, proofUrlsFor } from "./test-support/properties/p-actions-3.js";
import { buildProof, buildScan, buildView, checkPageFacts } from "./test-support/properties/p-actions-7.js";

const demoDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "demo");
const read = (path: string): string => readFileSync(join(demoDir, path), "utf8");
function demo(name: string) {
  const parsed = parseReport(read(`${name}.json`));
  if (!parsed.ok) throw new Error(`${name} does not parse`);
  return parsed.report;
}
const none = (r: Awaited<ReturnType<typeof checkAsyncProperty>>): string => (r === undefined ? "" : formatAsyncReport(r));

describe("Property 3: npm proof paths are unchanged", () => {
  it("every opened npm name requests the reference path, scoped names none", async () => {
    expect(none(await checkAsyncProperty("Property 3: npm proof paths", p3()))).toBe("");
  }, 120_000);

  it("parse-server: the three committed reports are requested, a scoped name is not", async () => {
    const report = demo("parse-server");
    const scoped = "@babel/plugin-proposal-object-rest-spread";
    expect(report.dependencies.some((d) => d.name === scoped)).toBe(true);
    const urls = await proofUrlsFor(report, "parse-server", ["deep-diff", "intersect", "node-abort-controller", scoped]);
    expect(urls).toEqual([
      "/demo/proofs/parse-server/deep-diff.json",
      "/demo/proofs/parse-server/intersect.json",
      "/demo/proofs/parse-server/node-abort-controller.json",
    ]);
  }, 60_000);
});

describe("Property 7: npm pages render as before", () => {
  it("facts equal the Reference_Views for arbitrary npm reports", async () => {
    expect(none(await checkAsyncProperty("Property 7: scan facts", buildScan()))).toBe("");
  }, 120_000);

  it("facts equal the Reference_Views for every proof state of a demo package", async () => {
    expect(none(await checkAsyncProperty("Property 7: proof facts", buildProof()))).toBe("");
  }, 180_000);

  it("the proof view keeps every field it has today", async () => {
    expect(none(await checkAsyncProperty("Property 7: proof view", buildView()))).toBe("");
  }, 60_000);

  for (const name of ["parse-server", "prettier", "jest", "pump"]) {
    it(`the committed ${name} demo: header, groups and its first dead and first alive package`, async () => {
      const report = demo(name);
      const pick = (grade: string) => report.dependencies.find((d) => d.death.grade === grade)?.name;
      for (const key of [pick("dead"), pick("alive"), report.dependencies[0]?.name]) {
        if (key !== undefined) await checkPageFacts(report, key, name, () => {}, undefined);
      }
    }, 60_000);
  }

  for (const file of ["deep-diff", "intersect", "node-abort-controller"]) {
    it(`parse-server/${file}: the proof state equals the Reference_Views`, async () => {
      const parsed = parseProofReport(read(`proofs/parse-server/${file}.json`));
      if (!parsed.ok) throw new Error(`${file} does not parse`);
      const load = { kind: "report" as const, report: parsed.report };
      await checkPageFacts(
        demo("parse-server"),
        file,
        "parse-server",
        (page) => page.fake.on(`GET /demo/proofs/parse-server/${file}.json`, { body: read(`proofs/parse-server/${file}.json`) }),
        load,
      );
    }, 60_000);
  }
});
