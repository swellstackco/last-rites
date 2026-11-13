/** Injection points for all I/O (design: "Injection points"). */

export interface HttpRequest {
  method: "GET" | "POST";
  url: string;
  /** Never part of a cache key. */
  headers?: Record<string, string>;
  /** JSON text for POST. */
  body?: string;
  timeoutMs: number;
}

export interface HttpResponse {
  status: number;
  /** Lower-cased header names. */
  headers: Record<string, string>;
  /** Raw text. */
  body: string;
}

/** Resolves for any HTTP status. Throws HttpClientError for transport failures. */
export interface HttpClient {
  request(req: HttpRequest): Promise<HttpResponse>;
}

export class HttpClientError extends Error {
  readonly category: "timeout" | "network_error";
  constructor(category: "timeout" | "network_error", message: string) {
    super(message);
    this.name = "HttpClientError";
    this.category = category;
  }
}

export type Clock = () => Date;
export type Sleep = (ms: number) => Promise<void>;

export interface EvidenceDeps {
  http: HttpClient;
  clock: Clock;
  sleep: Sleep;
}
