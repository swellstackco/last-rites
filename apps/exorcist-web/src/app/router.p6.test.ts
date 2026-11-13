import { describe, it } from "vitest";
import { assertProperty } from "@graveyard-kit/skeleton/graveyard/testing";
import { build } from "../test-support/properties/p6.js";

describe("Property 6: route codec round trip and totality", () => {
  it("valid routes round trip, any string parses to a valid route, normal form is idempotent", () => {
    assertProperty("route codec", build());
  });
});
