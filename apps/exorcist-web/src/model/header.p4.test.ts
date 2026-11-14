import { describe, it } from "vitest";
import { assertProperty } from "@last-rites/skeleton/graveyard/testing";
import { build } from "../test-support/properties/p4.js";

describe("Property 4: header counts equal the grouped list sizes (header)", () => {
  it("header counts match list sizes, a recount, the total, and summaryDisagrees iff the summary differs", () => {
    assertProperty("header counts", build());
  });
});
