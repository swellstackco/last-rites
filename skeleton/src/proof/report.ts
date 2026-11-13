// Proof_Report codec: canonical serializer, strict parser, consistency check.
// Pure: no Node, no fast-check. Pattern copied from apps/exorcist-npm/src/scan/report.ts.

import type {
  CallSite,
  CounterexampleRecord,
  ImportForm,
  ImportSite,
  ProofAttempt,
  ProofErrorCode,
  ProofReport,
  ProofStatus,
  Recommendation,
  ShapeResult,
} from "./types.js";

export type ProofReportParseError = {
  category: "empty" | "invalid_json" | "missing_field" | "wrong_type" | "not_canonical" | "inconsistent";
  /** Names the path of the offending field when there is one. */
  message: string;
};
export type ParseProofReportOutcome = { ok: true; report: ProofReport } | { ok: false; error: ProofReportParseError };

const IMPORT_FORMS: readonly ImportForm[] = [
  "import-default",
  "import-named",
  "import-namespace",
  "import-side-effect",
  "import-type",
  "import-equals",
  "re-export",
  "require",
  "require-unbound",
  "dynamic-import",
];
const STATUSES: readonly ProofStatus[] = ["proved", "counterexample", "no-call-sites", "error"];
const ERROR_CODES: readonly ProofErrorCode[] = [
  "invalid_runs",
  "no_source_files",
  "no_recipe",
  "oracle_version_mismatch",
  "unsupported_call_shapes",
  "oracle_missing_member",
  "candidate_missing_member",
  "arbitrary_mismatch",
  "async_not_supported",
  "recipe_failure",
  "insufficient_coverage",
];
const SHAPE_STATUSES = ["passed", "failed", "skipped", "error"] as const;
const RECOMMENDATIONS: readonly Recommendation[] = ["remove-dependency", "review-imports"];

// ---------------------------------------------------------------------------
// Serialize (field by field, never relying on input key order)

function buildCallSite(c: CallSite): Record<string, unknown> {
  const out: Record<string, unknown> = {
    file: c.file,
    line: c.line,
    column: c.column,
    callee: c.callee,
    member: c.member,
    argCount: c.argCount,
    argTexts: [...c.argTexts],
    enclosing: c.enclosing,
  };
  if (c.consumedAs !== undefined) out["consumedAs"] = c.consumedAs;
  if (c.new !== undefined) out["new"] = c.new;
  return out;
}

function buildImportSite(s: ImportSite): Record<string, unknown> {
  return { file: s.file, line: s.line, column: s.column, form: s.form };
}

/** Coverage with keys sorted by UTF-16 code unit; `__proto__` is defined, never assigned. */
function buildCoverage(cov: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(cov).sort()) {
    Object.defineProperty(out, key, { value: cov[key], enumerable: true, writable: true, configurable: true });
  }
  return out;
}

function buildShape(s: ShapeResult): Record<string, unknown> {
  return { id: s.id, status: s.status, runs: s.runs, coverage: buildCoverage(s.coverage) };
}

function buildCounterexample(c: CounterexampleRecord): Record<string, unknown> {
  return {
    shape: c.shape,
    input: c.input,
    shrinks: c.shrinks,
    path: c.path,
    oldOutput: c.oldOutput,
    newOutput: c.newOutput,
    oldProjected: c.oldProjected,
    newProjected: c.newProjected,
  };
}

function buildAttempt(a: ProofAttempt): Record<string, unknown> {
  const out: Record<string, unknown> = { attempt: a.attempt };
  if (a.candidate !== undefined) out["candidate"] = { name: a.candidate.name, source: a.candidate.source };
  out["status"] = a.status;
  out["weak"] = a.weak;
  out["numRuns"] = a.numRuns;
  out["runs"] = a.runs;
  out["seed"] = a.seed;
  out["shapes"] = a.shapes.map(buildShape);
  if (a.counterexample !== undefined) out["counterexample"] = buildCounterexample(a.counterexample);
  if (a.recommendation !== undefined) out["recommendation"] = a.recommendation;
  if (a.error !== undefined) out["error"] = { code: a.error.code, message: a.error.message };
  out["sabotage"] = {
    applied: a.sabotage.applied,
    caught: a.sabotage.caught,
    survivors: [...a.sabotage.survivors],
  };
  return out;
}

export function serializeProofReport(report: ProofReport): string {
  const out: Record<string, unknown> = { repo: report.repo };
  if (report.commit !== undefined) out["commit"] = report.commit;
  out["package"] = report.package;
  if (report.oracleVersion !== undefined) out["oracleVersion"] = report.oracleVersion;
  out["filesScanned"] = report.filesScanned;
  out["callSites"] = report.callSites.map(buildCallSite);
  out["importSites"] = report.importSites.map(buildImportSite);
  out["attempts"] = report.attempts.map(buildAttempt);
  return JSON.stringify(out, null, 2) + "\n";
}

// ---------------------------------------------------------------------------
// Parse

class Fail extends Error {
  constructor(
    readonly category: ProofReportParseError["category"],
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

function asObject(v: unknown, path: string, allowed?: readonly string[]): Rec {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new Fail("wrong_type", `${path} must be an object, got ${describe(v)}`);
  }
  const o = v as Rec;
  if (allowed) {
    for (const key of Object.keys(o)) {
      if (!allowed.includes(key)) throw new Fail("wrong_type", `${path}.${key} is not a known key`);
    }
  }
  return o;
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
function asInteger(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || Object.is(v, -0)) {
    throw new Fail("wrong_type", `${path} must be an integer`);
  }
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

function parseCallSite(v: unknown, path: string): CallSite {
  const o = asObject(v, path, [
    "file", "line", "column", "callee", "member", "argCount", "argTexts", "enclosing", "consumedAs", "new",
  ]);
  const site: CallSite = {
    file: asString(field(o, "file", path), `${path}.file`),
    line: asInteger(field(o, "line", path), `${path}.line`),
    column: asInteger(field(o, "column", path), `${path}.column`),
    callee: asString(field(o, "callee", path), `${path}.callee`),
    member: asString(field(o, "member", path), `${path}.member`),
    argCount: asInteger(field(o, "argCount", path), `${path}.argCount`),
    argTexts: strings(field(o, "argTexts", path), `${path}.argTexts`),
    enclosing: asEnum(field(o, "enclosing", path), ["src", "test"] as const, `${path}.enclosing`),
  };
  if (Object.hasOwn(o, "consumedAs")) {
    site.consumedAs = asEnum(o["consumedAs"], ["undefined-check"] as const, `${path}.consumedAs`);
  }
  if (Object.hasOwn(o, "new")) {
    if (o["new"] !== true) throw new Fail("wrong_type", `${path}.new must be true`);
    site.new = true;
  }
  return site;
}

function parseImportSite(v: unknown, path: string): ImportSite {
  const o = asObject(v, path, ["file", "line", "column", "form"]);
  return {
    file: asString(field(o, "file", path), `${path}.file`),
    line: asInteger(field(o, "line", path), `${path}.line`),
    column: asInteger(field(o, "column", path), `${path}.column`),
    form: asEnum(field(o, "form", path), IMPORT_FORMS, `${path}.form`),
  };
}

function parseShape(v: unknown, path: string): ShapeResult {
  const o = asObject(v, path, ["id", "status", "runs", "coverage"]);
  const covObj = asObject(field(o, "coverage", path), `${path}.coverage`);
  const coverage: Record<string, number> = {};
  for (const key of Object.keys(covObj)) {
    Object.defineProperty(coverage, key, {
      value: asInteger(covObj[key], `${path}.coverage.${key}`),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return {
    id: asString(field(o, "id", path), `${path}.id`),
    status: asEnum(field(o, "status", path), SHAPE_STATUSES, `${path}.status`),
    runs: asInteger(field(o, "runs", path), `${path}.runs`),
    coverage,
  };
}

function parseCounterexample(v: unknown, path: string): CounterexampleRecord {
  const o = asObject(v, path, [
    "shape", "input", "shrinks", "path", "oldOutput", "newOutput", "oldProjected", "newProjected",
  ]);
  const s = (k: string) => asString(field(o, k, path), `${path}.${k}`);
  return {
    shape: s("shape"),
    input: s("input"),
    shrinks: asInteger(field(o, "shrinks", path), `${path}.shrinks`),
    path: s("path"),
    oldOutput: s("oldOutput"),
    newOutput: s("newOutput"),
    oldProjected: s("oldProjected"),
    newProjected: s("newProjected"),
  };
}

function parseAttempt(v: unknown, path: string): ProofAttempt {
  const o = asObject(v, path, [
    "attempt", "candidate", "status", "weak", "numRuns", "runs", "seed", "shapes",
    "counterexample", "recommendation", "error", "sabotage",
  ]);
  const attempt = asInteger(field(o, "attempt", path), `${path}.attempt`);
  let candidate: ProofAttempt["candidate"];
  if (Object.hasOwn(o, "candidate")) {
    const c = asObject(o["candidate"], `${path}.candidate`, ["name", "source"]);
    candidate = {
      name: asString(field(c, "name", `${path}.candidate`), `${path}.candidate.name`),
      source: asString(field(c, "source", `${path}.candidate`), `${path}.candidate.source`),
    };
  }
  const status = asEnum(field(o, "status", path), STATUSES, `${path}.status`);
  const weak = asBoolean(field(o, "weak", path), `${path}.weak`);
  const numRuns = asInteger(field(o, "numRuns", path), `${path}.numRuns`);
  const runs = asInteger(field(o, "runs", path), `${path}.runs`);
  const seed = asInteger(field(o, "seed", path), `${path}.seed`);
  const shapes = asArray(field(o, "shapes", path), `${path}.shapes`).map((s, i) =>
    parseShape(s, `${path}.shapes[${i}]`),
  );
  const out: ProofAttempt = {
    attempt, status, weak, numRuns, runs, seed, shapes,
    sabotage: { applied: 0, caught: 0, survivors: [] },
  };
  if (candidate !== undefined) {
    // keep key order irrelevant: serialization rebuilds it
    out.candidate = candidate;
  }
  if (Object.hasOwn(o, "counterexample")) {
    out.counterexample = parseCounterexample(o["counterexample"], `${path}.counterexample`);
  }
  if (Object.hasOwn(o, "recommendation")) {
    out.recommendation = asEnum(o["recommendation"], RECOMMENDATIONS, `${path}.recommendation`);
  }
  if (Object.hasOwn(o, "error")) {
    const e = asObject(o["error"], `${path}.error`, ["code", "message"]);
    out.error = {
      code: asEnum(field(e, "code", `${path}.error`), ERROR_CODES, `${path}.error.code`),
      message: asString(field(e, "message", `${path}.error`), `${path}.error.message`),
    };
  }
  const sp = `${path}.sabotage`;
  const sab = asObject(field(o, "sabotage", path), sp, ["applied", "caught", "survivors"]);
  out.sabotage = {
    applied: asInteger(field(sab, "applied", sp), `${sp}.applied`),
    caught: asInteger(field(sab, "caught", sp), `${sp}.caught`),
    survivors: strings(field(sab, "survivors", sp), `${sp}.survivors`),
  };
  return out;
}

// ---------------------------------------------------------------------------
// Consistency (Requirement 9.7)

/** Returns the first violated rule with a path message, or undefined. */
export function checkConsistency(report: ProofReport): string | undefined {
  const { attempts } = report;
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i]!;
    const p = `attempts[${i}]`;
    if (a.attempt !== i + 1) return `${p}.attempt is ${a.attempt} but must be ${i + 1}`;
    if (a.status === "counterexample" && a.counterexample === undefined) {
      return `${p}.counterexample is missing but status is counterexample`;
    }
    if (a.status !== "counterexample" && a.counterexample !== undefined) {
      return `${p}.counterexample is present but status is ${a.status}`;
    }
    if (a.status === "proved" && report.callSites.length === 0) {
      return `${p}.status is proved but callSites is empty`;
    }
    if (a.status === "no-call-sites") {
      if (report.callSites.length !== 0) return `${p}.status is no-call-sites but callSites is not empty`;
      if (a.recommendation === undefined) return `${p}.recommendation is missing for status no-call-sites`;
      const want: Recommendation = report.importSites.length === 0 ? "remove-dependency" : "review-imports";
      if (a.recommendation !== want) return `${p}.recommendation is ${a.recommendation} but must be ${want}`;
    }
    if (a.status === "error" && a.error === undefined) return `${p}.error is missing but status is error`;
    if (a.status !== "error" && a.error !== undefined) return `${p}.error is present but status is ${a.status}`;
    const s = a.sabotage;
    if (s.applied !== s.caught + s.survivors.length) {
      return `${p}.sabotage.applied is ${s.applied} but caught + survivors is ${s.caught + s.survivors.length}`;
    }
    const weak = a.status === "proved" && (s.applied === 0 || s.survivors.length > 0);
    if (a.weak !== weak) return `${p}.weak is ${a.weak} but must be ${weak}`;
    if (a.status !== "proved" && s.applied !== 0) {
      return `${p}.sabotage.applied is ${s.applied} but status is ${a.status}`;
    }
  }
  return undefined;
}

/**
 * Test seam for the Sabotage_List (proof-p9.ts): the parser with individual checks switched off.
 * Not part of the pure entry (`index.ts`); `parseProofReport` is the only supported parser.
 */
export interface ParseChecks {
  consistency: boolean;
  canonical: boolean;
}

export function parseProofReport(text: string): ParseProofReportOutcome {
  return parseProofReportWith(text, { consistency: true, canonical: true });
}

export function parseProofReportWith(text: string, checks: ParseChecks): ParseProofReportOutcome {
  try {
    if (typeof text !== "string" || text.trim() === "") throw new Fail("empty", "report text is empty");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Fail("invalid_json", `report is not valid JSON: ${(e as Error).message}`);
    }
    const root = "report";
    const o = asObject(json, root, [
      "repo", "commit", "package", "oracleVersion", "filesScanned", "callSites", "importSites", "attempts",
    ]);
    const report: ProofReport = {
      repo: asString(field(o, "repo", root), "repo"),
      package: "",
      filesScanned: 0,
      callSites: [],
      importSites: [],
      attempts: [],
    };
    if (Object.hasOwn(o, "commit")) report.commit = asString(o["commit"], "commit");
    report.package = asString(field(o, "package", root), "package");
    if (Object.hasOwn(o, "oracleVersion")) report.oracleVersion = asString(o["oracleVersion"], "oracleVersion");
    report.filesScanned = asInteger(field(o, "filesScanned", root), "filesScanned");
    report.callSites = asArray(field(o, "callSites", root), "callSites").map((c, i) =>
      parseCallSite(c, `callSites[${i}]`),
    );
    report.importSites = asArray(field(o, "importSites", root), "importSites").map((s, i) =>
      parseImportSite(s, `importSites[${i}]`),
    );
    report.attempts = asArray(field(o, "attempts", root), "attempts").map((a, i) =>
      parseAttempt(a, `attempts[${i}]`),
    );
    const bad = checks.consistency ? checkConsistency(report) : undefined;
    if (bad !== undefined) throw new Fail("inconsistent", bad);
    if (checks.canonical && serializeProofReport(report) !== text) {
      throw new Fail("not_canonical", "report text is valid but not in canonical form");
    }
    return { ok: true, report };
  } catch (e) {
    if (e instanceof Fail) return { ok: false, error: { category: e.category, message: e.message } };
    return { ok: false, error: { category: "invalid_json", message: `unreadable report: ${String(e)}` } };
  }
}

/** Returns a new report with `attempt` appended and numbered; the input is not mutated. */
export function appendAttempt(report: ProofReport, attempt: Omit<ProofAttempt, "attempt">): ProofReport {
  return { ...report, attempts: [...report.attempts, { ...attempt, attempt: report.attempts.length + 1 }] };
}
