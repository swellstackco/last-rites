// @vitest-environment jsdom
// graveyard-ui-polish: preservation (Property 10). The S7 group runs in polish.css.test.ts (node environment:
// reading the Stylesheet files under jsdom returns different text). No network.
import { describe, expect, it } from "vitest";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import { build as p10 } from "./test-support/properties/p10.js";

describe("Property 10: preservation", () => {
  it("fixed facts equal the Reference_Renderer facts and the report's facts", async () => {
    const report = await checkAsyncProperty("Property 10: preservation", p10());
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, 60_000);

});
