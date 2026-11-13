import { SIGNAL_NAMES, scoreDeath } from "@graveyard-kit/skeleton";
import type { PackageSignals, SignalName } from "@graveyard-kit/skeleton";
import type { Clock, EvidenceResult, EvidenceStage, UnknownReason } from "../evidence/index.js";
import { assembleReport, type AssembleReport } from "./assemble.js";
import { inventory } from "./inventory.js";
import { runPool, type PoolRunner } from "./pool.js";
import { parseRepoTarget } from "./repo-target.js";
import type { FileFetch, RepoFileSource } from "./repo-fetch.js";
import type { StopSignal } from "./stop-signal.js";
import type {
  DependencyEntry,
  InventoryStage,
  RepoInput,
  ScanOutcome,
  ScannedDependency,
} from "./types.js";

export interface PipelineDeps {
  evidence: EvidenceStage;
  files: RepoFileSource;
  clock: Clock;
  /** maxDependencies defaults to 300; concurrency is EvidenceConfig.maxConcurrency. */
  limits: { maxDependencies: number; concurrency: number };
}

export interface ScanOneContext {
  evidence: EvidenceStage;
  now: Date;
}
export interface ScanOneResult {
  dep: ScannedDependency;
  failed: boolean;
}
export type ScanOne = (entry: DependencyEntry, ctx: ScanOneContext) => Promise<ScanOneResult>;

/** The swappable parts. Properties build over this record; sabotages replace one field. */
export interface PipelineParts {
  inventory: InventoryStage;
  pool: PoolRunner;
  scanOne: ScanOne;
  assemble: AssembleReport;
}

/** All seven signals unknown, one network_error reason each. Satisfies the evidence result invariant. */
export function failedEvidenceResult(name: string, _requested: string): EvidenceResult {
  const signals: Record<string, unknown> = {};
  const unknownReasons: Partial<Record<SignalName, UnknownReason>> = {};
  for (const s of SIGNAL_NAMES) {
    signals[s] = { kind: "unknown" };
    unknownReasons[s] = {
      source: "npm",
      category: "network_error",
      message: "npm: network_error (evidence lookup failed)",
    };
  }
  return {
    signals: signals as unknown as PackageSignals,
    unknownReasons,
    warnings: [`evidence failed for ${name}`],
  };
}

export const scanOne: ScanOne = async (entry, ctx) => {
  const versionRange = entry.resolvedVersion ?? entry.declaredRange; // lockfile version wins
  let evidence: EvidenceResult;
  let failed = false;
  try {
    evidence = await ctx.evidence({ name: entry.name, versionRange, now: ctx.now });
  } catch {
    failed = true;
    evidence = failedEvidenceResult(entry.name, versionRange);
  }
  let death;
  try {
    death = scoreDeath(evidence.signals);
  } catch {
    // Defensive: fall back once; a second throw propagates to internal_error.
    failed = true;
    evidence = failedEvidenceResult(entry.name, versionRange);
    death = scoreDeath(evidence.signals);
  }
  return {
    failed,
    dep: {
      ...entry,
      signals: evidence.signals,
      unknownReasons: evidence.unknownReasons,
      ...(evidence.replacement ? { replacement: evidence.replacement } : {}),
      evidenceWarnings: evidence.warnings,
      death,
    },
  };
};

export const REAL_PARTS: PipelineParts = {
  inventory,
  pool: runPool,
  scanOne,
  assemble: assembleReport,
};

export type ScanPipeline = (input: RepoInput, opts?: { signal?: StopSignal }) => Promise<ScanOutcome>;

export function createScanPipeline(deps: PipelineDeps, parts: PipelineParts = REAL_PARTS): ScanPipeline {
  return async (input, opts) => {
    try {
      const now = deps.clock(); // the only Clock read
      const scannedAt = now.toISOString();

      const parsed = parseRepoTarget(input);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const target = parsed.target;

      const manifest = await deps.files(target, "package.json");
      if (manifest.kind === "not_found") {
        return { ok: false, error: { code: "no_package_json", message: "package.json not found in the repository" } };
      }
      if (manifest.kind === "failed") {
        return {
          ok: false,
          error: {
            code: "repo_fetch_failed",
            message: `could not fetch package.json: ${manifest.category}`,
            failureCategory: manifest.category,
          },
        };
      }

      const lock: FileFetch = await deps.files(target, "package-lock.json");
      const pipelineWarnings: string[] = [];
      let lockText: string | undefined;
      if (lock.kind === "ok") lockText = lock.text;
      else if (lock.kind === "failed") {
        pipelineWarnings.push(`could not fetch package-lock.json: ${lock.category}`);
      }

      const inv = parts.inventory(manifest.text, lockText);
      if (!inv.ok) return { ok: false, error: inv.error };
      const { dependencies, skipped, warnings: invWarnings } = inv.inventory;

      if (dependencies.length + skipped.length > deps.limits.maxDependencies) {
        return {
          ok: false,
          error: {
            code: "too_many_dependencies",
            message: `repository declares ${dependencies.length + skipped.length} dependencies; the limit is ${deps.limits.maxDependencies}`,
          },
        };
      }

      const pool = await parts.pool(
        dependencies,
        deps.limits.concurrency,
        (entry) => parts.scanOne(entry, { evidence: deps.evidence, now }),
        opts?.signal,
      );
      if (opts?.signal?.aborted) {
        return { ok: false, error: { code: "scan_timeout", message: "scan exceeded its time limit" } };
      }

      const scanned: ScannedDependency[] = [];
      dependencies.forEach((entry, i) => {
        const r = pool.results[i];
        if (!r) return;
        scanned.push(r.dep);
        if (r.failed) {
          pipelineWarnings.push(
            `evidence failed for ${entry.name} (requested "${entry.resolvedVersion ?? entry.declaredRange}")`,
          );
        }
      });

      const report = parts.assemble({
        target,
        scannedAt,
        scanned,
        skipped,
        warnings: [...invWarnings, ...pipelineWarnings],
      });
      return { ok: true, report };
    } catch (e) {
      return {
        ok: false,
        error: { code: "internal_error", message: `internal error: ${e instanceof Error ? e.message : "unknown"}` },
      };
    }
  };
}
