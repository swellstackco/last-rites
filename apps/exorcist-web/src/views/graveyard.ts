// The Graveyard screen body: four group sections in Grade_Order, lazy alive group, skipped list.
import type { GradeBand } from "@last-rites/skeleton";
import { GRADE_INFO, GRADE_ORDER } from "@last-rites/skeleton/graveyard";
import type { Grave, GradeGroup, GraveyardView } from "@last-rites/skeleton/graveyard";
import type { ScannedDependency, SkippedEntry } from "@last-rites/exorcist-npm/report";
import { h } from "../dom/h.js";
import type { ClassName } from "../dom/h.js";
import { renderSkipped } from "./skipped.js";
import { renderTombstone } from "./tombstone.js";

export interface GraveyardHandle {
  element: HTMLElement;
  /** Focus the heading of a group; for the collapsed alive group, its disclosure button. */
  focusGroup(grade: GradeBand): void;
  /** The group heading of a grade (used as a focus fallback). */
  groupHeading(grade: GradeBand): HTMLElement | null;
  /** The rendered Tombstone for a key, if it exists (alive ones exist only after expanding). */
  tombstoneFor(key: string): HTMLElement | null;
  /** Expand the alive group (creates its Tombstones on first call). */
  expandAlive(): void;
}

export interface GraveyardOptions {
  view: GraveyardView<ScannedDependency>;
  skipped: readonly SkippedEntry[];
  onOpen(grave: Grave<ScannedDependency>, opener: HTMLElement): void;
}

const GRID: Record<GradeBand, ClassName> = {
  dead: "grid-dead",
  dying: "grid-dying",
  ailing: "grid-ailing",
  alive: "grid-alive",
};

export function groupId(grade: GradeBand): string {
  return `group-${grade}`;
}

export function renderGraveyard(opts: GraveyardOptions): GraveyardHandle {
  const { view } = opts;
  const headings = new Map<GradeBand, HTMLElement>();
  const lists = new Map<GradeBand, HTMLElement>();
  let aliveButton: HTMLButtonElement | null = null;
  let aliveList: HTMLElement | null = null;
  const tombstones = new Map<string, HTMLElement>();

  const buildList = (group: GradeGroup<ScannedDependency>): HTMLElement => {
    const items = group.graves.map((grave) => {
      const tomb = renderTombstone(grave);
      tombstones.set(grave.key, tomb);
      tomb.addEventListener("click", () => opts.onOpen(grave, tomb));
      return h("li", null, tomb);
    });
    return h("ul", { class: ["grid", GRID[group.grade]] }, items);
  };

  const expandAlive = (): void => {
    if (!aliveButton || !aliveList) return;
    const group = view.groups.find((g) => g.grade === "alive");
    if (!group) return;
    if (aliveList.childElementCount === 0) {
      const built = buildList(group);
      for (const li of Array.from(built.children)) aliveList.appendChild(li);
    }
    aliveList.hidden = false;
    aliveButton.setAttribute("aria-expanded", "true");
  };

  const sections = GRADE_ORDER.map((grade) => {
    const group = view.groups.find((g) => g.grade === grade) as GradeGroup<ScannedDependency>;
    const info = GRADE_INFO[grade];
    const heading = h(
      "h2",
      { class: "group-title", id: `${groupId(grade)}-title`, tabindex: -1 },
      `${info.label} (${group.count})`,
    );
    headings.set(grade, heading);
    const section = h("section", { class: "group", id: groupId(grade), "aria-labelledby": `${groupId(grade)}-title` }, heading);

    if (group.count === 0) return section;

    if (grade === "alive") {
      const listId = "alive-list";
      aliveList = h("ul", { class: ["grid", GRID.alive], id: listId, hidden: true });
      aliveButton = h(
        "button",
        { type: "button", class: ["btn", "disclosure"], "aria-expanded": "false", "aria-controls": listId },
        `${group.count} alive ${group.count === 1 ? "package" : "packages"}`,
      );
      aliveButton.addEventListener("click", () => {
        if (!aliveButton || !aliveList) return;
        if (aliveButton.getAttribute("aria-expanded") === "true") {
          aliveList.hidden = true;
          aliveButton.setAttribute("aria-expanded", "false");
        } else {
          expandAlive();
        }
      });
      lists.set(grade, aliveList);
      section.append(aliveButton, aliveList);
    } else {
      const list = buildList(group);
      lists.set(grade, list);
      section.appendChild(list);
    }
    return section;
  });

  const deadCount = view.counts.dead + view.counts.dying;
  const emptyMessage =
    view.total === 0
      ? h("p", { class: "notice", role: "status" }, `No dependencies found. Skipped: ${opts.skipped.length}.`)
      : deadCount === 0
        ? h(
            "p",
            { class: "notice", role: "status" },
            `No dead or dying packages found. ${view.counts.ailing} ailing, ${view.counts.alive} alive.`,
          )
        : null;

  const element = h(
    "div",
    { class: "stack" },
    emptyMessage,
    view.total === 0 ? null : sections,
    renderSkipped(opts.skipped),
  );

  return {
    element,
    focusGroup(grade) {
      if (grade === "alive" && aliveButton) aliveButton.focus();
      else headings.get(grade)?.focus();
    },
    groupHeading: (grade) => headings.get(grade) ?? null,
    tombstoneFor: (key) => tombstones.get(key) ?? null,
    expandAlive,
  };
}
