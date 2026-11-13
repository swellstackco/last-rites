import { describe, it, expect } from "vitest";
import { scoreDeath } from "./score.js";
import {
  DEFAULT_WEIGHT_CONFIG,
  DEFAULT_WEIGHTS,
  SIGNAL_NAMES,
} from "./weights.js";
import { allAlive, allDead, allUnknown, mixed } from "./__fixtures__/index.js";
import type { DeathScoreResult, PackageSignals, SignalName, SignalPart } from "./types.js";

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

// ---------------------------------------------------------------------------
// death-score-calibration: regression table (tasks 6.1, 6.2)
// Signals hardcoded from demo/parse-server.json and demo/prettier.json
// (read once by hand; no network and no file reads at test time).
// ---------------------------------------------------------------------------

type Sig = [
  deprecated: boolean,
  repoArchived: boolean,
  publish: number,
  commit: number,
  maintainers: number,
  vulns: number,
  replacement: boolean,
];

function signalsOf(s: Sig): PackageSignals {
  const known = <T,>(value: T) => ({ kind: "known" as const, value });
  return {
    deprecated: known(s[0]),
    repoArchived: known(s[1]),
    monthsSinceLastPublish: known(s[2]),
    monthsSinceLastCommit: known(s[3]),
    maintainerCount: known(s[4]),
    openVulnsNoFix: known(s[5]),
    knownReplacementExists: known(s[6]),
  };
}

const REGRESSION_ROWS: ReadonlyArray<{
  name: string;
  signals: Sig;
  weightedSum: number;
  score: number;
  grade: DeathScoreResult["grade"];
  calibration?: { points: number; reason: string };
}> = [
  { name: "ldapjs", signals: [true, true, 35, 29, 4, 0, false], weightedSum: 72, score: 75, grade: "dead", calibration: { points: 3, reason: "deprecated + repo archived" } },
  { name: "@saithodev/semantic-release-backmerge", signals: [false, true, 35, 35, 1, 0, false], weightedSum: 61, score: 75, grade: "dead", calibration: { points: 14, reason: "repo archived + no publish for 35 months (threshold 24)" } },
  { name: "remark-footnotes", signals: [false, true, 25, 25, 1, 0, false], weightedSum: 58, score: 75, grade: "dead", calibration: { points: 17, reason: "repo archived + no publish for 25 months (threshold 24)" } },
  { name: "deep-diff", signals: [true, false, 98, 10, 1, 0, false], weightedSum: 48, score: 75, grade: "dead", calibration: { points: 27, reason: "deprecated + no publish for 98 months (threshold 24)" } },
  { name: "node-abort-controller", signals: [true, false, 45, 9, 2, 0, false], weightedSum: 45, score: 75, grade: "dead", calibration: { points: 30, reason: "deprecated + no publish for 45 months (threshold 24)" } },
  { name: "@babel/plugin-proposal-object-rest-spread", signals: [true, false, 43, 0, 4, 0, true], weightedSum: 40, score: 75, grade: "dead", calibration: { points: 35, reason: "deprecated + no publish for 43 months (threshold 24)" } },
  { name: "eslint", signals: [true, false, 0, 0, 2, 0, false], weightedSum: 27, score: 27, grade: "ailing" },
  { name: "mongodb-runner", signals: [true, false, 2, 0, 22, 0, false], weightedSum: 21, score: 21, grade: "alive" },
  { name: "cross-env", signals: [false, true, 13, 11, 1, 0, false], weightedSum: 46, score: 46, grade: "ailing" },
];

describe("scoreDeath — calibration regression table (default config)", () => {
  it.each(REGRESSION_ROWS)("$name", (row) => {
    const result = scoreDeath(signalsOf(row.signals), DEFAULT_WEIGHT_CONFIG);
    const partsSum = result.parts.reduce((s, p) => s + p.points, 0);
    expect(partsSum).toBe(row.weightedSum);
    expect(result.score).toBe(row.score);
    expect(result.grade).toBe(row.grade);
    if (row.calibration) {
      expect(result.calibration).toEqual({ rule: "declared_abandoned", ...row.calibration });
    } else {
      expect("calibration" in result).toBe(false);
    }
  });
});

describe("scoreDeath — calibration edge examples", () => {
  const T = DEFAULT_WEIGHT_CONFIG.monthsSinceLastPublishFullDead;
  // deprecated only, healthy otherwise: Weighted_Sum is well under 75.
  const withPublish = (months: number): PackageSignals =>
    signalsOf([true, false, months, 0, 10, 0, false]);

  it("publish exactly T is stale (floor applies)", () => {
    const r = scoreDeath(withPublish(T));
    expect(r.score).toBe(75);
    expect(r.calibration?.reason).toBe(`deprecated + no publish for ${T} months (threshold ${T})`);
  });

  it("publish T-1 is not stale (no floor, no calibration key)", () => {
    const r = scoreDeath(withPublish(T - 1));
    expect(r.score).toBeLessThan(75);
    expect("calibration" in r).toBe(false);
  });

  it.each([
    { floor: 0, expected: undefined },
    { floor: 100, expected: 100 },
    { floor: -5, expected: undefined },
    { floor: 150, expected: 100 },
    { floor: Number.NaN, expected: undefined },
  ])("abandonedFloor $floor", ({ floor, expected }) => {
    const signals = withPublish(T);
    const config = { ...DEFAULT_WEIGHT_CONFIG, abandonedFloor: floor };
    const base = scoreDeath(signals, { ...DEFAULT_WEIGHT_CONFIG, abandonedFloor: 0 });
    const r = scoreDeath(signals, config);
    if (expected === undefined) {
      expect(r.score).toBe(base.score);
      expect("calibration" in r).toBe(false);
    } else {
      expect(r.score).toBe(expected);
      expect(r.grade).toBe("dead");
      expect(r.calibration?.points).toBe(expected - base.score);
    }
  });

  it("Weighted_Sum already >= 75: no calibration", () => {
    const r = scoreDeath(signalsOf([true, true, 98, 90, 0, 3, true]));
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect("calibration" in r).toBe(false);
    expect(r.parts.reduce((s, p) => s + p.points, 0)).toBe(r.score);
  });

  it("both flags with Unknown publish still fire (reason: both flags)", () => {
    const signals: PackageSignals = {
      ...signalsOf([true, true, 0, 0, 10, 0, false]),
      monthsSinceLastPublish: { kind: "unknown" },
    };
    const r = scoreDeath(signals);
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.grade).toBe("dead");
    expect(r.calibration?.reason).toBe("deprecated + repo archived");
  });

  it("one flag with Unknown publish does not fire", () => {
    const signals: PackageSignals = {
      ...signalsOf([true, false, 0, 0, 10, 0, false]),
      monthsSinceLastPublish: { kind: "unknown" },
    };
    expect("calibration" in scoreDeath(signals)).toBe(false);
  });
});
