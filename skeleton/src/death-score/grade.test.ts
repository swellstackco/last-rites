import { describe, it, expect } from "vitest";
import { toGrade } from "./grade.js";

describe("toGrade — boundary integers", () => {
  // (score, expected grade)
  const cases: [number, string][] = [
    [0, "alive"],
    [24, "alive"],
    [25, "ailing"],
    [49, "ailing"],
    [50, "dying"],
    [74, "dying"],
    [75, "dead"],
    [100, "dead"],
  ];

  for (const [score, expected] of cases) {
    it(`maps ${score} → ${expected}`, () => {
      expect(toGrade(score)).toBe(expected);
    });
  }
});

describe("toGrade — interior values", () => {
  const cases: [number, string][] = [
    [1, "alive"],
    [10, "alive"],
    [30, "ailing"],
    [40, "ailing"],
    [60, "dying"],
    [70, "dying"],
    [80, "dead"],
    [90, "dead"],
    [99, "dead"],
  ];

  for (const [score, expected] of cases) {
    it(`maps ${score} → ${expected}`, () => {
      expect(toGrade(score)).toBe(expected);
    });
  }
});
