// One Tombstone: a native <button> per Grave. All report strings are written as text.
import type { GradeBand } from "@graveyard-kit/skeleton";
import { GRADE_INFO, summaryLine } from "@graveyard-kit/skeleton/graveyard";
import type { Grave } from "@graveyard-kit/skeleton/graveyard";
import type { ScannedDependency } from "@graveyard-kit/exorcist-npm/report";
import { MAX_TOMBSTONE_TEXT } from "../constants.js";
import { h } from "../dom/h.js";
import type { ClassName } from "../dom/h.js";

export const TOMBSTONE_DESCRIPTION = "Opens the score breakdown";

const VARIANT: Record<GradeBand, ClassName> = {
  dead: "tombstone-dead",
  dying: "tombstone-dying",
  ailing: "tombstone-ailing",
  alive: "tombstone-alive",
};

/** Cut to `max` characters, the last one being an ellipsis when the text was longer. */
export function cutText(text: string, max: number = MAX_TOMBSTONE_TEXT): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Element id for a Grave, from its input index, never from its name. */
export function graveId(grave: Grave<ScannedDependency>): string {
  return `grave-${grave.index}`;
}

export function scoreText(score: number, grade: GradeBand): string {
  return `Death score ${score} out of 100: ${grade}. 0 is alive, 100 is dead.`;
}

export function renderTombstone(grave: Grave<ScannedDependency>): HTMLButtonElement {
  const { name, death } = grave.record;
  const grade = death.grade;
  const id = graveId(grave);
  const accessibleName = `${name}, ${grade}, score ${death.score} of 100`;
  const unknown = death.parts.filter((p) => p.status === "unknown").length;
  const scoreLabel = scoreText(death.score, grade);

  return h(
    "button",
    {
      type: "button",
      id,
      class: ["tombstone", VARIANT[grade]],
      title: accessibleName,
      "aria-label": accessibleName,
      "aria-describedby": `${id}-desc`,
      "data-key": grave.key,
      "data-grade": grade,
    },
    h("span", { class: ["tomb-label", "chip"], "aria-hidden": "true" }, GRADE_INFO[grade].label.toUpperCase()),
    h("span", { class: "tomb-name" }, cutText(name)),
    h(
      "span",
      { class: "tomb-score", title: scoreLabel },
      h("span", { "aria-hidden": "true" }, String(death.score)),
      h("span", { class: "visually-hidden" }, scoreLabel),
    ),
    h("span", { class: "tomb-grade", "aria-hidden": "true" }, GRADE_INFO[grade].label),
    h("span", { class: "tomb-summary" }, cutText(summaryLine(grave.record))),
    unknown > 0
      ? h(
          "span",
          { class: "tomb-badge", "aria-label": `${unknown} unknown ${unknown === 1 ? "signal" : "signals"}` },
          `${unknown} unknown`,
        )
      : null,
    h("span", { id: `${id}-desc`, class: "visually-hidden" }, TOMBSTONE_DESCRIPTION),
  );
}
