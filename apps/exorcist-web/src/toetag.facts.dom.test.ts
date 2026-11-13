// @vitest-environment jsdom
// toe-tag-redesign 2.2: toeFacts reads a hand-built DOM through the Fact_Hooks and ignores decoration.
import { describe, expect, it } from "vitest";
import { toeFacts } from "./test-support/toe-facts.js";

describe("toeFacts", () => {
  it("reads the hooks and ignores layout classes, Tag_Labels and decorative spans", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <header class="header"><h1>The Graveyard: a/b</h1><p class="meta">Last Rites</p><p class="meta">Snapshot · ref x</p>
        <ul class="counts"><li><button data-grade="dead" aria-label="Dead: 1."><span class="num">1</span><span>Dead</span></button></li></ul>
        <p class="legend">Score ranges</p></header>
      <section class="group" id="group-dead"><h2>Dead (1)</h2><ul><li>
        <button class="tombstone x-layout" data-key="k" data-grade="dead" aria-label="k, dead, score 90 of 100">
          <span class="tag-hole" aria-hidden="true"></span><span class="tag-label" aria-hidden="true">PACKAGE</span>
          <span class="tomb-name">k</span><span class="tomb-score"><span aria-hidden="true">90</span><span class="visually-hidden">Death score 90</span></span>
          <span class="tomb-grade">Dead</span><span class="tomb-summary">because</span><span class="tomb-badge" aria-label="1 unknown signal">1 unknown</span>
        </button></li></ul></section>`;
    const f = toeFacts(root);
    expect(f.header?.heading).toBe("The Graveyard: a/b");
    expect(f.header?.meta).toBe("Snapshot · ref x");
    expect(f.groups).toEqual([{ grade: "dead", title: "Dead (1)", keys: ["k"] }]);
    expect(f.tombstones[0]).toEqual({
      key: "k", grade: "dead", label: "k, dead, score 90 of 100", name: "k", score: "90", scoreText: "Death score 90",
      gradeWord: "Dead", summary: "because", badge: "1 unknown", badgeLabel: "1 unknown signal",
    });
    expect(f.breakdown).toBeNull();
    expect(f.proof).toBeNull();
  });
});
