// Property 8 sabotages (toe-tag-redesign): Stylesheet text mutations that clip or lose the focus ring.
import { addRest, inRest } from "./replace-once.js";
import type { SheetSabotage } from "./replace-once.js";

export const TT8_SABOTAGES: readonly SheetSabotage[] = [
  { name: ".tombstone gets a clip-path", target: "clip", mutate: addRest(".tombstone { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }") },
  { name: ".grid > li overflow hidden", target: "clip", mutate: addRest(".grid > li { overflow: hidden; }") },
  { name: ".demo-cards > li overflow hidden (toe-tag-polish)", target: "clip", mutate: addRest(".demo-cards > li { overflow: hidden; }") },
  { name: ".demo-card gets a clip-path (toe-tag-polish)", target: "clip", mutate: addRest(".demo-card { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }") },
  { name: ".tombstone:focus-visible outline none", target: "removal", mutate: addRest(".tombstone:focus-visible { outline: none; }") },
  { name: "ring color set to --tag", target: "ring", mutate: inRest("outline: var(--ring-width) solid var(--focus);", "outline: var(--ring-width) solid var(--tag);") },
  { name: "ring width 1px", target: "ring", mutate: inRest("outline: var(--ring-width) solid var(--focus);", "outline: 1px solid var(--focus);") },
  { name: "forced-colors block removed", target: "forced", mutate: inRest("@media (forced-colors: active) {\n  button,", "@media (forced-colors: none) {\n  button,") },
  { name: "Highlight ring removed under forced colors", target: "forced", mutate: inRest("outline-color: Highlight;", "") },
  { name: "outline-offset -8px", target: "ring", mutate: inRest("outline-offset: var(--ring-offset);", "outline-offset: -8px;") },
  { name: "tag grid gap below --space-4", target: "gap", mutate: inRest("  display: grid;\n  gap: var(--space-4);\n  padding: 0;\n  margin: 0;\n  list-style: none;\n  grid-template-columns: minmax(0, 1fr)", "  display: grid;\n  gap: var(--space-1);\n  padding: 0;\n  margin: 0;\n  list-style: none;\n  grid-template-columns: minmax(0, 1fr)") },
  { name: "mask on a button", target: "clip", mutate: addRest("button { mask: linear-gradient(#000, #000); }") },
];
