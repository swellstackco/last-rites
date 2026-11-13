import { describe, it } from "vitest";
import { assertProperty } from "../death-score/fc-runner.js";
import { build, buildRows } from "./test-support/properties/p5.js";

describe("Property 5: source links only ever render http or https URLs", () => {
  it("safeHttpUrl returns undefined or the input unchanged, http(s) only", () => {
    assertProperty("safe url", build());
  });

  it("every href produced by buildBreakdown is safe, unsafe values are withheld", () => {
    assertProperty("safe url rows", buildRows());
  });
});
