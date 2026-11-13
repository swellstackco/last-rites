// Property 5 sabotages (toe-tag-redesign): one or more per Banned_Look, plus extras.
import { addRest, all, inRest, inTokens } from "./replace-once.js";
import type { SheetSabotage } from "./replace-once.js";

export const TT5_SABOTAGES: readonly SheetSabotage[] = [
  { name: "look 1: dark Wall and dark color-scheme", target: "look 1", mutate: all(inTokens("--wall: #C9CFCB;", "--wall: #0B1215;"), inTokens("color-scheme: light;", "color-scheme: dark;")) },
  { name: "look 1: glowing tombstone", target: "look 1", mutate: addRest(".tombstone { box-shadow: 0 0 24px rgba(255, 106, 61, 0.5); }") },
  { name: "look 2: cream paper", target: "look 2", mutate: inTokens("--paper: #F1F2EE;", "--paper: #F5EFE0;") },
  { name: "look 2: serif headline", target: "look 2", mutate: addRest("h1 { font-family: Georgia, serif; }") },
  { name: "look 2: orange accent on the Stamp", target: "look 2", mutate: addRest(".proof-badge { color: #C2410C; }") },
  { name: "look 3: purple gradient", target: "look 3", mutate: addRest("body { background: linear-gradient(135deg, #7B2FF7, #F107A3); }") },
  { name: "look 4: glassmorphism", target: "look 4", mutate: addRest(".sheet { backdrop-filter: blur(8px); }") },
  { name: "look 5: generic rounded shadowed card", target: "look 5", mutate: addRest(".tombstone { border-radius: 16px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15); }") },
  { name: "look 6: white ground with hairline borders", target: "look 6", mutate: all(inTokens("--wall: #C9CFCB;", "--wall: #FFFFFF;"), addRest(".tombstone { border: 1px solid #D0D7DE; }")) },
  { name: "extra: rust used for links", target: "rust", mutate: addRest("a { color: var(--rust); }") },
  { name: "extra: Special Elite on the h1", target: "label font", mutate: addRest("h1 { font-family: var(--font-label); }") },
  { name: "extra: --tag as the body background", target: "manila", mutate: addRest("body { background: var(--tag); }") },
  { name: "extra: --rule thinned to 1px", target: "look 6", mutate: inTokens("--rule: 2px;", "--rule: 1px;") },
];
