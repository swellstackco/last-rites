// @vitest-environment jsdom
// graveyard-ui-polish: fix checking (DOM half of Property 9). Never touches the network (fake fetch).
import { describe, expect, it } from "vitest";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import { build as p9 } from "./test-support/properties/p9.js";
import type { Part } from "./test-support/properties/p9.js";

const run = async (part: Part): Promise<string> => {
  const report = await checkAsyncProperty(`Property 9 (${part})`, p9([part]));
  return report === undefined ? "" : formatAsyncReport(report);
};

describe("Property 9: fix checking (DOM)", () => {
  it("D3: exactly one visible grade label per tombstone, no .tomb-label", async () => {
    expect(await run("labels")).toBe("");
  }, 60_000);
  it("D5: the calibration row says Engine rule: <rule>", async () => {
    expect(await run("calibration")).toBe("");
  }, 60_000);
  it("D6: one Total_Row without empty cells that spans all 5 columns", async () => {
    expect(await run("total")).toBe("");
  }, 60_000);
  it("D7: programmatic focus on the h1 and #detail-title is kept", async () => {
    expect(await run("focus")).toBe("");
  }, 60_000);
});
