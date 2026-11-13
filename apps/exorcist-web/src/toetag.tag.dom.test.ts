// @vitest-environment jsdom
// toe-tag-redesign 5.2: the Toe_Tag's structure, labels, accessible name and unknown/range band.
import { afterEach, describe, expect, it } from "vitest";
import type { PackageSignals } from "@graveyard-kit/skeleton";
import { GRADE_INFO } from "@graveyard-kit/skeleton/graveyard";
import { serializeReport } from "@graveyard-kit/exorcist-npm/report";
import { TAG_LABELS } from "./constants.js";
import { buildReport } from "./test-support/build-report.js";
import { mountPage } from "./test-support/dom-harness.js";
import type { Page } from "./test-support/dom-harness.js";
import { gradeLabels } from "./test-support/properties/p9.js";
import { ALIVE_SIGNALS, DYING_SIGNALS } from "./test-support/signals.js";
import { TOMBSTONE_DESCRIPTION } from "./views/tombstone.js";

const known = <T>(value: T) => ({ kind: "known" as const, value });
const DEAD_SIGNALS: PackageSignals = {
  deprecated: known(true),
  repoArchived: known(true),
  monthsSinceLastPublish: known(80),
  monthsSinceLastCommit: known(80),
  maintainerCount: known(0),
  openVulnsNoFix: known(3),
  knownReplacementExists: known(true),
};
const AILING_SIGNALS: PackageSignals = {
  deprecated: known(false),
  repoArchived: known(false),
  monthsSinceLastPublish: known(30),
  monthsSinceLastCommit: known(30),
  maintainerCount: known(1),
  openVulnsNoFix: known(0),
  knownReplacementExists: known(false),
};
const PARTLY_UNKNOWN: PackageSignals = { ...ALIVE_SIGNALS, monthsSinceLastCommit: { kind: "unknown" } };

let page: Page | undefined;
afterEach(() => page?.destroy());

async function mount(deps: Parameters<typeof buildReport>[0]): Promise<Page> {
  page = mountPage({ route: "#/demo/x", fetchRoutes: { "GET /api/demo/x": { body: serializeReport(buildReport(deps)) } } });
  await page.flush();
  page.document.querySelector<HTMLElement>("button.disclosure[aria-controls='alive-list']")?.click();
  return page;
}

const tag = (p: Page, key: string): HTMLElement => p.document.querySelector<HTMLElement>(`button.tombstone[data-key="${key}"]`) as HTMLElement;

describe("Toe_Tag", () => {
  it("DOM order: hole, package, score, cause, band, description; labels are aria-hidden", async () => {
    const p = await mount([
      { name: "d", signals: DEAD_SIGNALS },
      { name: "y", signals: DYING_SIGNALS },
      { name: "a", signals: AILING_SIGNALS },
      { name: "v", signals: ALIVE_SIGNALS },
    ]);
    const grades = ["d", "y", "a", "v"].map((k) => tag(p, k).getAttribute("data-grade"));
    expect(grades).toEqual(["dead", "dying", "ailing", "alive"]);
    for (const key of ["d", "y", "a", "v"]) {
      const t = tag(p, key);
      expect(Array.from(t.children).map((c) => c.className)).toEqual([
        "tag-hole",
        "tag-field tag-package",
        "tag-field tag-score",
        "tag-field tag-cause",
        "tag-band",
        "visually-hidden",
      ]);
      expect(t.children[0]?.getAttribute("aria-hidden")).toBe("true");
      const labels = Array.from(t.querySelectorAll(".tag-label"));
      expect(labels.map((l) => l.textContent)).toEqual([TAG_LABELS.package, TAG_LABELS.score, TAG_LABELS.cause]);
      expect(labels.every((l) => l.getAttribute("aria-hidden") === "true")).toBe(true);
      expect(labels.map((l) => l.textContent)).toEqual(["PACKAGE", "SCORE", "CAUSE"]);
      expect(t.querySelector(".tag-package > .tomb-name")).not.toBeNull();
      expect(t.querySelector(".tag-score > .tomb-score")).not.toBeNull();
      expect(t.querySelector(".tag-cause > .tomb-summary")).not.toBeNull();
      expect(t.querySelector(".tag-band > .tomb-grade")).not.toBeNull();
      expect(t.lastElementChild?.textContent).toBe(TOMBSTONE_DESCRIPTION);
    }
  });

  it("accessible name and description are unchanged; exactly one leaf equals the grade word", async () => {
    const p = await mount([
      { name: "d", signals: DEAD_SIGNALS },
      { name: "y", signals: DYING_SIGNALS },
      { name: "a", signals: AILING_SIGNALS },
      { name: "v", signals: ALIVE_SIGNALS },
    ]);
    for (const key of ["d", "y", "a", "v"]) {
      const t = tag(p, key);
      const grade = t.getAttribute("data-grade") as "dead";
      const score = t.querySelector(".tomb-score span[aria-hidden]")?.textContent;
      expect(t.getAttribute("aria-label")).toBe(`${key}, ${grade}, score ${score} of 100`);
      expect(t.getAttribute("title")).toBe(t.getAttribute("aria-label"));
      const desc = p.document.getElementById(t.getAttribute("aria-describedby") ?? "");
      expect(desc?.textContent).toBe(TOMBSTONE_DESCRIPTION);
      expect(gradeLabels(t, GRADE_INFO[grade].label)).toHaveLength(1);
    }
  });

  it("unknown signals show the badge and no range; otherwise the range and no badge", async () => {
    const p = await mount([
      { name: "u", signals: PARTLY_UNKNOWN },
      { name: "k", signals: DEAD_SIGNALS },
    ]);
    const u = tag(p, "u");
    expect(u.querySelector(".tomb-badge")?.textContent).toBe("1 unknown");
    expect(u.querySelector(".tag-range")).toBeNull();
    const k = tag(p, "k");
    expect(k.querySelector(".tomb-badge")).toBeNull();
    const range = k.querySelector(".tag-range");
    expect(range?.textContent).toBe(`${GRADE_INFO.dead.min}-${GRADE_INFO.dead.max}`);
    expect(range?.getAttribute("aria-hidden")).toBe("true");
  });

  it("a 200-character name is cut as before", async () => {
    const long = "n".repeat(250);
    const p = await mount([{ name: long, signals: DYING_SIGNALS }]);
    const t = p.document.querySelector<HTMLElement>("button.tombstone") as HTMLElement;
    const name = t.querySelector(".tomb-name")?.textContent ?? "";
    expect(name).toHaveLength(200);
    expect(name.endsWith("…")).toBe(true);
    expect(t.getAttribute("aria-label")).toContain(long);
  });
});
