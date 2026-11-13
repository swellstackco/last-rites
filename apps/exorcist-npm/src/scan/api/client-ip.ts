/** The slice of an API request that `clientIp` needs. */
export interface ClientIpRequest {
  headers: Readonly<Record<string, string>>;
  remoteAddress: string | undefined;
}

/**
 * The rate-limit key for a request.
 *
 * Deployment note (nginx): only the LAST `x-forwarded-for` entry is trusted, so nginx must set
 * the header so that its last entry is the real client address, for example
 * `proxy_set_header X-Forwarded-For $remote_addr;` (this replaces anything the client sent).
 * With `trustProxy` false the header is ignored entirely.
 */
export function clientIp(req: ClientIpRequest, trustProxy: boolean): string {
  if (trustProxy) {
    const header = req.headers["x-forwarded-for"];
    if (header !== undefined) {
      const parts = header.split(",");
      const last = (parts[parts.length - 1] ?? "").trim();
      if (last !== "") return last;
    }
  }
  if (req.remoteAddress !== undefined && req.remoteAddress !== "") return req.remoteAddress;
  return "unknown";
}
