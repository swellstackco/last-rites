import { REAL_SKILL_GEN, type SkillGen } from "../validators.js";
import type { Sabotage } from "../sabotage-runner.js";

const head = (m: { name: string; description: string }) => `---\nname: ${m.name}\ndescription: ${m.description}\n---\n\n`;
const lf = (s: string) => s.replace(/\r\n/g, "\n");

/** Strip the steering frontmatter and return the body lines (one blank line dropped), like the real one. */
const split = (steering: string): string[] => {
  const lines = lf(steering).split("\n");
  if (lines[0] !== "---") return lines;
  const end = lines.indexOf("---", 1);
  if (end === -1) return lines;
  const body = lines.slice(end + 1);
  return body[0] === "" ? body.slice(1) : body;
};

export const KIRO_P13_SABOTAGES: Sabotage<SkillGen>[] = [
  {
    name: "(a) keep the steering frontmatter",
    impl: { skillFromSteering: (s, m) => head(m) + lf(s) },
  },
  {
    name: "(b) drop a body line that equals ---",
    impl: { skillFromSteering: (s, m) => head(m) + split(s).filter((l) => l !== "---").join("\n") },
  },
  {
    name: "(c) emit description first, then name",
    impl: { skillFromSteering: (s, m) => REAL_SKILL_GEN.skillFromSteering(s, m).replace(`name: ${m.name}\ndescription: ${m.description}`, `description: ${m.description}\nname: ${m.name}`) },
  },
  {
    name: "(d) convert LF to CRLF",
    impl: { skillFromSteering: (s, m) => REAL_SKILL_GEN.skillFromSteering(s, m).replace(/\n/g, "\r\n") },
  },
  {
    name: "(e) truncate the body at 4000 characters",
    impl: { skillFromSteering: (s, m) => head(m) + split(s).join("\n").slice(0, 4000) },
  },
];
