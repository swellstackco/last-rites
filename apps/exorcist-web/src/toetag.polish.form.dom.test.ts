// @vitest-environment jsdom
// toe-tag-polish T6: the Optional_Ref_Summary stays a native summary in a details; the form's facts equal the v3 picker. No network.
import { describe, expect, it } from "vitest";
import { mountPage } from "./test-support/dom-harness.js";
import { pickerFacts } from "./test-support/toe-facts.js";
import { renderReferenceV3Picker } from "./test-support/toe-reference-v3.js";

describe("T6: scan-form optional ref", () => {
  it("is a native summary inside the details, with the same text", async () => {
    const page = mountPage({ route: "" });
    try {
      await page.flush();
      const summary = page.document.querySelector("form.live-form details > summary");
      expect(summary).not.toBeNull();
      expect(summary!.tagName).toBe("SUMMARY");
      expect(summary!.textContent).toBe("Branch or tag (optional)");
      expect(summary!.parentElement!.tagName).toBe("DETAILS");
      expect((summary!.parentElement as HTMLDetailsElement).open).toBe(false);
      expect(summary!.closest("details")!.querySelector("input#live-ref")).not.toBeNull();
    } finally {
      page.destroy();
    }
  });

  it("opens the details when ref has a value, and the form facts equal the v3 picker", async () => {
    const page = mountPage({ route: "#/live?repo=owner/name&ref=main" });
    try {
      await page.flush();
      const details = page.document.querySelector<HTMLDetailsElement>("form.live-form details")!;
      expect(details.open).toBe(true);
      const actual = pickerFacts(page.document.body);
      const reference = renderReferenceV3Picker({ repo: "owner/name", ref: "main" }, actual.notice ?? undefined);
      expect(actual.form).toEqual(reference.form);
      expect(actual.form!.labels.map((l) => l.text)).toEqual(["Repository", "Branch or tag"]);
    } finally {
      page.destroy();
    }
  });

  it("without a ref the details is closed and the form facts equal the v3 picker", async () => {
    const page = mountPage({ route: "" });
    try {
      await page.flush();
      expect(pickerFacts(page.document.body).form).toEqual(renderReferenceV3Picker().form);
    } finally {
      page.destroy();
    }
  });
});
