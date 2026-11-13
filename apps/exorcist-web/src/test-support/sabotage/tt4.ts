// Property 4 sabotages (toe-tag-redesign): token and Stylesheet text mutations that break contrast or the pair registry.
import { inRest, inTokens } from "./replace-once.js";
import type { SheetSabotage } from "./replace-once.js";

export const TT4_SABOTAGES: readonly SheetSabotage[] = [
  { name: "white text on the amber AILING band", target: "contrast", mutate: inRest("--band-color: var(--amber);\n  --band-text: var(--ink);", "--band-color: var(--amber);\n  --band-text: var(--on-band);") },
  { name: "--ink-soft lightened to #6B777D", target: "contrast", mutate: inTokens("--ink-soft: #3B474D;", "--ink-soft: #6B777D;") },
  { name: "--steel instead of --steel-ink for link rules", target: "contrast", mutate: inRest("\na {\n  color: var(--steel-ink);", "\na {\n  color: var(--steel);") },
  { name: "--red instead of --red-ink for field errors", target: "contrast", mutate: inRest(".field-error {\n  color: var(--red-ink);", ".field-error {\n  color: var(--red);") },
  { name: "--paper-hot darkened to #E9B8B0", target: "contrast", mutate: inTokens("--paper-hot: #F6DEDA;", "--paper-hot: #E9B8B0;") },
  { name: "--focus set to the Wall value", target: "contrast", mutate: inTokens("--focus: #1B2328;", "--focus: #C9CFCB;") },
  { name: "--rust lightened to #C0602A", target: "contrast", mutate: inTokens("--rust: #9A3F12;", "--rust: #C0602A;") },
  { name: "a new color token with no pair", target: "pair registry", mutate: inTokens(":root {", ":root {\n  --stray: #123456;") },
];
