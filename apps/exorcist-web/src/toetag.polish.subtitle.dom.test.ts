// @vitest-environment jsdom
// toe-tag-polish Property TP2 (T4): the Form_Subtitle structure on the graveyard page. No network.
import { describe, expect, it } from "vitest";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import { FORM_SUBTITLE } from "./constants.js";
import { build } from "./test-support/properties/tp2.js";

describe("TP2: subtitle without an orphan", () => {
  it("every generated report page has a two-phrase subtitle with an unbroken Form LR-1", async () => {
    const report = await checkAsyncProperty("TP2: subtitle", build());
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, 240_000);

  it("FORM_SUBTITLE keeps its text", () => {
    expect(FORM_SUBTITLE).toBe("Office of the Dependency Examiner · Form LR-1");
  });
});
