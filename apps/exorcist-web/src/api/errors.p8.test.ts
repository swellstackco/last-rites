import { describe, it } from "vitest";
import { assertProperty } from "@graveyard-kit/skeleton/graveyard/testing";
import { build } from "../test-support/properties/p8.js";

describe("Property 8: error description is total and safe", () => {
  it("never throws, always explains, bounds the message and clamps the retry time", () => {
    assertProperty("describeError", build());
  });
});
