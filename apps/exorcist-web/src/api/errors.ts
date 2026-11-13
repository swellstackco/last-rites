import {
  DEFAULT_RETRY_AFTER_S,
  LIVE_SCAN_LIMIT,
  MAX_RETRY_AFTER_S,
  MAX_SERVER_MESSAGE,
  MIN_RETRY_AFTER_S,
} from "../constants.js";

export const KNOWN_ERROR_CODES = [
  "invalid_repo",
  "invalid_ref",
  "invalid_input",
  "no_package_json",
  "malformed_package_json",
  "invalid_package_json_shape",
  "too_many_dependencies",
  "repo_fetch_failed",
  "scan_timeout",
  "internal_error",
  "rate_limited",
  "unsupported_media_type",
  "body_too_large",
  "invalid_demo_name",
  "demo_not_found",
  "not_found",
  "method_not_allowed",
] as const;

export type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number];
export type UiErrorCode = KnownErrorCode | "network_unreachable" | "client_timeout" | "bad_response" | "unknown_error";

export interface UiError {
  code: UiErrorCode;
  title: string;
  /** Plain-language explanation. Never empty. */
  detail: string;
  /** From the response body, cut to MAX_SERVER_MESSAGE characters. Secondary text only. */
  serverMessage?: string;
  retryable: boolean;
  /** Integer 1..3600, only for rate_limited. */
  retryAfterSeconds?: number;
  /** bad_response only: "<category>: <message>". */
  parseDetail?: string;
}

export interface DescribeErrorInput {
  status?: number;
  body?: unknown;
  retryAfterHeader?: string | null;
  kind?: "network" | "timeout" | "parse";
  parse?: { category: string; message: string };
  /** Timeout that was exceeded, for client_timeout. */
  timeoutMs?: number;
}

interface Entry {
  title: string;
  detail: string;
  retryable: boolean;
}

const DISAGREE = "This is a bug in the page: the page and the scan service disagree about the request.";

const TABLE: Record<KnownErrorCode, Entry> = {
  invalid_repo: {
    title: "That doesn't look like a GitHub repo",
    detail: "Use owner/name, for example parse-community/parse-server.",
    retryable: false,
  },
  invalid_ref: {
    title: "That branch or tag isn't valid",
    detail: "Use letters, digits, '.', '_', '-' and '/' only, and no '..'.",
    retryable: false,
  },
  invalid_input: {
    title: "The scan request was rejected",
    detail: "The service did not accept the repo or ref as typed.",
    retryable: false,
  },
  no_package_json: {
    title: "No package.json found",
    detail:
      "The repo is private, doesn't exist, or has no package.json at its root at that ref. Only public repos are scanned.",
    retryable: false,
  },
  malformed_package_json: {
    title: "package.json isn't valid JSON",
    detail: "The file was found but can't be read.",
    retryable: false,
  },
  invalid_package_json_shape: {
    title: "package.json has an unexpected shape",
    detail: "A dependency field isn't an object of strings.",
    retryable: false,
  },
  too_many_dependencies: {
    title: "Too many dependencies for a live scan",
    detail: "Live scans stop at 300 direct dependencies. The demos have no such limit.",
    retryable: false,
  },
  repo_fetch_failed: {
    title: "GitHub didn't answer",
    detail: "Fetching the repo files failed after retries. Try again in a moment.",
    retryable: true,
  },
  scan_timeout: {
    title: "The scan took too long",
    detail: "The service stopped it after about a minute.",
    retryable: true,
  },
  internal_error: {
    title: "The scan service hit an error",
    detail: "Not your fault. Try again in a moment.",
    retryable: true,
  },
  rate_limited: {
    title: "Slow down: live scans are limited",
    detail: `Each visitor gets ${LIVE_SCAN_LIMIT.limit} live scans per minute. Demos still work.`,
    retryable: true,
  },
  unsupported_media_type: { title: "The page and the service disagree", detail: DISAGREE, retryable: true },
  body_too_large: { title: "The page and the service disagree", detail: DISAGREE, retryable: true },
  not_found: { title: "The page and the service disagree", detail: DISAGREE, retryable: true },
  method_not_allowed: { title: "The page and the service disagree", detail: DISAGREE, retryable: true },
  invalid_demo_name: {
    title: "That demo isn't available",
    detail: "It may have been removed. Go back and pick another.",
    retryable: false,
  },
  demo_not_found: {
    title: "That demo isn't available",
    detail: "It may have been removed. Go back and pick another.",
    retryable: false,
  },
};

function isKnownCode(code: unknown): code is KnownErrorCode {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(TABLE, code);
}

/** Header value to seconds: a positive integer clamped to 1..3600, otherwise the default. */
export function parseRetryAfter(header: unknown): number {
  if (typeof header !== "string") return DEFAULT_RETRY_AFTER_S;
  const t = header.trim();
  if (!/^[0-9]{1,15}$/.test(t)) return DEFAULT_RETRY_AFTER_S;
  const n = Number(t);
  if (!(n > 0)) return DEFAULT_RETRY_AFTER_S;
  return Math.min(MAX_RETRY_AFTER_S, Math.max(MIN_RETRY_AFTER_S, Math.floor(n)));
}

function cut(text: string): string | undefined {
  const t = text.slice(0, MAX_SERVER_MESSAGE);
  return t === "" ? undefined : t;
}

function readErrorBody(body: unknown): { code?: string; message?: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return {};
  const err = (body as { error?: unknown }).error;
  if (typeof err !== "object" || err === null || Array.isArray(err)) return {};
  const { code, message } = err as { code?: unknown; message?: unknown };
  const out: { code?: string; message?: string } = {};
  if (typeof code === "string") out.code = code;
  if (typeof message === "string") out.message = message;
  return out;
}

function fromEntry(code: KnownErrorCode, serverMessage: string | undefined): UiError {
  const e = TABLE[code];
  const out: UiError = { code, title: e.title, detail: e.detail, retryable: e.retryable };
  if (serverMessage !== undefined) out.serverMessage = serverMessage;
  return out;
}

function badResponse(parse: { category: string; message: string } | undefined): UiError {
  const out: UiError = {
    code: "bad_response",
    title: "The result couldn't be read",
    detail: "The service sent something that isn't a valid scan report. Nothing from it is shown.",
    retryable: true,
  };
  if (parse) {
    const d = cut(`${String(parse.category)}: ${String(parse.message)}`);
    if (d !== undefined) out.parseDetail = d;
  }
  return out;
}

function describeUnsafe(input: DescribeErrorInput): UiError {
  if (input.kind === "network") {
    return {
      code: "network_unreachable",
      title: "Can't reach the scan service",
      detail: "The scan service could not be reached. Is it running? In local development, start it with npm run dev.",
      retryable: true,
    };
  }
  if (input.kind === "timeout") {
    const seconds =
      typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs) && input.timeoutMs > 0
        ? Math.round(input.timeoutMs / 1000)
        : undefined;
    return {
      code: "client_timeout",
      title: "No answer in time",
      detail:
        seconds === undefined
          ? "The service did not answer in time."
          : `The service did not answer within ${seconds} seconds.`,
      retryable: true,
    };
  }
  if (input.kind === "parse") return badResponse(input.parse);

  const status = input.status;
  const { code, message } = readErrorBody(input.body);
  const serverMessage = message === undefined ? undefined : cut(message);

  if (isKnownCode(code)) {
    const out = fromEntry(code, serverMessage);
    if (code === "rate_limited") {
      const secs = parseRetryAfter(input.retryAfterHeader);
      out.retryAfterSeconds = secs;
      out.detail = `${TABLE.rate_limited.detail} You can scan again in ${secs} seconds.`;
    }
    return out;
  }
  if (status === 429) {
    const out = fromEntry("rate_limited", serverMessage);
    const secs = parseRetryAfter(input.retryAfterHeader);
    out.retryAfterSeconds = secs;
    out.detail = `${TABLE.rate_limited.detail} You can scan again in ${secs} seconds.`;
    return out;
  }
  // No readable error body (or a 200 that is not a report): bad_response.
  if (code === undefined) return badResponse(input.parse);

  const out: UiError = {
    code: "unknown_error",
    title: "Something went wrong",
    detail: `The service reported an unrecognised error${typeof status === "number" && Number.isFinite(status) ? ` (HTTP ${Math.trunc(status)})` : ""}.`,
    retryable: true,
  };
  if (serverMessage !== undefined) out.serverMessage = serverMessage;
  return out;
}

/** Total: never throws, always returns a non-empty title and detail. */
export function describeError(input: DescribeErrorInput): UiError {
  try {
    return describeUnsafe(input ?? {});
  } catch {
    return {
      code: "unknown_error",
      title: "Something went wrong",
      detail: "An unexpected error occurred while describing the failure.",
      retryable: true,
    };
  }
}
