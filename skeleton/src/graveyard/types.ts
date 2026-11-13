import type { DeathScoreResult, GradeBand, SignalName } from "../death-score/index.js";

export interface UnknownReasonView {
  source: string;
  category: string;
  message: string;
}

/** Structural minimum. ScannedDependency satisfies it; extra fields ride along via the generic T. */
export interface GraveRecord {
  name: string;
  death: DeathScoreResult;
  unknownReasons?: Partial<Record<SignalName, UnknownReasonView>>;
}

export interface Grave<T extends GraveRecord> {
  /** Unique within a view: name, or `${name}#${n}` for the n-th (n >= 2) record with that name. */
  key: string;
  /** Position in the input list. */
  index: number;
  record: T;
}

export interface GradeGroup<T extends GraveRecord> {
  grade: GradeBand;
  /** Display order. */
  graves: Grave<T>[];
  /** Equal to graves.length. */
  count: number;
  /** True only for "alive". */
  defaultCollapsed: boolean;
}

export interface GraveyardView<T extends GraveRecord> {
  /** Always four entries, in GRADE_ORDER. */
  groups: [GradeGroup<T>, GradeGroup<T>, GradeGroup<T>, GradeGroup<T>];
  counts: Record<GradeBand, number>;
  total: number;
}

export interface SignalRow {
  kind: "signal";
  signal: SignalName;
  label: string;
  explanation: string;
  /** As in the part, e.g. "43". */
  rawValue: string;
  /** "43 months", "unknown". */
  rawDisplay: string;
  weight: number;
  points: number;
  status: "known" | "unknown";
  /** Present only when the part has a sourceUrl that is a Safe_Url. */
  href?: string;
  hrefHost?: string;
  /** Present when a sourceUrl exists but is not a Safe_Url; the raw value cut to 80 characters. */
  withheldUrl?: string;
  unknownReason?: UnknownReasonView;
}

export interface CalibrationRow {
  kind: "calibration";
  label: "Declared abandoned";
  reason: string;
  points: number;
  /** `Declared abandoned: ${reason}, +${points}` */
  text: string;
  explanation: string;
}

export type BreakdownRow = SignalRow | CalibrationRow;

export interface Breakdown {
  /** Signal rows in part order, then the calibration row if any. */
  rows: BreakdownRow[];
  /** Sum of rows[].points. */
  sum: number;
  /** The displayed Total_Row, copied from death.score. */
  score: number;
  /** sum === score */
  consistent: boolean;
  /** toGrade(score) === death.grade */
  gradeConsistent: boolean;
}
