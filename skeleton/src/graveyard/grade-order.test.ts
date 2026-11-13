import { describe, expect, it } from "vitest";
import { toGrade } from "../death-score/index.js";
import { GRADE_INFO, GRADE_ORDER } from "./grade-order.js";

describe("GRADE_INFO", () => {
  it("puts every score 0..100 inside the range of its own band and no other", () => {
    for (let score = 0; score <= 100; score++) {
      const own = toGrade(score);
      for (const band of GRADE_ORDER) {
        const { min, max } = GRADE_INFO[band];
        const inside = score >= min && score <= max;
        expect(inside, `score ${score} vs ${band}`).toBe(band === own);
      }
    }
  });

  it("has contiguous ranges that cover 0..100", () => {
    const ascending = [...GRADE_ORDER].reverse();
    expect(GRADE_INFO[ascending[0]!].min).toBe(0);
    for (let i = 1; i < ascending.length; i++) {
      expect(GRADE_INFO[ascending[i]!].min).toBe(GRADE_INFO[ascending[i - 1]!].max + 1);
    }
    expect(GRADE_INFO[ascending[ascending.length - 1]!].max).toBe(100);
  });

  it("lists each band exactly once, deadest first", () => {
    expect([...GRADE_ORDER]).toEqual(["dead", "dying", "ailing", "alive"]);
    expect(new Set(GRADE_ORDER).size).toBe(4);
  });

  it("has a non-empty label and description per band", () => {
    for (const band of GRADE_ORDER) {
      expect(GRADE_INFO[band].label.length).toBeGreaterThan(0);
      expect(GRADE_INFO[band].description.length).toBeGreaterThan(0);
    }
  });
});
