import type { GradeBand } from "./types.js";

/**
 * Map a 0–100 death score to a grade band.
 *
 * - 0–24:  alive
 * - 25–49: ailing
 * - 50–74: dying
 * - 75–100: dead
 */
export function toGrade(score: number): GradeBand {
  if (score < 25) return "alive";
  if (score < 50) return "ailing";
  if (score < 75) return "dying";
  return "dead";
}
