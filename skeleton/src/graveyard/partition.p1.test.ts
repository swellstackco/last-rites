import { describe, it } from "vitest";
import { assertProperty } from "../death-score/fc-runner.js";
import { build } from "./test-support/properties/p1.js";

describe("Property 1: grouping is a partition", () => {
  it("every record lands in exactly one group, keys are unique, input is unchanged", () => {
    assertProperty("graveyard partition", build());
  });
});
