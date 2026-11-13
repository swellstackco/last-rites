// Fired_Log lines: `<ISO 8601 time> <hook id> <outcome>`. Pure and total.

export const HOOK_OUTCOMES = ["ok", "warn", "fail", "skipped"] as const;
export type HookOutcome = (typeof HOOK_OUTCOMES)[number];

export interface FiredLine {
  time: string;
  hookId: string;
  outcome: HookOutcome;
}

const HOOK_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const isHookId = (s: unknown): s is string => typeof s === "string" && HOOK_ID.test(s);
const isOutcome = (s: unknown): s is HookOutcome => typeof s === "string" && (HOOK_OUTCOMES as readonly string[]).includes(s);

function isoOrUndefined(now: unknown): string | undefined {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return undefined;
  try {
    return now.toISOString();
  } catch {
    return undefined;
  }
}

/** `<toISOString()> <hookId> <outcome>`; undefined (never a throw) for an invalid date, id or outcome. */
export function formatFiredLine(now: Date, hookId: string, outcome: HookOutcome): string | undefined {
  const iso = isoOrUndefined(now);
  if (iso === undefined || !isHookId(hookId) || !isOutcome(outcome)) return undefined;
  return `${iso} ${hookId} ${outcome}`;
}

/** Inverse of `formatFiredLine`; undefined for anything else. */
export function parseFiredLine(line: string): FiredLine | undefined {
  if (typeof line !== "string") return undefined;
  const parts = line.split(" ");
  if (parts.length !== 3) return undefined;
  const [time, hookId, outcome] = parts as [string, string, string];
  const d = new Date(time);
  if (Number.isNaN(d.getTime()) || isoOrUndefined(d) !== time) return undefined;
  if (!isHookId(hookId) || !isOutcome(outcome)) return undefined;
  return { time, hookId, outcome };
}
