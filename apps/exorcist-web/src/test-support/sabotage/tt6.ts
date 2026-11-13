// Property 6 sabotages (toe-tag-redesign): layout regressions in the Stylesheet text.
import { addRest, all, inRest } from "./replace-once.js";
import type { SheetSabotage } from "./replace-once.js";

export const TT6_SABOTAGES: readonly SheetSabotage[] = [
  {
    name: "remove overflow-wrap from .tomb-name",
    target: "wrap",
    mutate: all(
      inRest(".tomb-name,\n.tomb-summary,\ndd {\n  overflow-wrap: anywhere;", ".tomb-summary,\ndd {\n  overflow-wrap: anywhere;"),
      inRest("  font-weight: 600;\n  overflow-wrap: anywhere;\n}\n\n.tomb-score", "  font-weight: 600;\n}\n\n.tomb-score"),
    ),
  },
  { name: ".tombstone min-width 400px", target: "width", mutate: addRest(".tombstone { min-width: 400px; }") },
  {
    name: "base tag grid repeat(4, 1fr)",
    target: "grid",
    mutate: inRest("  list-style: none;\n  grid-template-columns: repeat(2, minmax(0, 1fr));", "  list-style: none;\n  grid-template-columns: repeat(4, 1fr);"),
  },
  { name: ".tomb-summary nowrap", target: "nowrap", mutate: addRest(".tomb-summary { white-space: nowrap; }") },
  { name: ".proof-pre white-space: pre", target: "wrap", mutate: addRest(".proof-pre { white-space: pre; }") },
  { name: ".sheet width 56rem", target: "width", mutate: inRest("width: min(100%, 56rem);", "width: 56rem;") },
  {
    name: "remove the max-width 22.5rem one-column rule",
    target: "grid",
    mutate: inRest("@media (max-width: 22.4375rem) {\n  .grid {\n    grid-template-columns: minmax(0, 1fr);", "@media (max-width: 1px) {\n  .grid {\n    grid-template-columns: minmax(0, 1fr);"),
  },
  {
    name: "remove min-height from .count",
    target: "target",
    mutate: inRest("  width: 100%;\n  min-height: var(--target);\n  min-width: var(--target);\n  padding: var(--space-2) var(--space-3);\n  text-align: left;", "  width: 100%;\n  min-width: var(--target);\n  padding: var(--space-2) var(--space-3);\n  text-align: left;"),
  },
];
