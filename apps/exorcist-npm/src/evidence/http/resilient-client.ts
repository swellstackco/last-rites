import type { Clock, HttpClient, HttpRequest, HttpResponse, Sleep } from "./types.js";

/** Thrown when a request cannot be completed because of rate limiting. Picked up by the cache as `rate_limited`. */
export class RateLimitedError extends Error {
  readonly category = "rate_limited" as const;
  constructor(message: string) {
    super(message);
    this.name = "RateLimitedError";
  }
}

export interface ResilientOptions {
  maxConcurrency: number;
  maxRetries: number;
  githubMaxWaitSeconds: number;
}

/** Counting semaphore: FIFO hand-off of slots. */
export class Semaphore {
  private free: number;
  private readonly waiters: Array<() => void> = [];
  constructor(slots: number) {
    this.free = slots;
  }
  async acquire(): Promise<void> {
    if (this.free > 0) {
      this.free--;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }
  release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.free++;
  }
}

const GITHUB_HOST = "api.github.com";

function isGithub(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === GITHUB_HOST;
  } catch {
    return false;
  }
}

/** Seconds to wait for a 429: `retry-after` if a non-negative integer, else min(30, 2^attempt). */
export function backoffSeconds(retryAfter: string | undefined, attempt: number): number {
  if (retryAfter !== undefined && /^\d+$/.test(retryAfter.trim())) return Number(retryAfter.trim());
  return Math.min(30, 2 ** attempt);
}

export class ResilientClient implements HttpClient {
  private readonly semaphore: Semaphore;
  /** Epoch ms at which GitHub allows requests again, from the last live exhausted response. */
  private githubResetMs: number | undefined;

  constructor(
    private readonly http: HttpClient,
    private readonly clock: Clock,
    private readonly sleep: Sleep,
    private readonly opts: ResilientOptions,
  ) {
    this.semaphore = new Semaphore(opts.maxConcurrency);
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    const github = isGithub(req.url);
    for (let attempt = 0; ; attempt++) {
      if (github) await this.passGate();

      await this.semaphore.acquire();
      let res: HttpResponse;
      try {
        res = await this.http.request(req);
      } finally {
        this.semaphore.release();
      }

      if (github) this.observe(res);
      if (res.status !== 429) return res;

      if (attempt >= this.opts.maxRetries) {
        throw new RateLimitedError(`rate limited: retries exhausted for ${req.method} ${req.url}`);
      }
      await this.sleep(backoffSeconds(res.headers["retry-after"], attempt) * 1000);
    }
  }

  /** Record rate-limit state from a live GitHub response. */
  private observe(res: HttpResponse): void {
    if (res.headers["x-ratelimit-remaining"] !== "0") return;
    const reset = Number(res.headers["x-ratelimit-reset"]);
    if (Number.isFinite(reset)) this.githubResetMs = reset * 1000;
  }

  private async passGate(): Promise<void> {
    if (this.githubResetMs === undefined) return;
    const wait = this.githubResetMs - this.clock().getTime();
    if (wait <= 0) {
      this.githubResetMs = undefined;
      return;
    }
    if (wait > this.opts.githubMaxWaitSeconds * 1000) {
      throw new RateLimitedError(
        `rate limited: GitHub quota resets in ${Math.ceil(wait / 1000)}s, above the ${this.opts.githubMaxWaitSeconds}s maximum wait`,
      );
    }
    await this.sleep(wait);
    this.githubResetMs = undefined;
  }
}
