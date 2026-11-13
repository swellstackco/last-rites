/** Public surface of the npm scanner. Exports the `inventory` stage only: no `replacement` or `proof` stage. */
export { inventory } from "./inventory.js";
export { createScanPipeline } from "./pipeline.js";
export type { ScanPipeline, PipelineDeps } from "./pipeline.js";
export { serializeReport, parseReport } from "./report.js";
export type { ParseReportOutcome, ReportParseError } from "./report.js";
export type {
  DependencyEntry,
  DependencyKind,
  FetchFailureCategory,
  InventoryError,
  InventoryOutcome,
  InventoryResult,
  InventoryStage,
  RepoInput,
  RepoTarget,
  ScanError,
  ScanOutcome,
  ScanReport,
  ScanSummary,
  ScannedDependency,
  SkipReason,
  SkippedEntry,
} from "./types.js";
