import fc from "fast-check";
import { buildBreakdown } from "../../breakdown.js";
import { safeHttpUrl } from "../../safe-url.js";
import { hostileUrlArb, nonStringArb, urlTamperedRecordArb, validUrlArb } from "../arbitraries.js";
import { GOOD_URL_CORPUS } from "../arbitraries.js";
import { ensure } from "../sabotage-runner.js";

export type SafeUrlFn = (value: unknown) => string | undefined;

/** The contract of an accepted URL, written without the implementation's regexes. */
export function satisfiesContract(s: string): boolean {
  const lower = s.toLowerCase();
  const rest = lower.startsWith("https://") ? s.slice(8) : lower.startsWith("http://") ? s.slice(7) : undefined;
  if (rest === undefined) return false;
  if (/[\s\u0000-\u001f\u007f]/.test(s)) return false;
  let end = rest.length;
  for (const c of ["/", "?", "#"]) {
    const i = rest.indexOf(c);
    if (i >= 0 && i < end) end = i;
  }
  const authority = rest.slice(0, end);
  return authority.length > 0 && !authority.includes("@");
}

/** Property 5: only http(s) URLs ever become links. */
export function build(impl: SafeUrlFn = safeHttpUrl): fc.IPropertyWithHooks<[string, unknown, string]> {
  return fc.property(hostileUrlArb, nonStringArb, fc.oneof(validUrlArb, fc.constantFrom(...GOOD_URL_CORPUS)), (s, other, good) => {
    const out = impl(s);
    ensure(out === undefined || out === s, `result must be undefined or the input unchanged, got ${JSON.stringify(out)}`);
    if (out !== undefined) {
      ensure(satisfiesContract(out), `accepted ${JSON.stringify(out)} violates the http(s) contract`);
    }
    ensure(impl(other) === undefined, "non-strings must give undefined");
    ensure(impl(good) === good, `known-good URL ${JSON.stringify(good)} must be returned unchanged`);
  });
}

/** Row-level half: every href from the real buildBreakdown satisfies the contract. */
export function buildRows(): fc.IPropertyWithHooks<[Parameters<typeof buildBreakdown>[0]]> {
  return fc.property(urlTamperedRecordArb, (record) => {
    const b = buildBreakdown(record);
    record.death.parts.forEach((p, i) => {
      const row = b.rows[i]!;
      ensure(row.kind === "signal", "expected a signal row");
      if (row.href !== undefined) {
        ensure(row.href === p.sourceUrl && satisfiesContract(row.href), `unsafe href ${JSON.stringify(row.href)}`);
        ensure(row.withheldUrl === undefined, "a row with href must not also withhold");
      }
      if (p.sourceUrl !== undefined && row.href === undefined) {
        ensure(
          row.withheldUrl === p.sourceUrl.slice(0, 80) && row.withheldUrl.length <= 80,
          "an unsafe url must be withheld and cut to 80 characters",
        );
      }
      if (p.sourceUrl === undefined) {
        ensure(row.href === undefined && row.withheldUrl === undefined, "no url, no link");
      }
    });
  });
}
