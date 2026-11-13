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
  {
    name: "(ad) .demo-cards > li loses the string padding",
    check: "S-T5",
    mutate: (c) => replaceOnce(c, ".grid > li,\n.demo-cards > li {\n  position: relative;\n  padding-top: var(--string-height);\n}", ".grid > li {\n  position: relative;\n  padding-top: var(--string-height);\n}"),
  },
  { name: "(ad) .demo-cards > li loses the string ::before", check: "S-T5", mutate: (c) => replaceOnce(c, ".grid > li::before,\n.demo-cards > li::before {", ".grid > li::before {") },
  { name: "(ae) .demo-cards > li gets overflow: hidden", check: "S-T5", mutate: append(".demo-cards > li { overflow: hidden; }") },
  {
    name: "(ae) .demo-card is cut on one corner only again",
    check: "S-T5",
    mutate: (c) => replaceOnce(c, "    calc(100% - var(--tag-chamfer)) 0,\n    100% var(--tag-chamfer),\n    100% 100%,\n    0 100%,\n    0 var(--tag-chamfer)\n  );\n}\n\n.demo-card::after", "    100% 0,\n    100% 100%,\n    0 100%,\n    0 var(--tag-chamfer)\n  );\n}\n\n.demo-card::after"),
  },
  {
    name: "(af) the Optional_Ref_Summary loses its border reset",
    check: "S-T6",
    mutate: (c) => replaceOnce(c, "  background: none;\n  border: 0;\n  border-radius: 0;\n  font-family: var(--font-label);", "  background: none;\n  border-radius: 0;\n  font-family: var(--font-label);"),
  },
  {
    name: "(ag) the Optional_Ref_Summary uses the body font",
    check: "S-T6",
    mutate: (c) => replaceOnce(c, "  border-radius: 0;\n  font-family: var(--font-label);", "  border-radius: 0;\n  font-family: var(--font-body);"),
  },
  { name: "(af) the open marker is gone", check: "S-T6", mutate: (c) => replaceOnce(c, '.live-form details[open] > summary::before {\n  content: "\\2212";\n}', "") },
  { name: "(af) the summary gets overflow: hidden", check: "S-T6", mutate: append(".live-form details > summary { overflow: hidden; }") },
  {
    name: "(ah) .grid defaults to two columns again",
    check: "S-T7",
    mutate: (c) => replaceOnce(c, "  list-style: none;\n  grid-template-columns: minmax(0, 1fr);\n}\n\n@media (min-width: 32.5rem)", "  list-style: none;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n}\n\n@media (min-width: 32.5rem)"),
  },
  { name: "(ai) the two-column rule moves to 22.5rem", check: "S-T7", mutate: (c) => replaceOnce(c, "@media (min-width: 32.5rem) {\n  .grid {", "@media (min-width: 22.5rem) {\n  .grid {") },
  {
    name: "(aj) overflow-wrap: anywhere is back on .tomb-name",
    check: "S-T7",
    mutate: (c) => replaceOnce(c, "  font-weight: 600;\n  overflow-wrap: break-word;\n}\n\n.tomb-score", "  font-weight: 600;\n  overflow-wrap: anywhere;\n}\n\n.tomb-score"),
  },
  { name: "(aj) a leftover 22.4375rem rule on .grid", check: "S-T7", mutate: append("@media (max-width: 22.4375rem) { .grid { grid-template-columns: minmax(0, 1fr); } }") },
];
