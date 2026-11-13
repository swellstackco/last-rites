// @vitest-environment jsdom
// toe-tag-polish Property TP4 (T7): a Toe_Tag name breaks only after "/" or "-". No network.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assertProperty } from "@graveyard-kit/skeleton/graveyard/testing";
import { build, checkName, checkRoundTrip, expectedPieces, roundTripArb } from "./test-support/properties/tp4.js";
import { TP4_SABOTAGES } from "./test-support/sabotage/tp4.js";
import { renderTombstone } from "./views/tombstone.js";
import { buildReport } from "./test-support/build-report.js";
import { DEAD_SIGNALS } from "./test-support/signals.js";

const pieces = (name: string): string[] => {
  const dep = buildReport([{ name, signals: DEAD_SIGNALS }]).dependencies[0]!;
  const el = renderTombstone({ key: name, index: 0, record: dep }).querySelector(".tomb-name")!;
  return Array.from(el.childNodes).map((n) => (n.nodeType === 1 ? "<wbr>" : n.textContent ?? ""));
};

describe("TP4: Split_Points", () => {
  it("<wbr> sits exactly after each / and -, text is unchanged, hostile names stay text", () => {
    assertProperty("TP4: split points", build());
  });

  it("withSplitPoints round-trips any string", () => {
    assertProperty("TP4: round trip", fc.property(roundTripArb, (s) => checkRoundTrip(s)));
  });

  it("@saithodev/semantic-release-backmerge breaks after the slash and each hyphen", () => {
    expect(pieces("@saithodev/semantic-release-backmerge")).toEqual(["@saithodev/", "<wbr>", "semantic-", "<wbr>", "release-", "<wbr>", "backmerge"]);
  });

  it("a name without separators has no <wbr>", () => {
    expect(pieces("plainname")).toEqual(["plainname"]);
  });

  it("a trailing separator gets no <wbr>, a leading one does", () => {
    expect(expectedPieces("trail-")).toEqual(["trail-"]);
    expect(pieces("-lead")).toEqual(["-", "<wbr>", "lead"]);
  });

  it("a hostile name stays text", () => {
    const name = "<img src=x onerror=alert(1)>-a/b";
    checkName(name);
    const dep = buildReport([{ name, signals: DEAD_SIGNALS }]).dependencies[0]!;
    const el = renderTombstone({ key: name, index: 0, record: dep }).querySelector(".tomb-name")!;
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toBe(name);
  });

  describe("sabotage", () => {
    for (const s of TP4_SABOTAGES) {
      it(`catches ${s.name}`, () => {
        expect(() => checkName("@saithodev/semantic-release-backmerge", s.mutate)).toThrow();
      });
    }
    it("the real markup passes the same name", () => {
      expect(() => checkName("@saithodev/semantic-release-backmerge")).not.toThrow();
    });
  });
});
