import type { UsageSurface } from "@graveyard-kit/skeleton/proof";
import type {
  AppRecipe,
  Clock,
  DemoStore,
  E18eEvidence,
  LoadedCandidate,
  Outcome,
  ReportFs,
  ScanPipeline,
  Watchdog,
} from "@graveyard-kit/exorcist-npm/programmatic";
import type { FsProbe } from "./guards.js";

export type { FsProbe } from "./guards.js";

/** Every seam of the server. `createExorcistServer(deps)` takes this and reads nothing else (Requirement 2.4). */
export interface ExorcistDeps {
  cwd: string;
  probe: FsProbe;
  demoStore: DemoStore;
  scan: {
    /** The Scan_Api's own pipeline (`createScanRuntime(...).pipeline`). */
    github: ScanPipeline;
    /** A pipeline over the same evidence stage and a `RepoFileSource` that reads `dir`. */
    local(dir: string): ScanPipeline;
    clock: Clock;
    timeoutSeconds: number;
    watchdog: Watchdog;
  };
  e18e(name: string): Promise<Outcome<E18eEvidence>>;
  usageSurface: UsageSurface;
  proof: {
    /** `exorcise` wants a Map; the app's `RECIPES` is a Record, so `wire.ts` converts it. */
    recipes: ReadonlyMap<string, AppRecipe>;
    loadOracle(pkg: string): { module: unknown; version: string } | undefined;
    loadCandidate(file: string): Promise<LoadedCandidate>;
    nodeReportFs: ReportFs;
    /** Only used by `exorcise` for its default `--out`, which the tool never reaches. */
    repoRoot: string;
  };
}
