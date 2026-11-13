import { HttpClientError, type HttpClient, type HttpRequest, type HttpResponse } from "../evidence/index.js";

export const DEFAULT_MAX_BODY_BYTES = 32 * 1024 * 1024;
export const DEFAULT_USER_AGENT = "exorcist-npm-scanner";

/**
 * Production HttpClient over global fetch. Attaches no credentials of its own (the evidence stage adds
 * Authorization for api.github.com only). Redirects are followed. Never imported by a test that
 * does not stub globalThis.fetch itself.
 */
export function createFetchClient(opts: { maxBodyBytes?: number; userAgent?: string } = {}): HttpClient {
  const maxBodyBytes = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;

  return {
    async request(req: HttpRequest): Promise<HttpResponse> {
      const isTimeout = (err: unknown): boolean =>
        err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      try {
        const init: RequestInit = {
          method: req.method,
          headers: { "user-agent": userAgent, ...(req.headers ?? {}) },
          signal: AbortSignal.timeout(req.timeoutMs),
          redirect: "follow",
        };
        if (req.body !== undefined) init.body = req.body;
        const res = await fetch(req.url, init);

        const headers: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });

        const chunks: Uint8Array[] = [];
        let total = 0;
        if (res.body) {
          const reader = res.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBodyBytes) {
              await reader.cancel().catch(() => {});
              throw new HttpClientError("network_error", "response body too large");
            }
            chunks.push(value);
          }
        }
        const body = Buffer.concat(chunks).toString("utf8");
        return { status: res.status, headers, body };
      } catch (err) {
        if (err instanceof HttpClientError) throw err;
        if (isTimeout(err)) throw new HttpClientError("timeout", "request timed out");
        throw new HttpClientError("network_error", "request failed");
      }
    },
  };
}
