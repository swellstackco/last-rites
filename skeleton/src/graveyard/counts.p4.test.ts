import { describe, it } from "vitest";
import { assertProperty } from "../death-score/fc-runner.js";
import { build } from "./test-support/properties/p4.js";

describe("Property 4: counts equal the grouped list sizes (view model)", () => {
  it("counts match group sizes, an independent recount, and total", () => {
    assertProperty("graveyard counts", build());
  });
});
