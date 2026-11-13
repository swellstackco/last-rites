import { SIGNAL_NAMES } from "@graveyard-kit/skeleton";
import type { GradeBand, PackageSignals, SignalName } from "@graveyard-kit/skeleton";
import type { ReplacementInfo, UnknownReason } from "../evidence/index.js";
import { KIND_PRECEDENCE } from "./types.js";
import type { DependencyEntry, ScanReport, ScanSummary, ScannedDependency, SkippedEntry, SkipReason } from "./types.js";

export type ReportParseError = {
  category: "empty" | "invalid_json" | "missing_field" | "wrong_type" | "not_canonical";
  /** Names the path of the offending field when there is one. */
  message: string;
};
export type ParseReportOutcome = { ok: true; report: ScanReport } | { ok: false; error: ReportParseError };

export interface ReportCodec {
  serialize(report: ScanReport): string;
  parse(text: string): ParseReportOutcome;
}

const BOOLEAN_SIGNALS: ReadonlySet<SignalName> = new Set(["deprecated", "repoArchived", "knownReplacementExists"]);
const GRADES: readonly GradeBand[] = ["alive", "ailing", "dying", "dead"];
const SKIP_REASONS: readonly SkipReason[] = ["npm_alias", "git", "file", "link", "http", "workspace", "other"];
const SOURCES = ["npm", "github", "osv", "e18e", "depsdev"] as const;
const CATEGORIES = [
  "not_found",
  "timeout",
  "rate_limited",
  "malformed_response",
  "network_error",
  "not_applicable",
  "incomplete",
] as const;

// ---------------------------------------------------------------------------
// Serialize

function buildSignals(s: PackageSignals): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of SIGNAL_NAMES) {
    const v = s[name];
    out[name] = v.kind === "known" ? { kind: "known", value: v.value } : { kind: "unknown" };
  }
  if (s.sourceUrls !== undefined) {
    const urls: Record<string, string> = {};
    for (const name of SIGNAL_NAMES) {
      const u = s.sourceUrls[name];
      if (u !== undefined) urls[name] = u;
    }
    out["sourceUrls"] = urls;
  }
  return out;
}

function buildDependency(d: ScannedDependency): Record<string, unknown> {
  const out: Record<string, unknown> = { name: d.name, kinds: [...d.kinds], declaredRange: d.declaredRange };
  if (d.resolvedVersion !== undefined) out["resolvedVersion"] = d.resolvedVersion;
  out["versionSource"] = d.versionSource;
  out["signals"] = buildSignals(d.signals);
  const reasons: Record<string, unknown> = {};
  for (const name of SIGNAL_NAMES) {
    const r = d.unknownReasons[name];
    if (r) reasons[name] = { source: r.source, category: r.category, message: r.message };
  }
  out["unknownReasons"] = reasons;
  if (d.replacement !== undefined) {
    const rep: Record<string, unknown> = { type: d.replacement.type };
    if (d.replacement.replacement !== undefined) rep["replacement"] = d.replacement.replacement;
    rep["replacements"] = [...d.replacement.replacements];
    out["replacement"] = rep;
  }
  out["evidenceWarnings"] = [...d.evidenceWarnings];
  out["death"] = {
    score: d.death.score,
    grade: d.death.grade,
    parts: d.death.parts.map((p) => {
      const part: Record<string, unknown> = {
        signal: p.signal,
        rawValue: p.rawValue,
        weight: p.weight,
        points: p.points,
        status: p.status,
      };
      if (p.sourceUrl !== undefined) part["sourceUrl"] = p.sourceUrl;
      return part;
    }),
  };
  return out;
}

export function serializeReport(report: ScanReport): string {
  const obj = {
    repo: report.repo,
    ref: report.ref,
    scannedAt: report.scannedAt,
    dependencies: report.dependencies.map(buildDependency),
    skipped: report.skipped.map((s) => ({ name: s.name, kind: s.kind, specifier: s.specifier, reason: s.reason })),
    warnings: [...report.warnings],
    summary: {
      total: report.summary.total,
      skipped: report.summary.skipped,
      alive: report.summary.alive,
      ailing: report.summary.ailing,
      dying: report.summary.dying,
      dead: report.summary.dead,
    },
  };
  return JSON.stringify(obj, null, 2) + "\n";
}

// ---------------------------------------------------------------------------
// Parse

class Fail extends Error {
  constructor(
    readonly category: ReportParseError["category"],
    message: string,
  ) {
    super(message);
  }
}

type Rec = Record<string, unknown>;

function describe(v: unknown): string {
  return v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
}

function field(o: Rec, key: string, path: string): unknown {
  if (!Object.hasOwn(o, key)) throw new Fail("missing_field", `${path}.${key} is missing`);
  return o[key];
}

function asObject(v: unknown, path: string): Rec {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new Fail("wrong_type", `${path} must be an object, got ${describe(v)}`);
  }
  return v as Rec;
}
function asArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new Fail("wrong_type", `${path} must be an array, got ${describe(v)}`);
  return v;
}
function asString(v: unknown, path: string): string {
  if (typeof v !== "string") throw new Fail("wrong_type", `${path} must be a string, got ${describe(v)}`);
  return v;
}
function asBoolean(v: unknown, path: string): boolean {
  if (typeof v !== "boolean") throw new Fail("wrong_type", `${path} must be a boolean, got ${describe(v)}`);
  return v;
}
function asNumber(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Fail("wrong_type", `${path} must be a finite number`);
  return v;
}
function asInteger(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isInteger(v)) throw new Fail("wrong_type", `${path} must be an integer`);
  return v;
}
function asEnum<T extends string>(v: unknown, allowed: readonly T[], path: string): T {
  const s = asString(v, path);
  if (!(allowed as readonly string[]).includes(s)) throw new Fail("wrong_type", `${path} has invalid value "${s}"`);
  return s as T;
}
function strings(v: unknown, path: string): string[] {
  return asArray(v, path).map((x, i) => asString(x, `${path}[${i}]`));
}

function parseSignals(v: unknown, path: string): PackageSignals {
  const o = asObject(v, path);
  const out: Rec = {};
  for (const name of SIGNAL_NAMES) {
    const p = `${path}.${name}`;
    const sv = asObject(field(o, name, path), p);
    const kind = asEnum(field(sv, "kind", p), ["known", "unknown"], `${p}.kind`);
    if (kind === "unknown") {
      out[name] = { kind: "unknown" };
    } else {
      const raw = field(sv, "value", p);
      out[name] = {
        kind: "known",
        value: BOOLEAN_SIGNALS.has(name) ? asBoolean(raw, `${p}.value`) : asInteger(raw, `${p}.value`),
      };
    }
  }
  if (Object.hasOwn(o, "sourceUrls")) {
    const urls = asObject(o["sourceUrls"], `${path}.sourceUrls`);
    const sourceUrls: Rec = {};
    for (const key of Object.keys(urls)) {
      if (!(SIGNAL_NAMES as readonly string[]).includes(key)) {
        throw new Fail("wrong_type", `${path}.sourceUrls.${key} is not a signal name`);
      }
    }
    for (const name of SIGNAL_NAMES) {
      if (Object.hasOwn(urls, name)) sourceUrls[name] = asString(urls[name], `${path}.sourceUrls.${name}`);
    }
    out["sourceUrls"] = sourceUrls;
  }
  return out as unknown as PackageSignals;
}

function parseUnknownReasons(v: unknown, path: string): Partial<Record<SignalName, UnknownReason>> {
  const o = asObject(v, path);
  for (const key of Object.keys(o)) {
    if (!(SIGNAL_NAMES as readonly string[]).includes(key)) {
      throw new Fail("wrong_type", `${path}.${key} is not a signal name`);
    }
  }
  const out: Partial<Record<SignalName, UnknownReason>> = {};
  for (const name of SIGNAL_NAMES) {
    if (!Object.hasOwn(o, name)) continue;
    const p = `${path}.${name}`;
    const r = asObject(o[name], p);
    out[name] = {
      source: asEnum(field(r, "source", p), SOURCES, `${p}.source`),
      category: asEnum(field(r, "category", p), CATEGORIES, `${p}.category`),
      message: asString(field(r, "message", p), `${p}.message`),
    };
  }
  return out;
}

function parseReplacement(v: unknown, path: string): ReplacementInfo {
  const o = asObject(v, path);
  const out: { type: string; replacement?: string; replacements: string[] } = {
    type: asString(field(o, "type", path), `${path}.type`),
    replacements: [],
  };
  if (Object.hasOwn(o, "replacement")) out.replacement = asString(o["replacement"], `${path}.replacement`);
  out.replacements = strings(field(o, "replacements", path), `${path}.replacements`);
  const ordered: ReplacementInfo =
    out.replacement !== undefined
      ? { type: out.type, replacement: out.replacement, replacements: out.replacements }
      : { type: out.type, replacements: out.replacements };
  return ordered;
}

function parseDeath(v: unknown, path: string): ScannedDependency["death"] {
  const o = asObject(v, path);
  const score = asInteger(field(o, "score", path), `${path}.score`);
  const grade = asEnum(field(o, "grade", path), GRADES, `${path}.grade`);
  const parts = asArray(field(o, "parts", path), `${path}.parts`).map((pv, i) => {
    const p = `${path}.parts[${i}]`;
    const po = asObject(pv, p);
    const part: ScannedDependency["death"]["parts"][number] = {
      signal: asEnum(field(po, "signal", p), SIGNAL_NAMES, `${p}.signal`),
      rawValue: asString(field(po, "rawValue", p), `${p}.rawValue`),
      weight: asNumber(field(po, "weight", p), `${p}.weight`),
      points: asInteger(field(po, "points", p), `${p}.points`),
      status: asEnum(field(po, "status", p), ["known", "unknown"], `${p}.status`),
    };
    if (Object.hasOwn(po, "sourceUrl")) part.sourceUrl = asString(po["sourceUrl"], `${p}.sourceUrl`);
    return part;
  });
  return { score, grade, parts };
}

function parseDependency(v: unknown, path: string): ScannedDependency {
  const o = asObject(v, path);
  const entry: DependencyEntry = {
    name: asString(field(o, "name", path), `${path}.name`),
    kinds: asArray(field(o, "kinds", path), `${path}.kinds`).map((k, i) =>
      asEnum(k, KIND_PRECEDENCE, `${path}.kinds[${i}]`),
    ),
    declaredRange: asString(field(o, "declaredRange", path), `${path}.declaredRange`),
    versionSource: "range",
  };
  if (Object.hasOwn(o, "resolvedVersion")) entry.resolvedVersion = asString(o["resolvedVersion"], `${path}.resolvedVersion`);
  entry.versionSource = asEnum(field(o, "versionSource", path), ["lockfile", "range"], `${path}.versionSource`);
  const dep: ScannedDependency = {
    ...entry,
    signals: parseSignals(field(o, "signals", path), `${path}.signals`),
    unknownReasons: parseUnknownReasons(field(o, "unknownReasons", path), `${path}.unknownReasons`),
    evidenceWarnings: [],
    death: { score: 0, grade: "alive", parts: [] },
  };
  if (Object.hasOwn(o, "replacement")) dep.replacement = parseReplacement(o["replacement"], `${path}.replacement`);
  dep.evidenceWarnings = strings(field(o, "evidenceWarnings", path), `${path}.evidenceWarnings`);
  dep.death = parseDeath(field(o, "death", path), `${path}.death`);
  return dep;
}

function parseSkipped(v: unknown, path: string): SkippedEntry {
  const o = asObject(v, path);
  return {
    name: asString(field(o, "name", path), `${path}.name`),
    kind: asEnum(field(o, "kind", path), KIND_PRECEDENCE, `${path}.kind`),
    specifier: asString(field(o, "specifier", path), `${path}.specifier`),
    reason: asEnum(field(o, "reason", path), SKIP_REASONS, `${path}.reason`),
  };
}

function parseSummary(v: unknown, path: string): ScanSummary {
  const o = asObject(v, path);
  const n = (k: keyof ScanSummary) => asInteger(field(o, k, path), `${path}.${k}`);
  return { total: n("total"), skipped: n("skipped"), alive: n("alive"), ailing: n("ailing"), dying: n("dying"), dead: n("dead") };
}

export function parseReport(text: string): ParseReportOutcome {
  try {
    if (typeof text !== "string" || text.trim() === "") {
      throw new Fail("empty", "report text is empty");
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Fail("invalid_json", `report is not valid JSON: ${(e as Error).message}`);
    }
    const root = "report";
    const o = asObject(json, root);
    const report: ScanReport = {
      repo: asString(field(o, "repo", root), "repo"),
      ref: asString(field(o, "ref", root), "ref"),
      scannedAt: asString(field(o, "scannedAt", root), "scannedAt"),
      dependencies: asArray(field(o, "dependencies", root), "dependencies").map((d, i) =>
        parseDependency(d, `dependencies[${i}]`),
      ),
      skipped: asArray(field(o, "skipped", root), "skipped").map((s, i) => parseSkipped(s, `skipped[${i}]`)),
      warnings: strings(field(o, "warnings", root), "warnings"),
      summary: parseSummary(field(o, "summary", root), "summary"),
    };
    if (serializeReport(report) !== text) {
      throw new Fail("not_canonical", "report text is valid but not in canonical form");
    }
    return { ok: true, report };
  } catch (e) {
    if (e instanceof Fail) return { ok: false, error: { category: e.category, message: e.message } };
    return { ok: false, error: { category: "invalid_json", message: `unreadable report: ${String(e)}` } };
  }
}

export const REAL_CODEC: ReportCodec = { serialize: serializeReport, parse: parseReport };
