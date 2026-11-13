import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseReport, serializeReport } from "./report.js";
import type { ScanReport } from "./types.js";

const unknown = { kind: "unknown" } as const;

const report: ScanReport = {
  repo: "o/r",
  ref: "HEAD",
  scannedAt: "2026-01-01T00:00:00.000Z",
  dependencies: [
    {
      name: "left-pad",
      kinds: ["dependencies"],
      declaredRange: "^1.0.0",
      resolvedVersion: "1.3.0",
      versionSource: "lockfile",
      signals: {
        deprecated: { kind: "known", value: true },
        repoArchived: unknown,
        monthsSinceLastPublish: { kind: "known", value: 80 },
        monthsSinceLastCommit: unknown,
        maintainerCount: { kind: "known", value: 1 },
        openVulnsNoFix: { kind: "known", value: 0 },
        knownReplacementExists: { kind: "known", value: true },
        sourceUrls: { deprecated: "https://example.test/d" },
      },
      unknownReasons: {
        repoArchived: { source: "github", category: "not_found", message: "no repo" },
      },
      replacement: { type: "native", replacement: "String.prototype.padStart", replacements: ["String.prototype.padStart"] },
      evidenceWarnings: ["w"],
      death: {
        score: 70,
        grade: "dead",
        parts: [{ signal: "deprecated", rawValue: "true", weight: 30, points: 30, status: "known", sourceUrl: "https://example.test/d" }],
      },
    },
  ],
  skipped: [{ name: "x", kind: "devDependencies", specifier: "file:../x", reason: "file" }],
  warnings: ["no lockfile"],
  summary: { total: 1, skipped: 1, alive: 0, ailing: 0, dying: 0, dead: 1 },
};

const EXPECTED = `{
  "repo": "o/r",
  "ref": "HEAD",
  "scannedAt": "2026-01-01T00:00:00.000Z",
  "dependencies": [
    {
      "name": "left-pad",
      "kinds": [
        "dependencies"
      ],
      "declaredRange": "^1.0.0",
      "resolvedVersion": "1.3.0",
      "versionSource": "lockfile",
      "signals": {
        "deprecated": {
          "kind": "known",
          "value": true
        },
        "repoArchived": {
          "kind": "unknown"
        },
        "monthsSinceLastPublish": {
          "kind": "known",
          "value": 80
        },
        "monthsSinceLastCommit": {
          "kind": "unknown"
        },
        "maintainerCount": {
          "kind": "known",
          "value": 1
        },
        "openVulnsNoFix": {
          "kind": "known",
          "value": 0
        },
        "knownReplacementExists": {
          "kind": "known",
          "value": true
        },
        "sourceUrls": {
          "deprecated": "https://example.test/d"
        }
      },
      "unknownReasons": {
        "repoArchived": {
          "source": "github",
          "category": "not_found",
          "message": "no repo"
        }
      },
      "replacement": {
        "type": "native",
        "replacement": "String.prototype.padStart",
        "replacements": [
          "String.prototype.padStart"
        ]
      },
      "evidenceWarnings": [
        "w"
      ],
      "death": {
        "score": 70,
        "grade": "dead",
        "parts": [
          {
            "signal": "deprecated",
            "rawValue": "true",
            "weight": 30,
            "points": 30,
            "status": "known",
            "sourceUrl": "https://example.test/d"
          }
        ]
      }
    }
  ],
  "skipped": [
    {
      "name": "x",
      "kind": "devDependencies",
      "specifier": "file:../x",
      "reason": "file"
    }
  ],
  "warnings": [
    "no lockfile"
  ],
  "summary": {
    "total": 1,
    "skipped": 1,
    "alive": 0,
    "ailing": 0,
    "dying": 0,
    "dead": 1
  }
}
`;

function mutated(edit: (o: any) => void): string {
  const o = JSON.parse(EXPECTED);
  edit(o);
  return JSON.stringify(o, null, 2) + "\n";
}

describe("report codec examples", () => {
  it("serializes to the exact expected text", () => {
    expect(serializeReport(report)).toBe(EXPECTED);
  });

  it("parses the expected text back to the report", () => {
    const out = parseReport(EXPECTED);
    expect(out).toEqual({ ok: true, report });
  });

  it("omits absent optional fields", () => {
    const { resolvedVersion: _r, replacement: _p, ...dep } = report.dependencies[0]!;
    const text = serializeReport({ ...report, dependencies: [{ ...dep, versionSource: "range" }] });
    expect(text).not.toContain("resolvedVersion");
    expect(text).not.toContain('"replacement"');
    expect(text).not.toContain("null");
    expect(parseReport(text).ok).toBe(true);
  });

  it("serializes an empty report", () => {
    const empty: ScanReport = {
      repo: "o/r", ref: "main", scannedAt: "2026-01-01T00:00:00.000Z", dependencies: [], skipped: [], warnings: [],
      summary: { total: 0, skipped: 0, alive: 0, ailing: 0, dying: 0, dead: 0 },
    };
    const text = serializeReport(empty);
    expect(text).toContain('"dependencies": []');
    expect(parseReport(text)).toEqual({ ok: true, report: empty });
  });

  it("empty and whitespace text -> empty", () => {
    expect(parseReport("")).toMatchObject({ ok: false, error: { category: "empty" } });
    expect(parseReport("  \n")).toMatchObject({ ok: false, error: { category: "empty" } });
  });

  it("malformed JSON -> invalid_json", () => {
    expect(parseReport("{")).toMatchObject({ ok: false, error: { category: "invalid_json" } });
  });

  it("missing field -> missing_field naming the path", () => {
    const text = mutated((o) => delete o.dependencies[0].death.score);
    const out = parseReport(text);
    expect(out).toMatchObject({ ok: false, error: { category: "missing_field" } });
    if (!out.ok) expect(out.error.message).toContain("dependencies[0].death.score");
  });

  it("wrong type -> wrong_type naming the path", () => {
    const text = mutated((o) => (o.skipped[0].reason = 7));
    const out = parseReport(text);
    expect(out).toMatchObject({ ok: false, error: { category: "wrong_type" } });
    if (!out.ok) expect(out.error.message).toContain("skipped[0].reason");
  });

  it("bad enum, non-integer and non-object top level -> wrong_type", () => {
    expect(parseReport(mutated((o) => (o.dependencies[0].death.grade = "zombie")))).toMatchObject({ error: { category: "wrong_type" } });
    expect(parseReport(mutated((o) => (o.summary.total = 1.5)))).toMatchObject({ error: { category: "wrong_type" } });
    expect(parseReport("[]")).toMatchObject({ error: { category: "wrong_type" } });
  });

  it("unknown key in sourceUrls -> wrong_type", () => {
    const out = parseReport(mutated((o) => (o.dependencies[0].signals.sourceUrls.bogus = "x")));
    expect(out).toMatchObject({ ok: false, error: { category: "wrong_type" } });
    if (!out.ok) expect(out.error.message).toContain("sourceUrls.bogus");
  });

  it("unknown key in unknownReasons -> wrong_type", () => {
    const out = parseReport(mutated((o) => (o.dependencies[0].unknownReasons.bogus = { source: "npm", category: "timeout", message: "m" })));
    expect(out).toMatchObject({ ok: false, error: { category: "wrong_type" } });
    if (!out.ok) expect(out.error.message).toContain("unknownReasons.bogus");
  });

  it("valid structure in non-canonical form -> not_canonical", () => {
    expect(parseReport(EXPECTED.trimEnd())).toMatchObject({ error: { category: "not_canonical" } });
    expect(parseReport(JSON.stringify(JSON.parse(EXPECTED)))).toMatchObject({ error: { category: "not_canonical" } });
    expect(parseReport(mutated((o) => (o.extra = 1)))).toMatchObject({ error: { category: "not_canonical" } });
  });
});

describe("report codec ecosystem key", () => {
  const actions: ScanReport = { ...report, ecosystem: "github-actions" };

  it("round-trips a github-actions report with the key right after ref", () => {
    const text = serializeReport(actions);
    const lines = text.split("\n");
    expect(lines[2]).toBe('  "ref": "HEAD",');
    expect(lines[3]).toBe('  "ecosystem": "github-actions",');
    const parsed = parseReport(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.report.ecosystem).toBe("github-actions");
      expect(serializeReport(parsed.report)).toBe(text);
    }
  });

  it("rejects an npm or unknown ecosystem value", () => {
    const text = serializeReport(actions);
    const npm = parseReport(text.replace('"github-actions"', '"npm"'));
    expect(npm.ok).toBe(false);
    if (!npm.ok) expect(npm.error.category).toBe("not_canonical");
    const other = parseReport(text.replace('"github-actions"', '"x"'));
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error.category).toBe("wrong_type");
  });

  it("does not write the key for npm reports", () => {
    expect(serializeReport({ ...report, ecosystem: "npm" })).toBe(serializeReport(report));
  });

  it("keeps every demo Scan_Report canonical", () => {
    const dir = fileURLToPath(new URL("../../../../demo/", import.meta.url));
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const text = readFileSync(dir + f, "utf8");
      const parsed = parseReport(text);
      if (!parsed.ok) continue; // not a Scan_Report
      expect(serializeReport(parsed.report), f).toBe(text);
    }
  });
});
