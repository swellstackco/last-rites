// CSS sabotages (graveyard-ui-polish k-v): string mutations of the real Stylesheet.
// Each must make checkStylesheet report a violation of the named check.

export interface CssSabotage {
  name: string;
  /** The check id (S1..S6) that must report it. */
  check: string;
  mutate: (css: string) => string;
}

/** Replaces exactly one occurrence; throws when the text is missing or ambiguous (a stale mutation is a bug). */
function replaceOnce(css: string, from: string, to: string): string {
  const first = css.indexOf(from);
  if (first === -1) throw new Error(`css sabotage: text not found: ${JSON.stringify(from)}`);
  if (css.indexOf(from, first + 1) !== -1) throw new Error(`css sabotage: text is ambiguous: ${JSON.stringify(from)}`);
  return css.slice(0, first) + to + css.slice(first + from.length);
}

const append = (rule: string) => (css: string): string => `${css}\n${rule}\n`;

export const CSS_SABOTAGES: readonly CssSabotage[] = [
  { name: "(k) .screen loses its max-width", check: "S1", mutate: (c) => replaceOnce(c, "  max-width: 1200px;\n  margin-inline: auto;", "  margin-inline: auto;") },
  { name: "(l) .screen max-width is 90rem", check: "S1", mutate: (c) => replaceOnce(c, "max-width: 1200px;", "max-width: 90rem;") },
  { name: "(m) .screen padding-inline is 0", check: "S1", mutate: (c) => replaceOnce(c, "  margin-inline: auto;\n  padding-inline: var(--space-4);", "  margin-inline: auto;\n  padding-inline: 0;") },
  { name: "(n) .counts loses list-style: none", check: "S2", mutate: (c) => replaceOnce(c, ".counts {\n  margin: 0;\n  padding: 0;\n  list-style: none;\n", ".counts {\n  margin: 0;\n  padding: 0;\n") },
  {
    name: "(o) gradient line back on .tombstone-dead",
    check: "S3",
    mutate: append(".tombstone-dead { background-image: linear-gradient(to bottom, transparent 2.25rem, var(--edge) 2.25rem, transparent 2.3rem); }"),
  },
  { name: "(p) .grid clips overflow", check: "S3", mutate: append(".grid { overflow: hidden; }") },
  { name: "(q) td, th break anywhere again", check: "S4", mutate: append("td, th { overflow-wrap: anywhere; }") },
  { name: "(r) .col-status may wrap", check: "S4", mutate: (c) => replaceOnce(c, "  white-space: nowrap;\n  width: 1%;", "  width: 1%;") },
  {
    name: "(s) stacked tfoot td keeps its border",
    check: "S5",
    mutate: (c) => replaceOnce(c, "  .breakdown tfoot td {\n    border-top: 0;", "  .breakdown tfoot td {\n    border-top: 3px solid var(--moon);"),
  },
  { name: "(t) :focus:not(:focus-visible) deleted", check: "S6", mutate: (c) => replaceOnce(c, ":focus:not(:focus-visible) {\n  outline: none;\n}", "") },
  { name: "(u) blanket :focus { outline: none }", check: "S6", mutate: (c) => replaceOnce(c, ":focus:not(:focus-visible) {", ":focus {") },
  { name: "(v) :focus-visible outline removed", check: "S6", mutate: (c) => replaceOnce(c, "outline: var(--ring-width) solid var(--focus);", "outline: none;") },
];
