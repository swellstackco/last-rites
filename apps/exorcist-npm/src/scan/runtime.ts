import { CacheLayer } from "../evidence/http/cache.js";
import { ResilientClient } from "../evidence/http/resilient-client.js";
import { createEvidenceStage } from "../evidence/index.js";
import type { Clock, EvidenceConfig, HttpClient, Sleep } from "../evidence/index.js";
import { createScanPipeline, type ScanPipeline } from "./pipeline.js";
import { createRepoFileSource } from "./repo-fetch.js";

export interface RuntimeDeps {
  http: HttpClient;
  clock: Clock;
  sleep: Sleep;
  evidenceConfig: EvidenceConfig;
  maxDependencies: number;
}

/**
 * Built once per process: one evidence stage, one repo-file cache layer on the same cacheRoot, one pipeline.
 * A bad evidenceConfig throws EvidenceConfigError here, before any request.
 */
export function createScanRuntime(deps: RuntimeDeps): { pipeline: ScanPipeline } {
  const { http, clock, sleep, evidenceConfig, maxDependencies } = deps;
  const evidence = createEvidenceStage(evidenceConfig, { http, clock, sleep });
  const cache = new CacheLayer(
    evidenceConfig.cacheRoot,
    new ResilientClient(http, clock, sleep, {
      maxConcurrency: evidenceConfig.maxConcurrency,
      maxRetries: evidenceConfig.maxRetries,
      githubMaxWaitSeconds: evidenceConfig.githubMaxWaitSeconds,
    }),
    clock,
    evidenceConfig.ttlSeconds,
  );
  const files = createRepoFileSource(cache, evidenceConfig.requestTimeoutMs);
  const pipeline = createScanPipeline({
    evidence,
    files,
    clock,
    limits: { maxDependencies, concurrency: evidenceConfig.maxConcurrency },
  });
  return { pipeline };
}
