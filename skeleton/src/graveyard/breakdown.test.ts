import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHT_CONFIG, scoreDeath } from "../death-score/index.js";
import type { PackageSignals, SignalName } from "../death-score/index.js";
import { buildBreakdown, formatCalibration, summaryLine, topSignals } from "./breakdown.js";
import type { GraveRecord, SignalRow } from "./types.js";

const k = <T>(value: T) => ({ kind: "known", value }) as const;
const UNKNOWN = { kind: "unknown" } as const;

function signals(over: Partial<PackageSignals> = {}): PackageSignals {
  return {
    deprecated: k(false),
    repoArchived: k(false),
    monthsSinceLastPublish: k(0),
    monthsSinceLastCommit: k(0),
    maintainerCount: k(5),
    openVulnsNoFix: k(0),
    knownReplacementExists: k(false),
    ...over,
  };
}

function record(name: string, s: PackageSignals, extra: Partial<GraveRecord> = {}): GraveRecord {
  return { name, death: scoreDeath(s, DEFAULT_WEIGHT_CONFIG), ...extra };
}

const signalRows = (b: ReturnType<typeof buildBreakdown>): SignalRow[] =>
  b.rows.filter((r): r is SignalRow => r.kind === "signal");

describe("buildBreakdown", () => {
  it("adds a calibration row after the signal rows, and the points add up", () => {
    // deprecated + archived with everything else healthy: weighted sum is below the floor.
    const r = record("calibrated", signals({ deprecated: k(true), repoArchived: k(true) }));
    expect(r.death.calibration).toBeDefined();
    const b = buildBreakdown(r);
    const cal = r.death.calibration!;
    expect(cal.reason).toBe("deprecated + repo archived");
    const last = b.rows[b.rows.length - 1]!;
    expect(last.kind).toBe("calibration");
    if (last.kind === "calibration") {
      expect(last.text).toBe(`Declared abandoned: deprecated + repo archived, +${cal.points}`);
      expect(last.label).toBe("Declared abandoned");
    }
    expect(b.rows.filter((x) => x.kind === "calibration")).toHaveLength(1);
    expect(b.rows).toHaveLength(r.death.parts.length + 1);
    expect(b.sum).toBe(r.death.score);
    expect(b.consistent).toBe(true);
    expect(b.gradeConsistent).toBe(true);
  });

  it("formats the calibration text exactly", () => {
    expect(formatCalibration({ rule: "declared_abandoned", reason: "deprecated + repo archived", points: 3 })).toBe(
      "Declared abandoned: deprecated + repo archived, +3",
    );
  });

  it("has no calibration row when there is no calibration", () => {
    const r = record("plain", signals());
    expect(r.death.calibration).toBeUndefined();
    const b = buildBreakdown(r);
    expect(b.rows.every((x) => x.kind === "signal")).toBe(true);
    expect(b.rows.map((x) => (x as SignalRow).signal)).toEqual(r.death.parts.map((p) => p.signal));
    expect(b.consistent).toBe(true);
  });

  it("handles an all-unknown record with and without reasons", () => {
    const all = signals({
      deprecated: UNKNOWN,
      repoArchived: UNKNOWN,
      monthsSinceLastPublish: UNKNOWN,
      monthsSinceLastCommit: UNKNOWN,
      maintainerCount: UNKNOWN,
      openVulnsNoFix: UNKNOWN,
      knownReplacementExists: UNKNOWN,
    });
    const reason = { source: "npm", category: "network", message: "npm did not answer" };
    const withReason = buildBreakdown(record("u", all, { unknownReasons: { deprecated: reason } }));
    const rows = signalRows(withReason);
    expect(rows.every((x) => x.status === "unknown" && x.rawDisplay === "unknown")).toBe(true);
    expect(rows.find((x) => x.signal === "deprecated")!.unknownReason).toEqual(reason);
    expect(rows.find((x) => x.signal === "repoArchived")!.unknownReason).toBeUndefined();
    expect(withReason.consistent).toBe(true);
    expect(withReason.sum).toBeGreaterThan(0);

    const without = buildBreakdown(record("u", all));
    expect(signalRows(without).every((x) => x.unknownReason === undefined)).toBe(true);
  });

  it("does not leak prototype properties through unknownReasons", () => {
    const s = signals({ deprecated: UNKNOWN });
    const polluted = Object.create({ deprecated: { source: "x", category: "y", message: "leak" } }) as GraveRecord["unknownReasons"];
    const b = buildBreakdown(record("p", s, { unknownReasons: polluted }));
    expect(signalRows(b).find((x) => x.signal === "deprecated")!.unknownReason).toBeUndefined();
  });

  it("links safe source urls, withholds unsafe ones, and omits missing ones", () => {
    const long = "javascript:" + "x".repeat(200);
    const s = signals({
      sourceUrls: {
        deprecated: "https://registry.npmjs.org/p",
        repoArchived: long,
      },
    });
    const rows = signalRows(buildBreakdown(record("l", s)));
    const dep = rows.find((x) => x.signal === "deprecated")!;
    expect(dep.href).toBe("https://registry.npmjs.org/p");
    expect(dep.hrefHost).toBe("registry.npmjs.org");
    expect(dep.withheldUrl).toBeUndefined();
    const arc = rows.find((x) => x.signal === "repoArchived")!;
    expect(arc.href).toBeUndefined();
    expect(arc.withheldUrl).toBe(long.slice(0, 80));
    const none = rows.find((x) => x.signal === "maintainerCount")!;
    expect(none.href).toBeUndefined();
    expect(none.withheldUrl).toBeUndefined();
  });

  it("reports a tampered sum without changing the score", () => {
    const r = record("t", signals({ monthsSinceLastPublish: k(30) }));
    const tampered: GraveRecord = {
      ...r,
      death: { ...r.death, parts: r.death.parts.map((p, i) => (i === 0 ? { ...p, points: p.points + 7 } : p)) },
    };
    const b = buildBreakdown(tampered);
    expect(b.consistent).toBe(false);
    expect(b.score).toBe(r.death.score);
    expect(b.sum).toBe(r.death.score + 7);
  });

  it("reports a tampered grade", () => {
    const r = record("g", signals());
    const b = buildBreakdown({ ...r, death: { ...r.death, grade: "dead" } });
    expect(b.gradeConsistent).toBe(false);
    expect(b.score).toBe(r.death.score);
  });

  it("does not mutate the record", () => {
    const r = record("m", signals({ deprecated: k(true), repoArchived: k(true) }));
    const before = JSON.stringify(r);
    buildBreakdown(r);
    expect(JSON.stringify(r)).toBe(before);
  });
});

describe("summaryLine / topSignals", () => {
  it("prefers the calibration reason", () => {
    const r = record("c", signals({ deprecated: k(true), repoArchived: k(true) }));
    expect(summaryLine(r)).toBe("deprecated + repo archived");
  });

  it("otherwise uses the two signals with the most points", () => {
    const r = record("o", signals({ monthsSinceLastPublish: k(30), maintainerCount: k(1) }));
    expect(r.death.calibration).toBeUndefined();
    const ranked = [...r.death.parts].sort((a, b) => b.points - a.points);
    const top = topSignals(r, 2);
    expect(top).toHaveLength(2);
    const names: SignalName[] = [ranked[0]!.signal, ranked[1]!.signal];
    expect(names).toContain("monthsSinceLastPublish");
    expect(summaryLine(r)).toBe(top.join(", "));
    expect(top[0]).toContain("Months since last publish 30 months");
  });

  it("says something for a clean record", () => {
    expect(summaryLine(record("clean", signals())).length).toBeGreaterThan(0);
  });
});
