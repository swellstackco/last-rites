import { describe, it } from "vitest";
import { assertProperty } from "../death-score/fc-runner.js";
import { build } from "./test-support/properties/p3.js";

describe("Property 3: breakdown rows sum to the displayed score", () => {
  it("holds for scored records and reports tampered ones without adjusting numbers", () => {
    assertProperty("breakdown arithmetic", build());
  });
});
