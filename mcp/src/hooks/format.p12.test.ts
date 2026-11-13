import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { assertProperty } from "../test-support/fc-runner.js";
import { assertAllSabotagesCaught, type NamedProperty } from "../test-support/sabotage-runner.js";
import { REAL_HOOK_FORMAT, type HookFormat } from "../test-support/validators.js";
import { KIRO_P12_SABOTAGES } from "../test-support/sabotage/kiro-p12.js";
import { HOOK_OUTCOMES } from "./fired-line.js";

// Lines may contain any character except line breaks and control characters (those are checked separately).
const plainChar = fc.oneof(
  { weight: 6, arbitrary: fc.char() },
  { weight: 2, arbitrary: fc.constantFrom("é", "☃", "\u2028", "😀", " ") },
);
const plainLine = fc.array(plainChar, { minLength: 1, maxLength: 260 }).map((cs) => cs.join(""));
// eslint-disable-next-line no-control-regex
const HAS_CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/;

const linesArb = fc.oneof(
  fc.array(plainLine, { maxLength: 500 }),
  fc.array(plainLine, { maxLength: 45 }),
  fc.array(plainLine, { maxLength: 4 }),
);
const code = fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 255 }));
const step = fc.record({ code, lines: linesArb });
const terminator = fc.constantFrom("", "\n", "\r\n");

const hookId = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,20}$/);
const outcome = fc.constantFrom(...HOOK_OUTCOMES);
const date = fc.date({ min: new Date("1971-01-01T00:00:00Z"), max: new Date("2200-01-01T00:00:00Z") });

const SECTION_HEADER = /^(typecheck|tests) failed \(exit (\d+)\)$/;

export const name = "Property 12: Hook output formatting";

export function build(impl: HookFormat) {
  return fc.property(step, step, terminator, date, hookId, outcome, fc.string(), (tc, tests, term, when, id, out, junk) => {
    const text = impl.formatStopSummary({ code: tc.code, output: tc.lines.join("\n") + term }, { code: tests.code, output: tests.lines.join("\n") + term });

    // PASS iff both codes are 0.
    const bothOk = tc.code === 0 && tests.code === 0;
    const first = text.split("\n")[0];
    if (first !== (bothOk ? "check: PASS" : "check: FAIL")) throw new Error(`first line ${JSON.stringify(first)} for codes ${tc.code}/${tests.code}`);
    if (text.length > 4000) throw new Error(`summary has ${text.length} code units`);
    if (HAS_CONTROL.test(text)) throw new Error("control character in summary");

    // One section per failed step, none for a passing step.
    const textLines = text.split("\n");
    const headers = textLines.filter((l) => !l.startsWith("> ") && l !== "check: PASS" && l !== "check: FAIL");
    const expected = [
      ...(tc.code !== 0 ? [`typecheck failed (exit ${tc.code})`] : []),
      ...(tests.code !== 0 ? [`tests failed (exit ${tests.code})`] : []),
    ];
    if (JSON.stringify(headers) !== JSON.stringify(expected)) throw new Error(`sections ${JSON.stringify(headers)}, expected ${JSON.stringify(expected)}`);
    if (bothOk && text !== "check: PASS") throw new Error("PASS summary has extra text");

    // Per failed step: at most 20 lines, each at most 200 code units, and a non-empty suffix (the tail) of the output.
    const shown = new Map<string, string[]>();
    let current: string | undefined;
    for (const l of textLines.slice(1)) {
      const m = SECTION_HEADER.exec(l);
      if (m) {
        current = m[1]!;
        shown.set(current, []);
      } else if (current !== undefined) shown.get(current)!.push(l);
    }
    for (const [label, s] of [["typecheck", tc], ["tests", tests]] as const) {
      if (s.code === 0) continue;
      const got = shown.get(label) ?? [];
      if (got.length > 20) throw new Error(`${label}: ${got.length} lines`);
      if (got.some((l) => l.length > 200)) throw new Error(`${label}: a line longer than 200`);
      if (s.lines.length > 0 && got.length === 0) throw new Error(`${label}: no output lines shown`);
      const tail = s.lines.slice(s.lines.length - got.length).map((l) => l.slice(0, 198));
      if (JSON.stringify(got.map((l) => l.slice(2))) !== JSON.stringify(tail)) {
        throw new Error(`${label}: shown lines are not the tail of the output`);
      }
    }

    // Unbounded junk output never throws and still honors the caps.
    const noisy = impl.formatStopSummary({ code: 1, output: junk.repeat(50) }, { code: 2, output: junk });
    if (noisy.length > 4000 || !noisy.startsWith("check: FAIL")) throw new Error("noisy output broke the caps");

    // Fired line.
    const line = impl.formatFiredLine(when, id, out);
    if (line !== `${when.toISOString()} ${id} ${out}`) throw new Error(`fired line ${JSON.stringify(line)}`);
    const parsed = impl.parseFiredLine(line);
    if (parsed === undefined || parsed.time !== when.toISOString() || parsed.hookId !== id || parsed.outcome !== out) {
      throw new Error(`fired line does not parse back: ${JSON.stringify(parsed)}`);
    }
    if (impl.formatFiredLine(new Date(Number.NaN), id, out) !== undefined) throw new Error("invalid date accepted");
    if (impl.formatFiredLine(when, `${id} x`, out) !== undefined) throw new Error("id with a space accepted");
    if (impl.formatFiredLine(when, "", out) !== undefined) throw new Error("empty id accepted");
    if (impl.formatFiredLine(when, id, "boom" as never) !== undefined) throw new Error("unknown outcome accepted");
    if (impl.parseFiredLine(junk) !== undefined && !/^\S+ \S+ \S+$/.test(junk)) throw new Error("junk parsed");
    return true;
  });
}

export const property12: NamedProperty<HookFormat> = { name, build };

describe("Property 12: Hook output formatting", () => {
  it("holds for the real formatters", () => {
    assertProperty(name, build(REAL_HOOK_FORMAT));
  });

  it("every sabotage is caught", () => {
    expect(KIRO_P12_SABOTAGES.length).toBeGreaterThan(0);
    assertAllSabotagesCaught(name, [property12], KIRO_P12_SABOTAGES);
  });
});

describe("hook output formatting: examples", () => {
  it("prints PASS alone", () => {
    expect(REAL_HOOK_FORMAT.formatStopSummary({ code: 0, output: "ok" }, { code: 0, output: "ok" })).toBe("check: PASS");
  });

  it("shows the tail of a failing step and nothing for a passing one", () => {
    const output = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
    const text = REAL_HOOK_FORMAT.formatStopSummary({ code: 0, output: "fine" }, { code: 1, output });
    const lines = text.split("\n");
    expect(lines[0]).toBe("check: FAIL");
    expect(lines[1]).toBe("tests failed (exit 1)");
    expect(lines).toHaveLength(2 + 20);
    expect(lines[2]).toBe("> line 11");
    expect(lines[21]).toBe("> line 30");
    expect(text).not.toContain("typecheck");
  });

  it("formats and parses a fired line", () => {
    const d = new Date("2026-11-13T10:00:00.000Z");
    expect(REAL_HOOK_FORMAT.formatFiredLine(d, "check-on-stop", "warn")).toBe("2026-11-13T10:00:00.000Z check-on-stop warn");
    expect(REAL_HOOK_FORMAT.parseFiredLine("2026-11-13T10:00:00.000Z check-on-stop warn")).toEqual({
      time: "2026-11-13T10:00:00.000Z",
      hookId: "check-on-stop",
      outcome: "warn",
    });
    expect(REAL_HOOK_FORMAT.parseFiredLine("2026-11-13 check-on-stop warn")).toBeUndefined();
  });
});
