import { parseReport } from "@last-rites/exorcist-npm/report";
import type { ScanReport } from "@last-rites/exorcist-npm/report";
import { isProofName, parseProofReport } from "@last-rites/skeleton/proof";
import type { ProofReport } from "@last-rites/skeleton/proof";
import { DEMO_TIMEOUT_MS, LIVE_TIMEOUT_MS, MAX_ERROR_BODY_BYTES } from "../constants.js";
import { describeError } from "./errors.js";
import type { UiError } from "./errors.js";

export interface ApiClientDeps {
  /** Injected; tests pass a fake. Never called at import time. */
  fetch: typeof globalThis.fetch;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
  /** "" = same origin. */
  baseUrl?: string;
}

export type ApiResult =
  | { ok: true; report: ScanReport; via: "api" | "static" }
  | { ok: false; cancelled: true }
  | { ok: false; error: UiError };

/** Result of loading a Proof_Report; `getProof` never throws. `cancelled` means the caller aborted. */
export type ProofLoad =
  | { ok: true; report: ProofReport }
  | { ok: false; reason: "absent" | "invalid" | "failed" | "cancelled" };

export interface ApiClient {
  getDemo(name: string, signal: AbortSignal): Promise<ApiResult>;
  getProof(demo: string, pkg: string, signal: AbortSignal): Promise<ProofLoad>;
  scanRepo(input: { repo: string; ref?: string }, signal: AbortSignal): Promise<ApiResult>;
}

type RawOutcome =
  | { kind: "response"; status: number; retryAfter: string | null; text: string }
  | { kind: "network" }
  | { kind: "timeout"; timeoutMs: number }
  | { kind: "cancelled" };

export function createApiClient(deps: ApiClientDeps): ApiClient {
  const base = (deps.baseUrl ?? "").replace(/\/+$/, "");

  async function request(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    callerSignal: AbortSignal,
  ): Promise<RawOutcome> {
    if (callerSignal.aborted) return { kind: "cancelled" };
    const controller = new AbortController();
    let timedOut = false;
    const onCallerAbort = (): void => controller.abort();
    callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    const timer = deps.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await deps.fetch(url, { ...init, signal: controller.signal });
      const text = await response.text();
      return { kind: "response", status: response.status, retryAfter: response.headers.get("retry-after"), text };
    } catch {
      if (callerSignal.aborted) return { kind: "cancelled" };
      if (timedOut) return { kind: "timeout", timeoutMs };
      return { kind: "network" };
    } finally {
      deps.clearTimeout(timer);
      callerSignal.removeEventListener("abort", onCallerAbort);
    }
  }

  function errorBody(text: string): unknown {
    if (text.length > MAX_ERROR_BODY_BYTES) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  }

  function toResult(raw: RawOutcome, via: "api" | "static"): ApiResult {
    switch (raw.kind) {
      case "cancelled":
        return { ok: false, cancelled: true };
      case "network":
        return { ok: false, error: describeError({ kind: "network" }) };
      case "timeout":
        return { ok: false, error: describeError({ kind: "timeout", timeoutMs: raw.timeoutMs }) };
      case "response": {
        if (raw.status === 200) {
          const parsed = parseReport(raw.text);
          if (parsed.ok) return { ok: true, report: parsed.report, via };
          return { ok: false, error: describeError({ kind: "parse", parse: parsed.error }) };
        }
        return {
          ok: false,
          error: describeError({ status: raw.status, body: errorBody(raw.text), retryAfterHeader: raw.retryAfter }),
        };
      }
    }
  }

  function wantsFallback(raw: RawOutcome): boolean {
    if (raw.kind === "network" || raw.kind === "timeout") return true;
    return raw.kind === "response" && (raw.status >= 500 || raw.status === 404);
  }

  return {
    async getDemo(name, signal) {
      const enc = encodeURIComponent(name);
      const api = await request(`${base}/api/demo/${enc}`, { method: "GET" }, DEMO_TIMEOUT_MS, signal);
      const apiResult = toResult(api, "api");
      if (apiResult.ok || "cancelled" in apiResult || !wantsFallback(api)) return apiResult;
      const fallback = await request(`${base}/demo/${enc}.json`, { method: "GET" }, DEMO_TIMEOUT_MS, signal);
      const fallbackResult = toResult(fallback, "static");
      if (fallbackResult.ok) return fallbackResult;
      if ("cancelled" in fallbackResult) return fallbackResult;
      return apiResult; // the original API error, not the fallback's
    },

    async getProof(demo, pkg, signal) {
      if (!isProofName(demo) || !isProofName(pkg)) return { ok: false, reason: "absent" };
      const raw = await request(
        `${base}/demo/proofs/${demo}/${pkg}.json`,
        { method: "GET", credentials: "omit" },
        DEMO_TIMEOUT_MS,
        signal,
      );
      switch (raw.kind) {
        case "cancelled":
          return { ok: false, reason: "cancelled" };
        case "network":
        case "timeout":
          return { ok: false, reason: "failed" };
        case "response": {
          if (raw.status === 404) return { ok: false, reason: "absent" };
          if (raw.status !== 200) return { ok: false, reason: "failed" };
          try {
            const parsed = parseProofReport(raw.text);
            if (parsed.ok) return { ok: true, report: parsed.report };
            // The dev server's SPA fallback answers 200 with HTML: not JSON means no proof here.
            const c = parsed.error.category;
            return { ok: false, reason: c === "invalid_json" || c === "empty" ? "absent" : "invalid" };
          } catch {
            return { ok: false, reason: "invalid" };
          }
        }
      }
    },

    async scanRepo(input, signal) {
      const payload: { repo: string; ref?: string } = { repo: input.repo };
      if (input.ref !== undefined) payload.ref = input.ref;
      const raw = await request(
        `${base}/api/scan`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "omit",
        },
        LIVE_TIMEOUT_MS,
        signal,
      );
      return toResult(raw, "api");
    },
  };
}
