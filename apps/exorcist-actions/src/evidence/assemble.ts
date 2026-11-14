// assembleActionEvidence (Requirements 4.4, 4.6, 5.3, 5.5, 6.2 to 6.5, 6.7): a pure function from source
// outcomes to an EvidenceResult, with the structure of the npm `assembleResult`. No I/O, no clock: months
// come from the injected `now`. Entries are built by iterating SIGNAL_NAMES, so the result never depends on
// the order in which the sources completed.
import { SIGNAL_NAMES } from "@last-rites/skeleton";
import type { PackageSignals, SignalName, SignalValue } from "@last-rites/skeleton";
import { fetchGithub, monthsSince, osvListUrl, reasonMessage, repoPageUrl } from "@last-rites/exorcist-npm/programmatic";
import type { EvidenceStage, Outcome, ReplacementInfo } from "@last-rites/exorcist-npm/programmatic";
import { findReplacement } from "../replacements.js";
import { manifestPageUrl, releasesPageUrl, tagsPageUrl } from "./urls.js";
import { runtimeSignal } from "./manifest.js";
import type { ManifestEvidence, PublishEvidence } from "./sources.js";

export type EvidenceResult = Awaited<ReturnType<EvidenceStage>>;
export type GithubEvidence = Extract<Awaited<ReturnType<typeof fetchGithub>>, { ok: true }>["value"];
type Failure = Extract<Outcome<never>, { ok: false }>["reason"];
type Source = Failure["source"];

export interface ActionEvidenceAssembleInput {
  /** Action_Name `owner/repo`. */
  name: string;
  ref: string;
  path?: string | undefined;
  site: "step" | "job";
  now: Date;
  github?: Outcome<GithubEvidence> | undefined;
  publish?: Outcome<PublishEvidence> | undefined;
  /** Absent for a Site `job` use (no request is made). */
  manifest?: Outcome<ManifestEvidence> | undefined;
  osv?: Outcome<number> | undefined;
}

export const MAINTAINER_MESSAGE = "github: not_applicable (GitHub exposes no maintainer count for an action)";

type Entry<T> = { value: SignalValue<T>; url?: string; reason?: EvidenceResult["unknownReasons"][SignalName] };

const known = <T>(value: T, url: string): Entry<T> => ({ value: { kind: "known", value }, url });

function unknown<T>(failure: Failure, url: string | undefined): Entry<T> {
  return {
    value: { kind: "unknown" },
    reason: { source: failure.source, category: failure.category, message: reasonMessage(failure.source, failure.category, url) },
  };
}

/** A source that was not run at all counts as a network failure, never as alive. */
const missing = (source: Source): Failure => ({ source, category: "network_error" });

/** Months of an ISO string; an unparseable timestamp is `malformed_response`. */
function months(timestamp: string, now: Date, source: Source, url: string): Entry<number> {
  const m = monthsSince(timestamp, now);
  return m === undefined ? unknown({ source, category: "malformed_response" }, url) : known(m, url);
}

const splitName = (name: string): { owner: string; repo: string } => {
  const i = name.indexOf("/");
  return i < 0 ? { owner: name, repo: "" } : { owner: name.slice(0, i), repo: name.slice(i + 1) };
};

export function assembleActionEvidence(input: ActionEvidenceAssembleInput): EvidenceResult {
  const { name, ref, now } = input;
  const { owner, repo } = splitName(name);
  const entries = {} as { [K in SignalName]: Entry<boolean> | Entry<number> };
  const warnings: string[] = [];
  const addWarnings = (ws: readonly string[]): void => {
    for (const w of ws) if (!warnings.includes(w)) warnings.push(w);
  };

  // repoArchived, monthsSinceLastCommit
  const ghUrl = repoPageUrl({ owner, repo });
  const gh = input.github ?? { ok: false as const, reason: missing("github") };
  if (!gh.ok) {
    entries.repoArchived = unknown<boolean>(gh.reason, ghUrl);
    entries.monthsSinceLastCommit = unknown<number>(gh.reason, ghUrl);
  } else {
    const archived = gh.value.repoArchived;
    entries.repoArchived = archived.ok ? known(archived.value, ghUrl) : unknown<boolean>(archived.reason, ghUrl);
    const commit = gh.value.lastCommit;
    entries.monthsSinceLastCommit = commit.ok ? months(commit.value, now, "github", ghUrl) : unknown<number>(commit.reason, ghUrl);
    addWarnings(gh.value.warnings);
  }

  // monthsSinceLastPublish
  const pub = input.publish ?? { ok: false as const, reason: missing("github") };
  if (!pub.ok) {
    entries.monthsSinceLastPublish = unknown<number>(pub.reason, releasesPageUrl(owner, repo));
  } else {
    const url = pub.value.via === "tag" ? tagsPageUrl(owner, repo) : releasesPageUrl(owner, repo);
    entries.monthsSinceLastPublish = months(pub.value.timestamp, now, "github", url);
    addWarnings(pub.value.warnings);
  }

  // deprecated
  if (input.site === "job") {
    entries.deprecated = unknown<boolean>({ source: "github", category: "not_applicable" }, undefined);
  } else {
    const man = input.manifest ?? { ok: false as const, reason: missing("github") };
    if (!man.ok) {
      entries.deprecated = unknown<boolean>(man.reason, manifestPageUrl(name, ref, input.path, "action.yml"));
    } else {
      const url = manifestPageUrl(name, ref, input.path, man.value.file);
      const signal = runtimeSignal(man.value.manifest.using);
      entries.deprecated =
        signal === undefined ? unknown<boolean>({ source: "github", category: "malformed_response" }, url) : known(signal, url);
    }
  }

  // maintainerCount: GitHub exposes none for an action.
  entries.maintainerCount = {
    value: { kind: "unknown" },
    reason: { source: "github", category: "not_applicable", message: MAINTAINER_MESSAGE },
  };

  // openVulnsNoFix
  const osvUrl = osvListUrl(name);
  const osv = input.osv ?? { ok: false as const, reason: missing("osv") };
  entries.openVulnsNoFix = osv.ok ? known(osv.value, osvUrl) : unknown<number>(osv.reason, osvUrl);

  // knownReplacementExists. With no map entry the claim "none known" has no page of its own: the
  // repository page is the nearest public source.
  const entry = findReplacement(name);
  let replacement: ReplacementInfo | undefined;
  if (entry) {
    entries.knownReplacementExists = known(true, entry.sourceUrl);
    const to = entry.kind === "action" ? entry.to : entry.command;
    replacement = { type: entry.kind, replacement: to, replacements: [to] };
  } else {
    entries.knownReplacementExists = known(false, ghUrl);
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
