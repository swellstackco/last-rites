const MAX_LENGTH = 2048;

// Scheme (any case), then an authority (up to the first / ? #) that is non-empty
// and has no @ (userinfo). The rest may be anything; forbidden characters are
// checked separately over the whole string.
const SHAPE = /^https?:\/\/[^/?#@]+(?:[/?#]|$)/i;
// Whitespace (incl. Unicode spaces), control chars, and < > " ' ` \
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\s\u0000-\u001f\u007f-\u009f\u2028\u2029<>"'`\\]/;

/**
 * Returns the input unchanged when it is a Safe_Url (http/https, non-empty host,
 * no userinfo, no whitespace/control/markup characters, at most 2048 chars);
 * otherwise undefined. Never throws.
 */
export function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.length > MAX_LENGTH) return undefined;
  if (!SHAPE.test(value)) return undefined;
  if (FORBIDDEN.test(value)) return undefined;
  return value;
}

/** Host part (with port) of a Safe_Url. */
export function hostOf(safeUrl: string): string {
  const m = /^https?:\/\/([^/?#]*)/i.exec(safeUrl);
  return m?.[1] ?? "";
}
