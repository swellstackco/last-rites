import { SIGNAL_NAMES, type SignalName } from "@last-rites/skeleton";
import type { EvidenceResult, FailureCategory, Source } from "../types.js";

const CATEGORIES: readonly FailureCategory[] = [
  "not_found",
  "timeout",
  "rate_limited",
  "malformed_response",
  "network_error",
  "not_applicable",
  "incomplete",
];
const SOURCES: readonly Source[] = ["npm", "github", "osv", "e18e", "depsdev"];
const BOOLEAN_SIGNALS: ReadonlySet<SignalName> = new Set(["deprecated", "repoArchived", "knownReplacementExists"]);

function isAbsoluteUrl(v: unknown): boolean {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * The Evidence_Result invariant (design: "Evidence_Result invariants"). Returns every violation found
 * (empty when valid), so a failing property prints what exactly is wrong.
 */
export function evidenceResultProblems(r: EvidenceResult): string[] {
  const problems: string[] = [];
  const signals = r?.signals as unknown as Record<string, unknown> | undefined;
  if (!signals || typeof signals !== "object") return ["signals missing"];
  const urls = (signals["sourceUrls"] ?? {}) as Record<string, unknown>;
  const reasons = (r.unknownReasons ?? {}) as Record<string, { source?: unknown; category?: unknown; message?: unknown } | undefined>;

  const own = Object.keys(signals).filter((k) => k !== "sourceUrls");
  if (own.length !== SIGNAL_NAMES.length || SIGNAL_NAMES.some((s) => !own.includes(s))) {
    problems.push(`signals must have exactly the seven signal names, got [${own.join(", ")}]`);
  }

  for (const s of SIGNAL_NAMES) {
    const v = signals[s] as { kind?: unknown; value?: unknown } | undefined;
    const url = urls[s];
    const reason = reasons[s];
    if (v?.kind === "known") {
      if (BOOLEAN_SIGNALS.has(s)) {
        if (typeof v.value !== "boolean") problems.push(`${s}: known value must be a boolean`);
      } else if (typeof v.value !== "number" || !Number.isInteger(v.value) || v.value < 0) {
        problems.push(`${s}: known numeric value must be an integer >= 0, got ${String(v.value)}`);
      }
      if (!isAbsoluteUrl(url)) problems.push(`${s}: known signal needs an absolute source URL`);
      if (reason !== undefined) problems.push(`${s}: known signal must have no unknown reason`);
    } else if (v?.kind === "unknown") {
      if (url !== undefined) problems.push(`${s}: unknown signal must have no source URL`);
      if (reason === undefined) problems.push(`${s}: unknown signal needs exactly one reason`);
      else {
        if (!CATEGORIES.includes(reason.category as FailureCategory)) problems.push(`${s}: bad category ${String(reason.category)}`);
        if (!SOURCES.includes(reason.source as Source)) problems.push(`${s}: bad source ${String(reason.source)}`);
        if (typeof reason.message !== "string" || reason.message === "") problems.push(`${s}: reason needs a message`);
      }
    } else {
      problems.push(`${s}: neither known nor unknown`);
    }
  }
  for (const k of Object.keys(urls)) if (!SIGNAL_NAMES.includes(k as SignalName)) problems.push(`sourceUrls has unknown key ${k}`);
  for (const k of Object.keys(reasons)) if (!SIGNAL_NAMES.includes(k as SignalName)) problems.push(`unknownReasons has unknown key ${k}`);
  if (!Array.isArray(r.warnings) || r.warnings.some((w) => typeof w !== "string")) problems.push("warnings must be a string array");
  return problems;
}

export function isValidEvidenceResult(r: EvidenceResult): boolean {
  return evidenceResultProblems(r).length === 0;
}
