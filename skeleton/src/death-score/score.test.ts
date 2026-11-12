import { describe, it, expect } from "vitest";
import { scoreDeath } from "./score.js";
import {
  DEFAULT_WEIGHT_CONFIG,
  DEFAULT_WEIGHTS,
  SIGNAL_NAMES,
} from "./weights.js";
import { allAlive, allDead, allUnknown, mixed } from "./__fixtures__/index.js";
import type { DeathScoreResult, SignalName, SignalPart } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Look up a part by signal name, throwing if missing. */
function partFor(result: DeathScoreResult, signal: SignalName): SignalPart {
  const part = result.parts.find((p) => p.signal === signal);
  if (!part) throw new Error(`No part for signal "${signal}"`);
  return part;
}

/** Assert common invariants for any DeathScoreResult. */
function assertCommonInvariants(result: DeathScoreResult): void {
  // Score range
  expect(result.score).toBeGreaterThanOrEqual(0);
  expect(result.score).toBeLessThanOrEqual(100);

  // One part per signal, in stable order
  expect(result.parts).toHaveLength(SIGNAL_NAMES.length);
  expect(result.parts.map((p) => p.signal)).toEqual([...SIGNAL_NAMES]);

  // Parts sum to score (exact integer equality)
  const sum = result.parts.reduce((s, p) => s + p.points, 0);
  expect(sum).toBe(result.score);

  // Each part has the required fields with valid values
  for (const part of result.parts) {
    expect(part).toHaveProperty("signal");
    expect(part).toHaveProperty("rawValue");
    expect(part).toHaveProperty("weight");
    expect(part).toHaveProperty("points");
    expect(part).toHaveProperty("status");
    expect(typeof part.rawValue).toBe("string");
    expect(part.weight).toBeGreaterThanOrEqual(0);
    expect(part.points).toBeGreaterThanOrEqual(0);
    expect(part.points).toBeLessThanOrEqual(part.weight);
    expect(part.status === "known" || part.status === "unknown").toBe(true);
  }
}

// ---------------------------------------------------------------------------
// allAlive fixture
// ---------------------------------------------------------------------------

describe("scoreDeath — allAlive fixture", () => {
  const result = scoreDeath(allAlive, DEFAULT_WEIGHT_CONFIG);

  it("score is 0", () => {
    expect(result.score).toBe(0);
  });

  it("grade is alive", () => {
    expect(result.grade).toBe("alive");
  });

  it("satisfies common invariants", () => {
    assertCommonInvariants(result);
  });

  it("every part has 0 points and status known", () => {
    for (const part of result.parts) {
      expect(part.points).toBe(0);
      expect(part.status).toBe("known");
    }
  });

  it("weights match DEFAULT_WEIGHTS", () => {
    for (const part of result.parts) {
      expect(part.weight).toBe(DEFAULT_WEIGHTS[part.signal]);
    }
  });

  it("rawValue matches the signal value", () => {
    expect(partFor(result, "deprecated").rawValue).toBe("false");
    expect(partFor(result, "repoArchived").rawValue).toBe("false");
    expect(partFor(result, "monthsSinceLastPublish").rawValue).toBe("0");
    expect(partFor(result, "monthsSinceLastCommit").rawValue).toBe("0");
    expect(partFor(result, "maintainerCount").rawValue).toBe("5");
    expect(partFor(result, "openVulnsNoFix").rawValue).toBe("0");
    expect(partFor(result, "knownReplacementExists").rawValue).toBe("false");
  });

  it("no part has a sourceUrl", () => {
    for (const part of result.parts) {
      expect(part.sourceUrl).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// allDead fixture
// ---------------------------------------------------------------------------

describe("scoreDeath — allDead fixture", () => {
  const result = scoreDeath(allDead, DEFAULT_WEIGHT_CONFIG);

  it("score is 100", () => {
    expect(result.score).toBe(100);
  });

  it("grade is dead", () => {
    expect(result.grade).toBe("dead");
  });

  it("satisfies common invariants", () => {
    assertCommonInvariants(result);
  });

  it("every part has points equal to weight and status known", () => {
    for (const part of result.parts) {
      expect(part.points).toBe(part.weight);
      expect(part.status).toBe("known");
    }
  });

  it("rawValue matches the signal value", () => {
    expect(partFor(result, "deprecated").rawValue).toBe("true");
    expect(partFor(result, "repoArchived").rawValue).toBe("true");
    expect(partFor(result, "monthsSinceLastPublish").rawValue).toBe("24");
    expect(partFor(result, "monthsSinceLastCommit").rawValue).toBe("36");
    expect(partFor(result, "maintainerCount").rawValue).toBe("0");
    expect(partFor(result, "openVulnsNoFix").rawValue).toBe("1");
    expect(partFor(result, "knownReplacementExists").rawValue).toBe("true");
  });

  it("every part has the sourceUrl from the fixture", () => {
    for (const part of result.parts) {
      expect(part.sourceUrl).toBeDefined();
      expect(part.sourceUrl).toBe(allDead.sourceUrls?.[part.signal]);
    }
  });
});

// ---------------------------------------------------------------------------
// allUnknown fixture
// ---------------------------------------------------------------------------

describe("scoreDeath — allUnknown fixture", () => {
  const result = scoreDeath(allUnknown, DEFAULT_WEIGHT_CONFIG);

  it("score is 50", () => {
    expect(result.score).toBe(50);
  });

  it("grade is dying", () => {
    expect(result.grade).toBe("dying");
  });

  it("satisfies common invariants", () => {
    assertCommonInvariants(result);
  });

  it("every part has status unknown and rawValue unknown", () => {
    for (const part of result.parts) {
      expect(part.status).toBe("unknown");
      expect(part.rawValue).toBe("unknown");
    }
  });

  it("no part has a sourceUrl", () => {
    for (const part of result.parts) {
      expect(part.sourceUrl).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// mixed fixture
// ---------------------------------------------------------------------------

describe("scoreDeath — mixed fixture", () => {
  const result = scoreDeath(mixed, DEFAULT_WEIGHT_CONFIG);

  it("score is 40", () => {
    expect(result.score).toBe(40);
  });

  it("grade is ailing", () => {
    expect(result.grade).toBe("ailing");
  });

  it("satisfies common invariants", () => {
    assertCommonInvariants(result);
  });

  it("known signals have status known", () => {
    expect(partFor(result, "deprecated").status).toBe("known");
    expect(partFor(result, "repoArchived").status).toBe("known");
    expect(partFor(result, "monthsSinceLastCommit").status).toBe("known");
    expect(partFor(result, "maintainerCount").status).toBe("known");
    expect(partFor(result, "openVulnsNoFix").status).toBe("known");
  });

  it("unknown signals have status unknown and rawValue unknown", () => {
    expect(partFor(result, "monthsSinceLastPublish").status).toBe("unknown");
    expect(partFor(result, "monthsSinceLastPublish").rawValue).toBe("unknown");
    expect(partFor(result, "knownReplacementExists").status).toBe("unknown");
    expect(partFor(result, "knownReplacementExists").rawValue).toBe("unknown");
  });

  it("known signal rawValues match", () => {
    expect(partFor(result, "deprecated").rawValue).toBe("true");
    expect(partFor(result, "repoArchived").rawValue).toBe("false");
    expect(partFor(result, "monthsSinceLastCommit").rawValue).toBe("12");
    expect(partFor(result, "maintainerCount").rawValue).toBe("2");
    expect(partFor(result, "openVulnsNoFix").rawValue).toBe("0");
  });

  it("sourceUrls present for known signals, absent for unknown signals", () => {
    // Known signals with source URLs in the fixture
    expect(partFor(result, "deprecated").sourceUrl).toBe(
      "https://www.npmjs.com/package/example",
    );
    expect(partFor(result, "repoArchived").sourceUrl).toBe(
      "https://github.com/example/repo",
    );
    expect(partFor(result, "monthsSinceLastCommit").sourceUrl).toBe(
      "https://github.com/example/repo/commits",
    );
    expect(partFor(result, "maintainerCount").sourceUrl).toBe(
      "https://www.npmjs.com/package/example/access",
    );
    expect(partFor(result, "openVulnsNoFix").sourceUrl).toBe(
      "https://osv.dev/list?q=example",
    );
    // Unknown signals: no source URL in fixture
    expect(partFor(result, "monthsSinceLastPublish").sourceUrl).toBeUndefined();
    expect(partFor(result, "knownReplacementExists").sourceUrl).toBeUndefined();
  });
});
