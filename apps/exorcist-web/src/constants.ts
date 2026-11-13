/** Display name of the product. Display text only; nothing is renamed to it. */
export const PRODUCT_NAME = "Last Rites";
export const SCREEN_NAME = "The Graveyard";

/** Live scan rate limit shown to the visitor. A test compares it with the Scan_Api default. */
export const LIVE_SCAN_LIMIT = { limit: 10, windowSeconds: 60 } as const;

/** Client timeouts (the server's own scan timeout is 60 s). */
export const LIVE_TIMEOUT_MS = 75_000;
export const DEMO_TIMEOUT_MS = 15_000;

/** Used when a 429 has a missing or unusable retry-after header. */
export const DEFAULT_RETRY_AFTER_S = 60;
export const MIN_RETRY_AFTER_S = 1;
export const MAX_RETRY_AFTER_S = 3600;

/** Server message text is cut to this many characters before display. */
export const MAX_SERVER_MESSAGE = 300;
/** A withheld (unsafe) source URL is shown cut to this many characters. */
export const WITHHELD_URL_CUT = 80;

/** Error bodies larger than this are ignored. */
export const MAX_ERROR_BODY_BYTES = 64 * 1024;

/** Copy used by more than one view. */
export const COPY = {
  demoNote: "A demo is a cached snapshot. It loads instantly and runs no scan.",
  liveLimitHint: `Live scans are limited to ${LIVE_SCAN_LIMIT.limit} per minute per visitor`,
  livePublicOnly: "Only public repositories are scanned.",
  liveFilesRead: "Only package.json and package-lock.json are read.",
  skipToDead: "Skip to the dead packages",
  exorcismComing: "Exorcism coming",
} as const;
