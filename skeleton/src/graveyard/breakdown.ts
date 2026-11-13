import { toGrade } from "../death-score/index.js";
import type { DeathScoreCalibration, SignalPart } from "../death-score/index.js";
import { safeHttpUrl, hostOf } from "./safe-url.js";
import { formatRawValue, SIGNAL_INFO } from "./signal-info.js";
import type {
  Breakdown,
  BreakdownRow,
  CalibrationRow,
  GraveRecord,
  SignalRow,
  UnknownReasonView,
} from "./types.js";

const WITHHELD_CUT = 80;

const CALIBRATION_EXPLANATION =
  "The package's own author or registry declared it abandoned, so its score was raised to the dead band.";

export function formatCalibration(calibration: DeathScoreCalibration): string {
  return `Declared abandoned: ${calibration.reason}, +${calibration.points}`;
}

function ownReason(record: GraveRecord, part: SignalPart): UnknownReasonView | undefined {
  const reasons = record.unknownReasons;
  if (reasons === undefined || reasons === null) return undefined;
  if (!Object.prototype.hasOwnProperty.call(reasons, part.signal)) return undefined;
  return reasons[part.signal];
}

function signalRow(record: GraveRecord, part: SignalPart): SignalRow {
  const info = SIGNAL_INFO[part.signal];
  const row: SignalRow = {
    kind: "signal",
    signal: part.signal,
    label: info.label,
    explanation: info.explanation,
    rawValue: part.rawValue,
    rawDisplay: formatRawValue(part.signal, part.rawValue, part.status),
    weight: part.weight,
    points: part.points,
    status: part.status,
  };
  if (part.sourceUrl !== undefined && part.sourceUrl !== null) {
    const safe = safeHttpUrl(part.sourceUrl);
    if (safe !== undefined) {
      row.href = safe;
      row.hrefHost = hostOf(safe);
    } else {
      row.withheldUrl = String(part.sourceUrl).slice(0, WITHHELD_CUT);
    }
  }
  if (part.status === "unknown") {
    const reason = ownReason(record, part);
    if (reason !== undefined) row.unknownReason = reason;
  }
  return row;
}

/** Shows what the record says and whether it adds up. Never adjusts a number. */
export function buildBreakdown(record: GraveRecord): Breakdown {
  const { death } = record;
  const rows: BreakdownRow[] = death.parts.map((part) => signalRow(record, part));
  if (death.calibration !== undefined) {
    const calibrationRow: CalibrationRow = {
      kind: "calibration",
      label: "Declared abandoned",
      reason: death.calibration.reason,
      points: death.calibration.points,
      text: formatCalibration(death.calibration),
      explanation: CALIBRATION_EXPLANATION,
    };
    rows.push(calibrationRow);
  }
  let sum = 0;
  for (const row of rows) sum += row.points;
  return {
    rows,
    sum,
    score: death.score,
    consistent: sum === death.score,
    gradeConsistent: toGrade(death.score) === death.grade,
  };
}

/** The n signals with the most points (ties by part order), written "label raw-value". */
export function topSignals(record: GraveRecord, n: number): string[] {
  const indexed = record.death.parts.map((part, i) => ({ part, i }));
  indexed.sort((a, b) => b.part.points - a.part.points || a.i - b.i);
  return indexed
    .filter((e) => e.part.points > 0)
    .slice(0, Math.max(0, n))
    .map(({ part }) => `${SIGNAL_INFO[part.signal].label} ${formatRawValue(part.signal, part.rawValue, part.status)}`);
}

/** One-line tombstone summary: the calibration reason, else the top two signals. */
export function summaryLine(record: GraveRecord): string {
  const { calibration } = record.death;
  if (calibration !== undefined) return calibration.reason;
  const top = topSignals(record, 2);
  return top.length > 0 ? top.join(", ") : "No warning signs";
}
