import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HttpClientError, type HttpClient, type HttpRequest, type HttpResponse } from "../http/types.js";

/**
 * On-disk fixture layout (defined here, task 1.4):
 *
 *   __fixtures__/<case>/<name>.json     one recorded exchange per file
 *   __fixtures__/shared/<name>.json     exchanges shared by all cases (e18e manifests, deps.dev)
 *
 * Each file is a FixtureEntry. Request headers are never recorded.
 */
export interface FixtureEntry {
  method: "GET" | "POST";
  url: string;
  /** Exact request body for POST. When omitted the entry matches any body. */
  body?: string;
  response: HttpResponse;
}

export const FIXTURES_ROOT = fileURLToPath(new URL("../__fixtures__", import.meta.url));

/** Load every `*.json` fixture entry in `__fixtures__/<caseName>/` (empty list if the case has none yet). */
export function loadFixtureCase(caseName: string, root: string = FIXTURES_ROOT): FixtureEntry[] {
  const dir = join(root, caseName);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as FixtureEntry);
}

export class UnmatchedFixtureRequest extends Error {
  readonly request: HttpRequest;
  constructor(request: HttpRequest) {
    super(`No fixture for ${request.method} ${request.url}${request.body ? ` body=${request.body}` : ""}`);
    this.name = "UnmatchedFixtureRequest";
    this.request = request;
  }
}

export type FailureMode =
  | "network_error"
  | "timeout"
  | "http_500"
  | "rate_limited"
  | "malformed_body"
  | "not_found";

/** Injected failure: requests matching `match` get `mode` instead of the fixture. */
export interface FailureRule {
  match: (req: HttpRequest) => boolean;
  mode: FailureMode;
}

export interface FakeHttpOptions {
  fixtures?: readonly FixtureEntry[];
  failures?: readonly FailureRule[];
  /**
   * When true every request stays pending until released with `release`/`releaseAll`,
   * so tests control completion order and observe concurrency.
   */
  hold?: boolean;
}

interface Pending {
  req: HttpRequest;
  settle: () => void;
}

export function failureResponse(mode: Exclude<FailureMode, "network_error" | "timeout">): HttpResponse {
  switch (mode) {
    case "http_500":
      return { status: 500, headers: {}, body: "internal error" };
    case "rate_limited":
      return { status: 429, headers: {}, body: "slow down" };
    case "malformed_body":
      return { status: 200, headers: { "content-type": "application/json" }, body: "<<not json>>" };
    case "not_found":
      return { status: 404, headers: {}, body: "{\"error\":\"not found\"}" };
  }
}

/** Fixture-backed HttpClient. Records every request; a miss records it and throws UnmatchedFixtureRequest. */
export class FakeHttp implements HttpClient {
  /** Every request received, in arrival order. */
  readonly requests: HttpRequest[] = [];
  /** Requests that matched no fixture. Tests assert this is empty in afterEach (Requirement 12.4). */
  readonly unmatched: HttpRequest[] = [];
  inFlight = 0;
  maxInFlight = 0;
  private readonly pending: Pending[] = [];
  private readonly fixtures: FixtureEntry[];
  private readonly failures: FailureRule[];
  private readonly hold: boolean;

  constructor(opts: FakeHttpOptions = {}) {
    this.fixtures = [...(opts.fixtures ?? [])];
    this.failures = [...(opts.failures ?? [])];
    this.hold = opts.hold ?? false;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  request(req: HttpRequest): Promise<HttpResponse> {
    this.requests.push(req);
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    const done = (): void => {
      this.inFlight--;
    };
    const compute = (): HttpResponse => this.resolve(req);
    if (!this.hold) {
      try {
        return Promise.resolve(compute()).finally(done);
      } catch (e) {
        done();
        return Promise.reject(e);
      }
    }
    return new Promise<HttpResponse>((resolve, reject) => {
      this.pending.push({
        req,
        settle: () => {
          done();
          try {
            resolve(compute());
          } catch (e) {
            reject(e);
          }
        },
      });
    });
  }

  /** Settle the pending request at `index` (index into the current pending list). */
  release(index = 0): void {
    const [p] = this.pending.splice(index, 1);
    p?.settle();
  }

  /** Settle all pending requests in the given order (a permutation of current indices), default FIFO. */
  releaseAll(order?: readonly number[]): void {
    const snapshot = this.pending.splice(0, this.pending.length);
    const indices = order ?? snapshot.map((_, i) => i);
    for (const i of indices) snapshot[i]?.settle();
  }

  private resolve(req: HttpRequest): HttpResponse {
    const rule = this.failures.find((f) => f.match(req));
    if (rule) {
      if (rule.mode === "network_error") throw new HttpClientError("network_error", "simulated network error");
      if (rule.mode === "timeout") throw new HttpClientError("timeout", "simulated timeout");
      return failureResponse(rule.mode);
    }
    const hit = this.fixtures.find(
      (f) => f.method === req.method && f.url === req.url && (f.body === undefined || f.body === req.body),
    );
    if (!hit) {
      this.unmatched.push(req);
      throw new UnmatchedFixtureRequest(req);
    }
    return { status: hit.response.status, headers: { ...hit.response.headers }, body: hit.response.body };
  }
}
