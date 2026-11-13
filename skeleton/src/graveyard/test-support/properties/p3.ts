import fc from "fast-check";
import { toGrade } from "../../../death-score/index.js";
import { buildBreakdown } from "../../breakdown.js";
import type { Breakdown, GraveRecord } from "../../types.js";
import { scoredRecordArb, tamperedRecordArb } from "../arbitraries.js";
import { ensure } from "../sabotage-runner.js";

export type BuildBreakdownFn = (record: GraveRecord) => Breakdown;

function expectedSum(record: GraveRecord): number {
  const parts = record.death.parts.reduce((s, p) => s + p.points, 0);
  return parts + (record.death.calibration?.points ?? 0);
}

/**
 * Property 3: breakdown rows sum to the displayed score.
 * Returns a combined property over consistent and tampered records.
 */
export function build(impl: BuildBreakdownFn = buildBreakdown): fc.IPropertyWithHooks<[GraveRecord, GraveRecord]> {
  return fc.property(scoredRecordArb, tamperedRecordArb, (record, tampered) => {
    // --- consistent record ---
    const b = impl(record);
    const d = record.death;
    const signals = b.rows.filter((r) => r.kind === "signal");
    ensure(signals.length === d.parts.length, "one signal row per part");
    signals.forEach((r, i) => {
      ensure(r.kind === "signal" && r.signal === d.parts[i]!.signal, `signal row ${i} must follow part order`);
    });
    const sum = b.rows.reduce((s, r) => s + r.points, 0);
    ensure(sum === d.score, `row points sum ${sum} must equal score ${d.score}`);
    ensure(b.score === d.score, "breakdown score must equal death.score");
    ensure(b.consistent === true, "consistent must be true for an untampered record");
    ensure(b.sum === sum, "breakdown sum must equal the row sum");

    const calRows = b.rows.filter((r) => r.kind === "calibration");
    ensure(calRows.length === (d.calibration ? 1 : 0), "calibration row iff death.calibration");
    if (d.calibration) {
      const last = b.rows[b.rows.length - 1]!;
      ensure(last.kind === "calibration", "calibration row must come after all signal rows");
      ensure(
        last.kind === "calibration" &&
          last.text === `Declared abandoned: ${d.calibration.reason}, +${d.calibration.points}`,
        "calibration text must match",
      );
    }
    d.parts.forEach((p, i) => {
      const row = b.rows[i]!;
      if (p.status === "unknown") {
        ensure(row.kind === "signal" && row.status === "unknown", "unknown part must give an unknown row");
      }
      ensure(row.points === p.points, `row ${i} must show the part's points, not its weight`);
    });

    // --- tampered record: never adjust numbers, report disagreement ---
    const t = impl(tampered);
    const tsum = expectedSum(tampered);
    ensure(t.score === tampered.death.score, "tampered score must be the unchanged death.score");
    ensure(
      t.consistent === (tsum === tampered.death.score),
      `consistent must be ${tsum === tampered.death.score} (parts+calibration ${tsum}, score ${tampered.death.score})`,
    );
    ensure(
      t.gradeConsistent === (toGrade(tampered.death.score) === tampered.death.grade),
      "gradeConsistent must reflect toGrade(score) === grade",
    );
  });
}
