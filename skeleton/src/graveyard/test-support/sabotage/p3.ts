import { buildBreakdown } from "../../breakdown.js";
import type { Breakdown, BreakdownRow, GraveRecord } from "../../types.js";
import type { BuildBreakdownFn } from "../properties/p3.js";
import type { Sabotage } from "../sabotage-runner.js";

function rebuilt(record: GraveRecord, rows: BreakdownRow[], over: Partial<Breakdown> = {}): Breakdown {
  const real = buildBreakdown(record);
  const sum = rows.reduce((s, r) => s + r.points, 0);
  return { ...real, rows, sum, consistent: sum === record.death.score, ...over };
}

const omitCalibration: BuildBreakdownFn = (record) =>
  rebuilt(record, buildBreakdown(record).rows.filter((r) => r.kind !== "calibration"));

const calibrationTwice: BuildBreakdownFn = (record) => {
  const rows = buildBreakdown(record).rows;
  const cal = rows.filter((r) => r.kind === "calibration");
  return rebuilt(record, [...rows, ...cal]);
};

const weightForPoints: BuildBreakdownFn = (record) =>
  rebuilt(
    record,
    buildBreakdown(record).rows.map((r) => (r.kind === "signal" ? { ...r, points: r.weight } : r)),
  );

const excludeUnknown: BuildBreakdownFn = (record) => {
  const real = buildBreakdown(record);
  const sum = real.rows.reduce((s, r) => s + (r.kind === "signal" && r.status === "unknown" ? 0 : r.points), 0);
  return { ...real, sum, consistent: sum === record.death.score };
};

const totalFromPartsOnly: BuildBreakdownFn = (record) => {
  const real = buildBreakdown(record);
  const sum = real.rows.reduce((s, r) => s + (r.kind === "signal" ? r.points : 0), 0);
  return { ...real, sum, score: sum, consistent: true };
};

const scoreFromSum: BuildBreakdownFn = (record) => {
  const real = buildBreakdown(record);
  return { ...real, score: real.sum, consistent: true };
};

const alwaysConsistent: BuildBreakdownFn = (record) => ({ ...buildBreakdown(record), consistent: true });

export const P3_SABOTAGES: readonly Sabotage<BuildBreakdownFn>[] = [
  { name: "omits the calibration row", impl: omitCalibration },
  { name: "counts the calibration points twice", impl: calibrationTwice },
  { name: "uses weight where points belongs", impl: weightForPoints },
  { name: "excludes unknown rows from the sum", impl: excludeUnknown },
  { name: "computes the total from the parts only", impl: totalFromPartsOnly },
  { name: "computes score from the sum", impl: scoreFromSum },
  { name: "consistent is always true", impl: alwaysConsistent },
];
