// Property 7 sabotages (toe-tag-redesign): Stylesheet text mutations (static part) and a DOM sabotage (DOM part).
import { addRest, inRest } from "./replace-once.js";
import type { SheetSabotage } from "./replace-once.js";
import type { ToeSabotage } from "./toe.js";

const SWING_RULE = ".sheet-tag { animation: tag-swing var(--swing-duration) ease-out 1 both; }";

export const TT7_SABOTAGES: readonly SheetSabotage[] = [
  {
    name: "tag-swing keyframes and rule outside the no-preference block",
    target: "gate",
    mutate: addRest(`@keyframes tag-swing { 0% { transform: rotate(0deg); } 100% { transform: rotate(0deg); } }\n${SWING_RULE}`),
  },
  { name: "animation-iteration infinite", target: "finite", mutate: inRest("animation: tag-swing var(--swing-duration) ease-out 1 both;", "animation: tag-swing var(--swing-duration) ease-out infinite both;") },
  { name: "transition on .tombstone outside the block", target: "gate", mutate: addRest(".tombstone { transition: transform 200ms ease; }") },
  { name: "remove the reduce block", target: "reduce", mutate: inRest("@media (prefers-reduced-motion: reduce) {", "@media (prefers-reduced-motion: no-preference) {") },
  { name: "rotate(25deg) in a keyframe", target: "swing", mutate: inRest("rotate(8deg)", "rotate(25deg)") },
  { name: "ember pulse comes back", target: "ember", mutate: addRest(".tombstone-dead { animation: ember-pulse 3s ease-in-out 1; }") },
];

/** The DOM part must fail when opening is deferred (as if it ran inside setTimeout(..., 700)). */
export const TT7_DOM_SABOTAGES: readonly ToeSabotage[] = [
  {
    name: "open() deferred by a timer",
    mutate: (doc) => {
      const panel = doc.querySelector<HTMLElement>('[role="dialog"]');
      if (panel) panel.hidden = true;
    },
  },
  {
    name: "focus not moved to the heading yet",
    mutate: (doc) => (doc.activeElement as HTMLElement | null)?.blur(),
  },
];

/** Source sabotage: a view that schedules the swing in JavaScript. */
export const TT7_SOURCE_SABOTAGE = "setTimeout(() => open(), 700);";
