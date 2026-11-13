// @vitest-environment jsdom
// toe-tag-redesign Property 3: report strings stay text and links stay safe. No network.
import { describe, expect, it } from "vitest";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import { build as tt3 } from "./test-support/properties/tt3.js";

describe("Property 3: report strings stay text and links stay safe", () => {
  it("hostile report text creates no element, handler, style or unsafe link", async () => {
    const report = await checkAsyncProperty("Property 3: safety", tt3());
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, 180_000);
});
