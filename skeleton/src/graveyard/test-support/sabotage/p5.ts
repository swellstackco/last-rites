import { safeHttpUrl } from "../../safe-url.js";
import type { SafeUrlFn } from "../properties/p5.js";
import type { Sabotage } from "../sabotage-runner.js";

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

const noCheck: SafeUrlFn = str;

const jsDenylistOnly: SafeUrlFn = (v) => {
  const s = str(v);
  return s !== undefined && !s.startsWith("javascript:") ? s : undefined;
};

const caseSensitiveDenylist: SafeUrlFn = (v) => {
  const s = str(v);
  if (s === undefined) return undefined;
  return ["javascript:", "data:", "vbscript:", "file:"].some((p) => s.startsWith(p)) ? undefined : s;
};

const startsWithHttp: SafeUrlFn = (v) => {
  const s = str(v);
  return s !== undefined && s.startsWith("http") ? s : undefined;
};

const acceptsProtocolRelative: SafeUrlFn = (v) => {
  const s = str(v);
  if (s !== undefined && s.startsWith("//")) return s;
  return safeHttpUrl(v);
};

const acceptsUserinfo: SafeUrlFn = (v) => {
  const s = str(v);
  if (s === undefined) return undefined;
  // Same shape as the real check, but userinfo is allowed in the authority.
  return /^https?:\/\/[^/?#]+(?:[/?#]|$)/i.test(s) && !/[\s\u0000-\u001f\u007f<>"'`\\]/.test(s) ? s : undefined;
};

const trimmedThenUntrimmed: SafeUrlFn = (v) => {
  const s = str(v);
  return s !== undefined && safeHttpUrl(s.trim()) !== undefined ? s : undefined;
};

const normalizedCopy: SafeUrlFn = (v) => {
  const ok = safeHttpUrl(v);
  return ok === undefined ? undefined : ok.replace(/^https?/i, (m) => m.toLowerCase());
};

export const P5_SABOTAGES: readonly Sabotage<SafeUrlFn>[] = [
  { name: "no check at all", impl: noCheck },
  { name: "javascript: denylist only", impl: jsDenylistOnly },
  { name: "case-sensitive denylist", impl: caseSensitiveDenylist },
  { name: 'startsWith("http")', impl: startsWithHttp },
  { name: "accepts protocol-relative //host", impl: acceptsProtocolRelative },
  { name: "accepts userinfo", impl: acceptsUserinfo },
  { name: "validates a trimmed copy but returns the untrimmed value", impl: trimmedThenUntrimmed },
  { name: "returns a normalized (lower-cased scheme) copy", impl: normalizedCopy },
];
