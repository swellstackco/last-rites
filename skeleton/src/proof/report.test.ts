import { describe, expect, it } from "vitest";
import { appendAttempt, checkConsistency, parseProofReport, serializeProofReport } from "./report.js";
import type { ProofAttempt, ProofReport } from "./types.js";

const attempt: ProofAttempt = {
  attempt: 1,
  candidate: { name: "mine", source: "demo/x.js" },
  status: "proved",
  weak: false,
  numRuns: 100,
  runs: 100,
  seed: 7,
  shapes: [{ id: "intersect", status: "passed", runs: 100, coverage: { b: 2, a: 1 } }],
  sabotage: { applied: 2, caught: 2, survivors: [] },
};

const report: ProofReport = {
  repo: "parse-server",
  package: "intersect",
  oracleVersion: "1.0.1",
  filesScanned: 3,
  callSites: [
    { file: "src/a.js", line: 4, column: 5, callee: "intersect.big", member: "big", argCount: 1, argTexts: ["ids"], enclosing: "src" },
  ],
  importSites: [{ file: "src/a.js", line: 1, column: 1, form: "import-default" }],
  attempts: [attempt],
};

const EXPECTED = `{
  "repo": "parse-server",
  "package": "intersect",
  "oracleVersion": "1.0.1",
  "filesScanned": 3,
  "callSites": [
    {
      "file": "src/a.js",
      "line": 4,
      "column": 5,
      "callee": "intersect.big",
      "member": "big",
      "argCount": 1,
      "argTexts": [
        "ids"
      ],
      "enclosing": "src"
    }
  ],
  "importSites": [
    {
      "file": "src/a.js",
      "line": 1,
      "column": 1,
      "form": "import-default"
    }
  ],
  "attempts": [
    {
      "attempt": 1,
      "candidate": {
        "name": "mine",
        "source": "demo/x.js"
      },
      "status": "proved",
      "weak": false,
      "numRuns": 100,
      "runs": 100,
      "seed": 7,
      "shapes": [
        {
          "id": "intersect",
          "status": "passed",
          "runs": 100,
          "coverage": {
            "a": 1,
            "b": 2
          }
        }
      ],
      "sabotage": {
        "applied": 2,
        "caught": 2,
        "survivors": []
      }
    }
  ]
}
`;

function err(text: string) {
  const out = parseProofReport(text);
  if (out.ok) throw new Error("expected a parse error");
  return out.error;
}
const json = (edit: (o: any) => void): string => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const o = JSON.parse(EXPECTED);
  edit(o);
  return JSON.stringify(o, null, 2) + "\n";
};
const withAttempt = (patch: Partial<ProofAttempt>, extra: Partial<ProofReport> = {}): ProofReport => ({
  ...report,
  ...extra,
  attempts: [{ ...attempt, ...patch }],
});

describe("serializeProofReport", () => {
  it("writes the exact canonical text with sorted coverage keys", () => {
    expect(serializeProofReport(report)).toBe(EXPECTED);
  });

  it("round trips the handwritten report", () => {
    const out = parseProofReport(EXPECTED);
    expect(out).toEqual({ ok: true, report });
  });
});

describe("parseProofReport categories", () => {
  it("empty", () => {
    expect(err("")).toEqual({ category: "empty", message: "report text is empty" });
    expect(err("  \n").category).toBe("empty");
  });
  it("invalid_json", () => {
    const e = err("{nope");
    expect(e.category).toBe("invalid_json");
    expect(e.message).toMatch(/^report is not valid JSON/);
  });
  it("missing_field names the path", () => {
    expect(err(json((o) => delete o.repo))).toEqual({ category: "missing_field", message: "report.repo is missing" });
    expect(err(json((o) => delete o.attempts[0].sabotage.applied)).message).toBe(
      "attempts[0].sabotage.applied is missing",
    );
  });
  it("wrong_type names the path", () => {
    expect(err(json((o) => { o.filesScanned = "3"; }))).toEqual({
      category: "wrong_type",
      message: "filesScanned must be an integer",
    });
    expect(err(json((o) => { o.attempts[0].weak = 1; })).message).toBe("attempts[0].weak must be a boolean, got number");
    expect(err(json((o) => { o.attempts[0].status = "nope"; })).message).toBe('attempts[0].status has invalid value "nope"');
  });
  it("unknown keys are wrong_type", () => {
    expect(err(json((o) => { o.extra = 1; }))).toEqual({ category: "wrong_type", message: "report.extra is not a known key" });
  });
  it("rejects fractions and -0", () => {
    expect(err(EXPECTED.replace('"filesScanned": 3', '"filesScanned": 3.5')).category).toBe("wrong_type");
    expect(err(EXPECTED.replace('"seed": 7', '"seed": -0')).message).toBe("attempts[0].seed must be an integer");
  });
  it("not_canonical", () => {
    expect(err(EXPECTED.trimEnd()).category).toBe("not_canonical");
    expect(err(JSON.stringify(JSON.parse(EXPECTED))).category).toBe("not_canonical");
    expect(err(EXPECTED.replace('"filesScanned": 3', '"filesScanned": 3.0')).category).toBe("not_canonical");
  });
  it("never throws on non-string input", () => {
    expect(parseProofReport(undefined as unknown as string).ok).toBe(false);
  });
});

describe("checkConsistency", () => {
  it("accepts the handwritten report", () => {
    expect(checkConsistency(report)).toBeUndefined();
  });

  const ce = { shape: "s", input: "i", shrinks: 0, path: "p", oldOutput: "o", newOutput: "n", oldProjected: "o", newProjected: "n" };
  const errAttempt: Partial<ProofAttempt> = {
    status: "error",
    error: { code: "recipe_failure", message: "m" },
    sabotage: { applied: 0, caught: 0, survivors: [] },
  };
  const cases: [string, ProofReport, string][] = [
    ["attempt number", withAttempt({ attempt: 2 }), "attempts[0].attempt is 2 but must be 1"],
    ["counterexample missing", withAttempt({ ...errAttempt, status: "counterexample", error: undefined }), "attempts[0].counterexample is missing but status is counterexample"],
    ["counterexample extra", withAttempt({ counterexample: ce }), "attempts[0].counterexample is present but status is proved"],
    ["proved with no call sites", withAttempt({}, { callSites: [] }), "attempts[0].status is proved but callSites is empty"],
    ["no-call-sites with call sites", withAttempt({ status: "no-call-sites", recommendation: "review-imports", sabotage: errAttempt.sabotage! }), "attempts[0].status is no-call-sites but callSites is not empty"],
    ["no-call-sites without recommendation", withAttempt({ status: "no-call-sites", sabotage: errAttempt.sabotage! }, { callSites: [] }), "attempts[0].recommendation is missing for status no-call-sites"],
    ["wrong recommendation", withAttempt({ status: "no-call-sites", recommendation: "remove-dependency", sabotage: errAttempt.sabotage! }, { callSites: [] }), "attempts[0].recommendation is remove-dependency but must be review-imports"],
    ["error missing", withAttempt({ ...errAttempt, error: undefined }), "attempts[0].error is missing but status is error"],
    ["error extra", withAttempt({ error: { code: "recipe_failure", message: "m" } }), "attempts[0].error is present but status is proved"],
    ["applied mismatch", withAttempt({ sabotage: { applied: 4, caught: 2, survivors: ["x"] }, weak: true }), "attempts[0].sabotage.applied is 4 but caught + survivors is 3"],
    ["weak mismatch", withAttempt({ weak: true }), "attempts[0].weak is true but must be false"],
    ["sabotage on non-proved", withAttempt({ ...errAttempt, sabotage: { applied: 1, caught: 1, survivors: [] } }), "attempts[0].sabotage.applied is 1 but status is error"],
  ];
  for (const [name, r, message] of cases) {
    it(`${name}`, () => {
      expect(checkConsistency(r)).toBe(message);
      expect(err(serializeProofReport(r))).toEqual({ category: "inconsistent", message });
    });
  }

  it("a proved attempt with no sabotage applied must be weak", () => {
    expect(checkConsistency(withAttempt({ sabotage: { applied: 0, caught: 0, survivors: [] } }))).toBe(
      "attempts[0].weak is false but must be true",
    );
  });
});

describe("appendAttempt", () => {
  const { attempt: _n, ...rest } = attempt;

  it("numbers the new attempt and leaves the input alone", () => {
    const before = serializeProofReport(report);
    const next = appendAttempt(report, rest);
    expect(next.attempts.map((a) => a.attempt)).toEqual([1, 2]);
    expect(report.attempts).toHaveLength(1);
    expect(serializeProofReport(report)).toBe(before);
    expect(next).not.toBe(report);
    expect(checkConsistency(next)).toBeUndefined();
  });

  it("overrides a stale attempt number", () => {
    const next = appendAttempt(report, { ...rest, attempt: 99 } as Omit<ProofAttempt, "attempt">);
    expect(next.attempts[1]!.attempt).toBe(2);
  });
});
