import { describe, it } from "vitest";
import fc from "fast-check";
import { scoreDeath } from "./score.js";
import { DEFAULT_WEIGHT_CONFIG, SIGNAL_NAMES } from "./weights.js";
import { packageSignalsArb } from "./arbitraries.js";
import { assertProperty } from "./fc-runner.js";
import {
  boundedProperty,
  deterministicProperty,
  monotonicProperty,
  transparentProperty,
  unknownNotAliveProperty,
} from "./properties.js";

// Property definitions live in properties.ts so the sabotage harness runs the
// exact same properties against wrong implementations. numRuns = 100; the seed
// is fixed in CI and recorded (with the shrunk counterexample) on failure.

describe("Property 1: Bounded", () => {
  it("score is always in [0, 100]", () => {
    assertProperty(boundedProperty.name, boundedProperty.build(scoreDeath));
  });
});

describe("Property 2: Transparent", () => {
  it("parts sum to score and one part per signal", () => {
    assertProperty(transparentProperty.name, transparentProperty.build(scoreDeath));
  });

  it("every part has a valid signal name from SIGNAL_NAMES", () => {
    assertProperty(
      "Property 2b: valid part names",
      fc.property(packageSignalsArb, (signals) =>
        scoreDeath(signals, DEFAULT_WEIGHT_CONFIG).parts.every((p) =>
          SIGNAL_NAMES.includes(p.signal),
        ),
      ),
    );
  });
});

describe("Property 3: Deterministic", () => {
  it("same and structurally equal inputs produce equal results", () => {
    assertProperty(deterministicProperty.name, deterministicProperty.build(scoreDeath));
  });
});

describe("Property 4: Monotonic", () => {
  it("a death-dominating B never scores below A", () => {
    assertProperty(monotonicProperty.name, monotonicProperty.build(scoreDeath));
  });
});

describe("Property 5: Unknown is not alive", () => {
  it("unknown signal scores above the most-alive signal", () => {
    assertProperty(unknownNotAliveProperty.name, unknownNotAliveProperty.build(scoreDeath));
  });
});
