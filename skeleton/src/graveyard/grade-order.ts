import { toGrade } from "../death-score/index.js";
import type { GradeBand } from "../death-score/index.js";

/** Display order: deadest first. */
export const GRADE_ORDER = ["dead", "dying", "ailing", "alive"] as const;

export interface GradeInfo {
  label: string;
  min: number;
  max: number;
  description: string;
}

/** Derive each band's inclusive score range by scanning 0..100 with toGrade. */
function rangeOf(band: GradeBand): { min: number; max: number } {
  let min = -1;
  let max = -1;
  for (let score = 0; score <= 100; score++) {
    if (toGrade(score) !== band) continue;
    if (min < 0) min = score;
    max = score;
  }
  return { min, max };
}

function info(band: GradeBand, label: string, description: string): GradeInfo {
  return { label, ...rangeOf(band), description };
}

export const GRADE_INFO: Record<GradeBand, GradeInfo> = {
  dead: info("dead", "Dead", "Abandoned or declared dead. Plan a replacement."),
  dying: info("dying", "Dying", "Strong signs of decline. Start looking for a replacement."),
  ailing: info("ailing", "Ailing", "Some signs of age. Keep an eye on it."),
  alive: info("alive", "Alive", "Healthy on the signals we can see."),
};
