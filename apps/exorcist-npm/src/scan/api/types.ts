import type { ScanError } from "../types.js";

/** Plain-data request: the handler needs no framework and tests call it with literals. */
export interface ApiRequest {
  /** Upper-case. */
  method: string;
  /** Pathname only, no query, not decoded. */
  path: string;
  /** Lower-case names. */
  headers: Readonly<Record<string, string>>;
  /** Socket address. */
  remoteAddress: string | undefined;
  /** Reads at most limitBytes. Called only after the rate limit, content-type and content-length checks. */
  readBody(limitBytes: number): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; reason: "too_large" }>;
}

export interface ApiResponse {
  status: number;
  /** Always includes content-type. */
  headers: Record<string, string>;
  body: string | Uint8Array;
}

export type ApiHandler = (req: ApiRequest) => Promise<ApiResponse>;

/** Every `code` the API can put in an error body: its own codes plus the Scan_Error codes. */
export type ApiErrorCode =
  | "not_found"
  | "method_not_allowed"
  | "rate_limited"
  | "unsupported_media_type"
  | "body_too_large"
  | "invalid_input"
  | "invalid_demo_name"
  | "demo_not_found"
  | "internal_error"
  | ScanError["code"];
