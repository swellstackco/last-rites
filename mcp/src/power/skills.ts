/** The two skills generated from steering files (Requirement 15.4). Shared by `sync.ts` and the drift test. */
export interface SkillSpec {
  /** Skill name and folder name under `power/skills/`. */
  name: string;
  /** Source steering file, relative to the repository root. */
  steering: string;
  description: string;
}

export const SKILLS: readonly SkillSpec[] = [
  {
    name: "migration-rules",
    steering: ".kiro/steering/migration-rules.md",
    description:
      "Use when replacing a dead npm package with a living one. Tests first, pin real call sites only, the old package is the oracle, smallest diff.",
  },
  {
    name: "proof-rules",
    steering: ".kiro/steering/proof-rules.md",
    description:
      "Use when writing or judging pin tests and property tests for a migration. No trivial passes, a sabotage check must be able to fail the suite.",
  },
];
