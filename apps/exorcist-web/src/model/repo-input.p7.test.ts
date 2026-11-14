import { describe, it } from "vitest";
import { assertProperty } from "@last-rites/skeleton/graveyard/testing";
import { build } from "../test-support/properties/p7.js";

describe("Property 7: repo input parsing", () => {
  it("accepted outputs match the patterns; valid pairs are accepted in every spelling; bad input is rejected", () => {
    assertProperty("repo input", build());
  });
});
