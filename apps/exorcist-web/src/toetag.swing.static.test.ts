// toe-tag-redesign 9.2: the swing is CSS-only, so the views must not schedule anything.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Tag_Swing is CSS-only", () => {
  it("views/detail.ts and views/tombstone.ts contain no timers or animation events", () => {
    for (const f of ["views/detail.ts", "views/tombstone.ts"]) {
      const src = readFileSync(fileURLToPath(new URL(`./${f}`, import.meta.url)), "utf8");
      expect(src, f).not.toMatch(/setTimeout|requestAnimationFrame|animationend/);
    }
  });
});
