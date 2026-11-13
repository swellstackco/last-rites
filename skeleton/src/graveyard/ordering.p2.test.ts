import { describe, it } from "vitest";
import { assertProperty } from "../death-score/fc-runner.js";
import { build } from "./test-support/properties/p2.js";

describe("Property 2: ordering", () => {
  it("is band, score descending, name by code unit, then input position", () => {
    assertProperty("graveyard ordering", build());
  });
});
