// The text the Stop hook prints. Pure and total.

export interface StepResult {
  /** Exit code of the step. */
  code: number;
  /** Combined stdout and stderr. */
  output: string;
}

export const MAX_TAIL_LINES = 20;
export const MAX_LINE_LENGTH = 200;
export const MAX_TOTAL_LENGTH = 4000;
/** Every shown output line starts with this marker; the content is cut so the whole line fits MAX_LINE_LENGTH. */
export const LINE_MARK = "> ";

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

function tailLines(output: unknown, max: number): string[] {
  const text = typeof output === "string" ? output : "";
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines
    .slice(Math.max(0, lines.length - max))
    .map((l) => LINE_MARK + l.replace(CONTROL, "?").slice(0, MAX_LINE_LENGTH - LINE_MARK.length));
}

function section(label: string, step: StepResult, max: number): string[] {
  return [`${label} failed (exit ${step.code})`, ...tailLines(step.output, max)];
}

const passed = (s: StepResult): boolean => s.code === 0;

/**
 * `check: PASS` when both steps exit 0, else `check: FAIL` and, per failed step only, a header plus the
 * tail of its output (at most 20 lines of 200 code units, at most 4000 code units overall).
 */
export function formatStopSummary(typecheck: StepResult, tests: StepResult): string {
  const ok = passed(typecheck) && passed(tests);
  if (ok) return "check: PASS";
  for (let max = MAX_TAIL_LINES; max >= 0; max--) {
    const lines = ["check: FAIL"];
    if (!passed(typecheck)) lines.push(...section("typecheck", typecheck, max));
    if (!passed(tests)) lines.push(...section("tests", tests, max));
    const text = lines.join("\n");
    if (text.length <= MAX_TOTAL_LENGTH) return text;
  }
  return "check: FAIL"; // unreachable in practice: the headers alone are short
}
