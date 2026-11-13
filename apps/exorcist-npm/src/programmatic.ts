// The Programmatic_Entry: re-exports only, no logic. The Exorcist_Mcp imports from the app through this file alone.
export { createScanRuntime } from "./scan/runtime.js";
export type { RuntimeDeps } from "./scan/runtime.js";
export { createScanPipeline } from "./scan/pipeline.js";
export type { PipelineDeps, ScanPipeline } from "./scan/pipeline.js";
export { createRepoFileSource } from "./scan/repo-fetch.js";
export type { FileFetch, RepoFileSource } from "./scan/repo-fetch.js";
export { parseRepoTarget } from "./scan/repo-target.js";
export type { ParseRepoTargetOutcome, RepoTargetError } from "./scan/repo-target.js";
export { REPO_PATTERN } from "./scan/api/handler.js";
export { DEMO_NAME_PATTERN, createFsDemoStore } from "./scan/api/demo-store.js";
export type { DemoStore } from "./scan/api/demo-store.js";
export { DEMO_REPOS } from "./scan/demo-list.js";
export type { DemoRepo } from "./scan/demo-snapshot.js";
export { parseReport, serializeReport } from "./scan/report.js";
export type { ParseReportOutcome, ReportParseError } from "./scan/report.js";
export { assembleReport } from "./scan/assemble.js";
export type { AssembleReport } from "./scan/assemble.js";
export { createDeadline } from "./scan/stop-signal.js";
export type { StopController } from "./scan/stop-signal.js";
export { realWatchdog } from "./scan/api/watchdog.js";
export type { Watchdog } from "./scan/api/watchdog.js";
export { DEFAULT_SCAN_API_CONFIG } from "./scan/api/config.js";
export type { ScanApiConfig } from "./scan/api/config.js";
export { createFetchClient } from "./scan/fetch-client.js";
export type {
  RepoInput,
  RepoTarget,
  ScanError,
  ScanOutcome,
  ScanReport,
  ScannedDependency,
} from "./scan/types.js";
export { configFromEnv } from "./evidence/config.js";
export { createEvidenceStage } from "./evidence/stage.js";
export type { EvidenceStage } from "./evidence/types.js";
export type { EvidenceConfig } from "./evidence/config.js";
export { fetchE18e } from "./evidence/sources/e18e.js";
export type { E18eEvidence } from "./evidence/sources/e18e.js";
export type { Outcome, SourceContext } from "./evidence/sources/outcome.js";
export { CacheLayer } from "./evidence/http/cache.js";
export { ResilientClient } from "./evidence/http/resilient-client.js";
export type { Clock, HttpClient, Sleep } from "./evidence/http/types.js";
export type { ReplacementInfo } from "./evidence/types.js";
export { exorcise } from "./exorcise/run.js";
export type { ExorciseDeps, ExorciseOutcome } from "./exorcise/run.js";
export { isProofOutPath } from "./exorcise/cli-args.js";
export type { CliArgs } from "./exorcise/cli-args.js";
export { createUsageSurface } from "./exorcise/usage-surface.js";
export { createNodeSourceFs } from "./exorcise/source-fs.js";
export type { SourceFs } from "./exorcise/source-fs.js";
export { createNodeReportFs } from "./exorcise/report-store.js";
export type { ReportFs } from "./exorcise/report-store.js";
export { RECIPES } from "./exorcise/recipes/index.js";
export type { AppRecipe } from "./exorcise/recipes/types.js";
export { loadCandidate } from "./exorcise/candidate.js";
export type { LoadedCandidate } from "./exorcise/candidate.js";
