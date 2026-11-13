// toe-tag-polish TP5 sabotages: string mutations of the real Stylesheet, each caught by checkToePolish.
// Entries are added by the group that fixes the matching defect (v-aa: T2/T3; later: T4 to T7).
import { replaceOnce } from "./replace-once.js";

export interface PolishCssSabotage {
  name: string;
  /** The checkToePolish group (S-T2 ...) that must report it. */
  check: string;
  mutate: (css: string) => string;
}

const append = (rule: string) => (css: string): string => `${css}\n${rule}\n`;

export const TP5_SABOTAGES: readonly PolishCssSabotage[] = [
  {
    name: "(v) .tombstone loses align-items: stretch",
    check: "S-T2",
    mutate: (c) => replaceOnce(c, "  align-items: stretch;\n  align-content: start;", "  align-content: start;"),
  },
  { name: "(w) .tag-band align-self: center", check: "S-T2", mutate: (c) => replaceOnce(c, "  align-self: stretch;\n  gap: var(--space-2);", "  align-self: center;\n  gap: var(--space-2);") },
  { name: "(x) .tag-band gets margin-inline", check: "S-T2", mutate: append(".tag-band { margin-inline: var(--space-3); }") },
  {
    name: "(y) .tag-field loses its border-bottom",
    check: "S-T3",
    mutate: (c) => replaceOnce(c, "  text-align: left;\n  border-bottom: var(--rule-thin) solid var(--ink);\n", "  text-align: left;\n"),
  },
  {
    name: "(z) only the old .tag-field + .tag-field border-top",
    check: "S-T3",
    mutate: (c) =>
      replaceOnce(c, "  border-bottom: var(--rule-thin) solid var(--ink);\n}\n\n.tag-label", "}\n\n.tag-field + .tag-field {\n  border-top: var(--rule-thin) solid var(--ink);\n}\n\n.tag-label"),
  },
  { name: "(aa) .tomb-score text-align: center", check: "S-T3", mutate: append(".tomb-score { text-align: center; }") },
  { name: "(ab) .subtitle-phrase loses white-space: nowrap", check: "S-T4", mutate: (c) => replaceOnce(c, ".subtitle-phrase {\n  white-space: nowrap;\n}", ".subtitle-phrase {\n  display: inline;\n}") },
  {
    name: "(ac) the first-phrase wrap rule is unconditional",
    check: "S-T4",
    mutate: (c) =>
      replaceOnce(c, "@media (max-width: 22.4375rem) {\n  .subtitle-phrase:first-child {\n    white-space: normal;\n  }\n}", ".subtitle-phrase:first-child {\n  white-space: normal;\n}"),
  },
];
