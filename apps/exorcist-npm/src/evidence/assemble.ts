/**
 * assembleResult (Requirements 1.1, 4.4, 9.2, 9.4-9.6, 9.8, 11.4): a pure function from source
 * outcomes to an Evidence_Result. No I/O, no clock: Months_Since is computed from the injected `now`.
 * Everything is built by iterating SIGNAL_NAMES, so output order never depends on completion order.
 */
import { SIGNAL_NAMES, type PackageSignals, type SignalName, type SignalValue } from "@graveyard-kit/skeleton";
import { monthsSince } from "./months-since.js";
import type { RepoRef } from "./repo-url.js";
import { depsDevPageUrl, type DepsDevEvidence } from "./sources/depsdev.js";
import { E18E_DIRECTORY_URL, type E18eEvidence } from "./sources/e18e.js";
import { repoPageUrl, type GithubEvidence } from "./sources/github.js";
import { npmSourceUrl, type NpmEvidence } from "./sources/npm.js";
import { osvListUrl } from "./sources/osv.js";
import type { Failure, Outcome } from "./sources/outcome.js";
import type { EvidenceResult, FailureCategory, Source, UnknownReason } from "./types.js";

export interface AssembleInput {
  name: string;
  now: Date;
  npm: Outcome<NpmEvidence>;
  /** Repo_Ref parsed from the npm `repository` field; undefined when there is none. */
  repoRef?: RepoRef | undefined;
  /** Absent when GitHub was not queried. */
  github?: Outcome<GithubEvidence> | undefined;
  /** Absent when OSV was not queried. */
  osv?: Outcome<number> | undefined;
  /** Absent when e18e was not queried (only on the npm short-circuit paths). */
  e18e?: Outcome<E18eEvidence> | undefined;
  /** Absent unless deps.dev was enabled and queried. */
  depsdev?: Outcome<DepsDevEvidence> | undefined;
}

type Entry<T> = { value: SignalValue<T>; url?: string; reason?: UnknownReason };

export function reasonMessage(source: Source, category: FailureCategory, url: string | undefined): string {
  return url === undefined ? `${source}: ${category}` : `${source}: ${category} (${url})`;
}

function known<T>(value: T, url: string): Entry<T> {
  return { value: { kind: "known", value }, url };
}

function unknown<T>(failure: Failure, url: string | undefined): Entry<T> {
  return {
    value: { kind: "unknown" },
    reason: { source: failure.source, category: failure.category, message: reasonMessage(failure.source, failure.category, url) },
  };
}

/** Lift a per-field outcome into an entry. */
function lift<T>(o: Outcome<T>, url: string): Entry<T> {
  return o.ok ? known(o.value, url) : unknown(o.reason, url);
}

/** Months_Since of an ISO string; an unparseable timestamp is `malformed_response`. */
function months(o: Outcome<string>, now: Date, source: Source, url: string): Entry<number> {
  if (!o.ok) return unknown(o.reason, url);
  const m = monthsSince(o.value, now);
  return m === undefined ? unknown({ source, category: "malformed_response" }, url) : known(m, url);
}

export function assembleResult(input: AssembleInput): EvidenceResult {
  const { name, now, npm } = input;
  const npmUrl = npmSourceUrl(name);

  // Short-circuits (Requirements 1.5, 1.7): a missing package or a range matching nothing.
  const allNotFound: Failure | undefined =
    !npm.ok && npm.reason.category === "not_found"
      ? npm.reason
      : npm.ok && npm.value.resolution.kind === "no_match"
        ? { source: "npm", category: "not_found" }
        : undefined;

  const entries = {} as { [K in SignalName]: Entry<boolean> | Entry<number> };
  let replacement: EvidenceResult["replacement"];
  const warnings: string[] = [];

  if (allNotFound) {
    for (const s of SIGNAL_NAMES) entries[s] = unknown<boolean>(allNotFound, npmUrl);
  } else {
    // npm-derived signals
    entries.deprecated = npm.ok ? lift(npm.value.deprecated, npmUrl) : unknown<boolean>(npm.reason, npmUrl);
    entries.monthsSinceLastPublish = npm.ok
      ? months(npm.value.lastPublish, now, "npm", npmUrl)
      : unknown<number>(npm.reason, npmUrl);
    entries.maintainerCount = npm.ok ? lift(npm.value.maintainerCount, npmUrl) : unknown<number>(npm.reason, npmUrl);

    // GitHub-derived signals
    const ref = input.repoRef;
    const ghUrl = ref ? repoPageUrl(ref) : undefined;
    if (!npm.ok) {
      entries.repoArchived = unknown<boolean>(npm.reason, npmUrl);
      entries.monthsSinceLastCommit = unknown<number>(npm.reason, npmUrl);
    } else if (!ref) {
      const na: Failure = { source: "github", category: "not_applicable" };
      entries.repoArchived = unknown<boolean>(na, undefined);
      entries.monthsSinceLastCommit = unknown<number>(na, undefined);
    } else if (!input.github) {
      const f: Failure = { source: "github", category: "network_error" };
      entries.repoArchived = unknown<boolean>(f, ghUrl);
      entries.monthsSinceLastCommit = unknown<number>(f, ghUrl);
    } else if (!input.github.ok) {
      entries.repoArchived = unknown<boolean>(input.github.reason, ghUrl);
      entries.monthsSinceLastCommit = unknown<number>(input.github.reason, ghUrl);
    } else {
      entries.repoArchived = lift(input.github.value.repoArchived, ghUrl!);
      entries.monthsSinceLastCommit = months(input.github.value.lastCommit, now, "github", ghUrl!);
      warnings.push(...input.github.value.warnings);
    }

    // OSV
    const osvUrl = osvListUrl(name);
    if (!npm.ok) entries.openVulnsNoFix = unknown<number>(npm.reason, npmUrl);
    else if (npm.value.resolution.kind !== "resolved") {
      entries.openVulnsNoFix = unknown<number>({ source: "npm", category: "malformed_response" }, npmUrl);
    } else if (!input.osv) entries.openVulnsNoFix = unknown<number>({ source: "osv", category: "network_error" }, osvUrl);
    else entries.openVulnsNoFix = lift(input.osv, osvUrl);

    // e18e
    if (!input.e18e) {
      entries.knownReplacementExists = unknown<boolean>({ source: "e18e", category: "network_error" }, E18E_DIRECTORY_URL);
    } else if (!input.e18e.ok) {
      entries.knownReplacementExists = unknown<boolean>(input.e18e.reason, E18E_DIRECTORY_URL);
    } else {
      entries.knownReplacementExists = known(input.e18e.value.known, input.e18e.value.sourceUrl);
      replacement = input.e18e.value.replacement;
    }

    // deps.dev fills only unknown deprecated / monthsSinceLastPublish (Requirements 7.3-7.5)
    if (input.depsdev?.ok) {
      const dd = input.depsdev.value;
      const url = depsDevPageUrl(name);
      if (entries.deprecated.value.kind === "unknown" && dd.deprecated !== undefined) {
        entries.deprecated = known(dd.deprecated, url);
      }
      if (entries.monthsSinceLastPublish.value.kind === "unknown" && dd.lastPublish !== undefined) {
        const m = monthsSince(dd.lastPublish, now);
        if (m !== undefined) entries.monthsSinceLastPublish = known(m, url);
      }
    }
  }

  const signals = {} as Record<SignalName, SignalValue<boolean> | SignalValue<number>>;
  const sourceUrls: Partial<Record<SignalName, string>> = {};
  const unknownReasons: EvidenceResult["unknownReasons"] = {};
  for (const s of SIGNAL_NAMES) {
    const e = entries[s];
    signals[s] = e.value;
    if (e.value.kind === "known") sourceUrls[s] = e.url!;
    else if (e.reason) unknownReasons[s] = e.reason;
  }

  const result: EvidenceResult = {
    signals: { ...(signals as unknown as Omit<PackageSignals, "sourceUrls">), sourceUrls },
    unknownReasons,
    warnings,
  };
  if (replacement) result.replacement = replacement;
  return result;
}
