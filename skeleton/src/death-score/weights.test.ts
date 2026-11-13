import { describe, it, expect } from "vitest";
import {
  DEFAULT_ABANDONED_FLOOR,
  DEFAULT_WEIGHTS,
  DEFAULT_WEIGHT_CONFIG,
  SIGNAL_NAMES,
  effectiveAbandonedFloor,
  normalizeWeights,
} from "./weights.js";
import { scoreDeath } from "./score.js";
import type { PackageSignals, WeightConfig } from "./types.js";

describe("effectiveAbandonedFloor", () => {
  const withFloor = (abandonedFloor?: number): WeightConfig => {
    const { abandonedFloor: _drop, ...rest } = DEFAULT_WEIGHT_CONFIG;
    return abandonedFloor === undefined ? rest : { ...rest, abandonedFloor };
  };

  it("default config carries 75", () => {
    expect(DEFAULT_ABANDONED_FLOOR).toBe(75);
    expect(DEFAULT_WEIGHT_CONFIG.abandonedFloor).toBe(75);
  });

  it("absent means the default", () => {
    expect(effectiveAbandonedFloor(withFloor())).toBe(75);
  });

  it("clamps to [0, 100]", () => {
    expect(effectiveAbandonedFloor(withFloor(-5))).toBe(0);
    expect(effectiveAbandonedFloor(withFloor(150))).toBe(100);
    expect(effectiveAbandonedFloor(withFloor(0))).toBe(0);
    expect(effectiveAbandonedFloor(withFloor(100))).toBe(100);
  });

  it("rounds non-integers to nearest", () => {
    expect(effectiveAbandonedFloor(withFloor(74.6))).toBe(75);
    expect(effectiveAbandonedFloor(withFloor(74.4))).toBe(74);
  });

  it("non-finite disables the rule", () => {
    expect(effectiveAbandonedFloor(withFloor(NaN))).toBe(0);
    expect(effectiveAbandonedFloor(withFloor(Infinity))).toBe(0);
    expect(effectiveAbandonedFloor(withFloor(-Infinity))).toBe(0);
  });
});

describe("DEFAULT_WEIGHTS", () => {
  it("loads with seven signals", () => {
    expect(SIGNAL_NAMES).toHaveLength(7);
    for (const name of SIGNAL_NAMES) {
      expect(DEFAULT_WEIGHTS).toHaveProperty(name);
    }
  });

  it("raw weights sum to exactly 100", () => {
    const sum = SIGNAL_NAMES.reduce((s, n) => s + DEFAULT_WEIGHTS[n], 0);
    expect(sum).toBe(100);
  });
});

describe("DEFAULT_WEIGHT_CONFIG", () => {
  it("has the documented default thresholds", () => {
    expect(DEFAULT_WEIGHT_CONFIG.monthsSinceLastPublishFullDead).toBe(24);
    expect(DEFAULT_WEIGHT_CONFIG.monthsSinceLastCommitFullDead).toBe(36);
    expect(DEFAULT_WEIGHT_CONFIG.maintainerCountFullAlive).toBe(5);
    expect(DEFAULT_WEIGHT_CONFIG.openVulnsFullDead).toBe(1);
    expect(DEFAULT_WEIGHT_CONFIG.unknownFactor).toBe(0.5);
  });

  it("weights are a copy of DEFAULT_WEIGHTS", () => {
    expect(DEFAULT_WEIGHT_CONFIG.weights).toEqual(DEFAULT_WEIGHTS);
    // Mutating the config copy should not affect the original.
    DEFAULT_WEIGHT_CONFIG.weights.deprecated = 0;
    expect(DEFAULT_WEIGHTS.deprecated).toBe(20);
    DEFAULT_WEIGHT_CONFIG.weights.deprecated = 20;
  });
});

describe("normalizeWeights", () => {
  it("is a no-op when weights already sum to 100", () => {
    const result = normalizeWeights(DEFAULT_WEIGHT_CONFIG);
    const sum = SIGNAL_NAMES.reduce((s, n) => s + result[n], 0);
    expect(sum).toBeCloseTo(100, 10);
    // Individual weights unchanged (integer defaults).
    for (const name of SIGNAL_NAMES) {
      expect(result[name]).toBe(DEFAULT_WEIGHTS[name]);
    }
  });

  it("scales custom weights so they sum to 100", () => {
    const config: WeightConfig = {
      ...DEFAULT_WEIGHT_CONFIG,
      weights: {
        deprecated: 10,
        repoArchived: 10,
        monthsSinceLastPublish: 10,
        monthsSinceLastCommit: 10,
        maintainerCount: 10,
        openVulnsNoFix: 10,
        knownReplacementExists: 10,
      },
    };
    const result = normalizeWeights(config);
    const sum = SIGNAL_NAMES.reduce((s, n) => s + result[n], 0);
    expect(sum).toBeCloseTo(100, 10);
    // Each weight scaled to ~14.2857.
    for (const name of SIGNAL_NAMES) {
      expect(result[name]).toBeCloseTo(100 / 7, 5);
    }
  });

  it("clamps negative weights to 0 before normalization", () => {
    const config: WeightConfig = {
      ...DEFAULT_WEIGHT_CONFIG,
      weights: {
        deprecated: -5,
        repoArchived: 25,
        monthsSinceLastPublish: 15,
        monthsSinceLastCommit: 12,
        maintainerCount: 12,
        openVulnsNoFix: 13,
        knownReplacementExists: 3,
      },
    };
    const result = normalizeWeights(config);
    expect(result.deprecated).toBe(0);
    const sum = SIGNAL_NAMES.reduce((s, n) => s + result[n], 0);
    expect(sum).toBeCloseTo(100, 10);
  });

  it("returns all zeros when every weight is zero", () => {
    const config: WeightConfig = {
      ...DEFAULT_WEIGHT_CONFIG,
      weights: {
        deprecated: 0,
        repoArchived: 0,
        monthsSinceLastPublish: 0,
        monthsSinceLastCommit: 0,
        maintainerCount: 0,
        openVulnsNoFix: 0,
        knownReplacementExists: 0,
      },
    };
    const result = normalizeWeights(config);
    for (const name of SIGNAL_NAMES) {
      expect(result[name]).toBe(0);
    }
  });
});

describe("zero-weight signal in scoreDeath", () => {
  it("yields 0 points but still appears in the breakdown", () => {
    const config: WeightConfig = {
      ...DEFAULT_WEIGHT_CONFIG,
      weights: { ...DEFAULT_WEIGHTS, deprecated: 0 },
    };
    // Force deprecated to its dead value — it should still contribute 0.
    const signals: PackageSignals = {
      deprecated: { kind: "known", value: true },
      repoArchived: { kind: "known", value: false },
      monthsSinceLastPublish: { kind: "known", value: 0 },
      monthsSinceLastCommit: { kind: "known", value: 0 },
      maintainerCount: { kind: "known", value: 5 },
      openVulnsNoFix: { kind: "known", value: 0 },
      knownReplacementExists: { kind: "known", value: false },
    };
    const result = scoreDeath(signals, config);

    const deprecatedPart = result.parts.find((p) => p.signal === "deprecated");
    expect(deprecatedPart).toBeDefined();
    expect(deprecatedPart!.points).toBe(0);
    expect(deprecatedPart!.weight).toBe(0);
    // Parts still sum to the score.
    const sum = result.parts.reduce((s, p) => s + p.points, 0);
    expect(sum).toBe(result.score);
  });
});
