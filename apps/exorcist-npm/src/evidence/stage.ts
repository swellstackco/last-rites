/**
 * Evidence stage orchestration (Requirements 1.1, 1.5-1.7, 9.3, 10.2, 11.5, 14.7).
 * Sources return outcomes and never throw; each call is additionally wrapped in a last-resort catch.
 */
import { assembleResult, type AssembleInput } from "./assemble.js";
import { validateConfig, type EvidenceConfig } from "./config.js";
import { CacheLayer } from "./http/cache.js";
import { ResilientClient } from "./http/resilient-client.js";
import type { EvidenceDeps } from "./http/types.js";
import { parseIsoTimestamp } from "./months-since.js";
import { parseRepoUrl } from "./repo-url.js";
import { fetchDepsDev } from "./sources/depsdev.js";
import { fetchE18e } from "./sources/e18e.js";
import { fetchGithub } from "./sources/github.js";
import { fetchNpm } from "./sources/npm.js";
import { fetchOsv } from "./sources/osv.js";
import { fail, type Outcome, type SourceContext } from "./sources/outcome.js";
import {
  EvidenceInputError,
  type EvidenceInput,
  type EvidenceStage,
  type Source,
} from "./types.js";

function parseNow(now: unknown): Date {
  if (now instanceof Date && !Number.isNaN(now.getTime())) return new Date(now.getTime());
  if (typeof now === "string") {
    const d = parseIsoTimestamp(now);
    if (d !== undefined) return d;
  }
  throw new EvidenceInputError("invalid now: expected a valid Date or ISO 8601 string");
}

async function guarded<T>(source: Source, run: () => Promise<Outcome<T>>): Promise<Outcome<T>> {
  try {
    return await run();
  } catch {
    return fail(source, "network_error");
  }
}

export function createEvidenceStage(config: EvidenceConfig, deps: EvidenceDeps): EvidenceStage {
  validateConfig(config);

  const ctx: SourceContext = {
    config,
    cache: new CacheLayer(
      config.cacheRoot,
      new ResilientClient(deps.http, deps.clock, deps.sleep, {
        maxConcurrency: config.maxConcurrency,
        maxRetries: config.maxRetries,
        githubMaxWaitSeconds: config.githubMaxWaitSeconds,
      }),
      deps.clock,
      config.ttlSeconds,
    ),
  };
  // deps.dev must not be retried (Requirement 7.6): its own cache over a client with maxRetries 0.
  const depsdevCtx: SourceContext = {
    config,
    cache: new CacheLayer(
      config.cacheRoot,
      new ResilientClient(deps.http, deps.clock, deps.sleep, {
        maxConcurrency: config.maxConcurrency,
        maxRetries: 0,
        githubMaxWaitSeconds: config.githubMaxWaitSeconds,
      }),
      deps.clock,
      config.ttlSeconds,
    ),
  };

  return async (input: EvidenceInput) => {
    const now = parseNow(input?.now);
    if (typeof input?.name !== "string" || input.name.trim() === "") {
      throw new EvidenceInputError("a package name is required");
    }
    const name = input.name.trim();

    const npm = await guarded("npm", () => fetchNpm(ctx, name, input.versionRange));

    // Short-circuits: package missing, or range matches nothing (all seven unknown, no more I/O).
    if (
      (!npm.ok && npm.reason.category === "not_found") ||
      (npm.ok && npm.value.resolution.kind === "no_match")
    ) {
      return assembleResult({ name, now, npm });
    }

    const repoRef = npm.ok ? parseRepoUrl(npm.value.repository) : undefined;
    const version = npm.ok && npm.value.resolution.kind === "resolved" ? npm.value.resolution.version : undefined;

    const [github, osv, e18e] = await Promise.all([
      repoRef ? guarded("github", () => fetchGithub(ctx, repoRef)) : Promise.resolve(undefined),
      version !== undefined ? guarded("osv", () => fetchOsv(ctx, name, version)) : Promise.resolve(undefined),
      guarded("e18e", () => fetchE18e(ctx, name)),
    ]);

    const base: AssembleInput = { name, now, npm, repoRef, github, osv, e18e };
    let result = assembleResult(base);

    if (config.depsdev.enabled) {
      const needs = {
        deprecated: result.signals.deprecated.kind === "unknown",
        monthsSinceLastPublish: result.signals.monthsSinceLastPublish.kind === "unknown",
      };
      if (needs.deprecated || needs.monthsSinceLastPublish) {
        const depsdev = await guarded("depsdev", () => fetchDepsDev(depsdevCtx, name, needs, version));
        result = assembleResult({ ...base, depsdev });
      }
    }
    return result;
  };
}
