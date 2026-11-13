import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { scoreDeath } from "./score.js";
import {
  declaredAbandonedArb,
  isDeclaredAbandoned,
  notDeclaredAbandonedArb,
} from "./arbitraries.js";
import { assertProperty } from "./fc-runner.js";
import { declaredAbandonedProperty, preservationProperty } from "./properties.js";

// death-score-calibration: Property 6 (fix checking) and Property 7
// (preservation). Both are kept out of ALL_PROPERTIES until task 3.5.

describe("calibration generators", () => {
  it("declaredAbandonedArb always satisfies C(X)", () => {
    assertProperty(
      "declaredAbandonedArb ⊆ C(X)",
      fc.property(declaredAbandonedArb, ([s, c]) => isDeclaredAbandoned(s, c)),
    );
  });

  it("notDeclaredAbandonedArb never satisfies C(X)", () => {
    assertProperty(
      "notDeclaredAbandonedArb ∩ C(X) = ∅",
      fc.property(notDeclaredAbandonedArb, ([s, c]) => !isDeclaredAbandoned(s, c)),
    );
  });

  it("isDeclaredAbandoned: unknown never fires, threshold is non-strict", () => {
    const cfg = { monthsSinceLastPublishFullDead: 24 } as never;
    const base = {
      deprecated: { kind: "known", value: true },
      repoArchived: { kind: "unknown" },
      monthsSinceLastPublish: { kind: "known", value: 24 },
    } as never;
    expect(isDeclaredAbandoned(base, cfg)).toBe(true);
    expect(
      isDeclaredAbandoned(
        { ...(base as object), monthsSinceLastPublish: { kind: "known", value: 23 } } as never,
        cfg,
      ),
    ).toBe(false);
    expect(
      isDeclaredAbandoned(
        { ...(base as object), monthsSinceLastPublish: { kind: "unknown" } } as never,
        cfg,
      ),
    ).toBe(false);
  });
});

describe("Property 6: Declared abandoned is dead", () => {
  // Task 1.1: on the UNFIXED engine this property FAILS (confirmed, see
  // docs/kiro-log.md). Registered as an expected failure so the suite stays
  // green until the fix; flips to a normal test in 4.1.
  it.fails("declared-abandoned packages floor to the dead band with a calibration entry", () => {
    assertProperty(
      declaredAbandonedProperty.name,
      declaredAbandonedProperty.build(scoreDeath),
    );
  });
});

describe("Property 7: Preservation", () => {
  it("NOT C(X), or abandonedFloor 0, is identical to the Reference_Implementation", () => {
    assertProperty(preservationProperty.name, preservationProperty.build(scoreDeath));
  });
});
