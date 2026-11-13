// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

describe("test environment (jsdom)", () => {
  it("provides a document body", () => {
    expect(document.body).toBeTruthy();
  });
});
