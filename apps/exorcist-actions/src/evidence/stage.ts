// The Evidence_Stage of the actions app (Requirements 4.1, 4.2, 4.5, 6.5 to 6.7). One CacheLayer over a
// ResilientClient (as the npm runtime builds it); the sources run with Promise.all and each is wrapped in a
// last-resort catch. The stage never rejects.
import { SIGNAL_NAMES } from "@graveyard-kit/skeleton";
import type { SignalName, SignalValue } from "@graveyard-kit/skeleton";
import { CacheLayer, ResilientClient, fail, fetchGithub, parseIsoTimestamp } from "@graveyard-kit/exorcist-npm/programmatic";
import type { Clock, EvidenceConfig, HttpClient, Outcome, Sleep, SourceContext } from "@graveyard-kit/exorcist-npm/programmatic";
import { assembleActionEvidence } from "./assemble.js";
import type { EvidenceResult } from "./assemble.js";
import { fetchActionsOsv, fetchManifest, fetchPublish } from "./sources.js";

export interface ActionEvidenceInput {
  /** Action_Name `owner/repo`. */
  name: string;
  /** `ref` and `path` of the first use of this name in inventory order. */
  ref: string;
  path?: string;
  site: "step" | "job";
  now: Date | string;
}

export type ActionEvidenceStage = (input: ActionEvidenceInput) => Promise<EvidenceResult>;

type Source = Extract<Outcome<never>, { ok: false }>["reason"]["source"];

async function guarded<T>(source: Source, run: () => Promise<Outcome<T>>): Promise<Outcome<T>> {
  try {
    return await run();
  } catch {
    return fail(source, "network_error");
  }
}

function parseNow(now: unknown): Date {
  if (now instanceof Date && !Number.isNaN(now.getTime())) return new Date(now.getTime());
  if (typeof now === "string") {
    const d = parseIsoTimestamp(now);
    if (d !== undefined) return d;
  }
  throw new Error("invalid now");
}

/** All seven signals unknown with category `network_error`, and the warning of Requirement 6.6. */
export function allUnknownEvidence(name: unknown): EvidenceResult {
  const label = typeof name === "string" ? name : "unknown";
  const signals = {} as Record<SignalName, SignalValue<boolean> | SignalValue<number>>;
  const unknownReasons: EvidenceResult["unknownReasons"] = {};
  for (const s of SIGNAL_NAMES) {
    signals[s] = { kind: "unknown" };
    unknownReasons[s] = { source: "github", category: "network_error", message: "github: network_error" };
  }
  return {
    signals: { ...(signals as unknown as Omit<EvidenceResult["signals"], "sourceUrls">), sourceUrls: {} },
    unknownReasons,
    warnings: [`evidence failed for ${label}`],
  };
}

export function createActionEvidenceStage(
  config: EvidenceConfig,
  deps: { http: HttpClient; clock: Clock; sleep: Sleep },
): ActionEvidenceStage {
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

  return async (input) => {
    try {
      const now = parseNow(input.now);
      const parts = typeof input.name === "string" ? input.name.split("/") : [];
      if (parts.length !== 2 || parts[0] === "" || parts[1] === "") throw new Error("invalid action name");
      const [owner, repo] = parts as [string, string];

      const [github, publish, manifest, osv] = await Promise.all([
        guarded("github", () => fetchGithub(ctx, { owner, repo })),
        guarded("github", () => fetchPublish(ctx, owner, repo)),
        input.site === "step"
          ? guarded("github", () => fetchManifest(ctx, input.name, input.ref, input.path))
          : Promise.resolve(undefined),
        guarded("osv", () => fetchActionsOsv(ctx, owner, repo)),
      ]);

      return assembleActionEvidence({
        name: input.name,
        ref: input.ref,
        ...(input.path !== undefined ? { path: input.path } : {}),
        site: input.site,
        now,
        github,
        publish,
        manifest,
        osv,
      });
    } catch {
      return allUnknownEvidence(input?.name);
    }
  };
}
