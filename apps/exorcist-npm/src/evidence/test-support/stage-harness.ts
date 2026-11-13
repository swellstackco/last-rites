import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG, type EvidenceConfig } from "../config.js";
import type { EvidenceDeps, HttpClient, HttpRequest, HttpResponse } from "../http/types.js";
import { createEvidenceStage } from "../stage.js";
import type { EvidenceResult, EvidenceStage } from "../types.js";
import { createFakeClock } from "./fake-clock.js";
import { createFakeSleep } from "./fake-sleep.js";
import { FakeHttp, loadFixtureCase, type FailureMode, type FixtureEntry } from "./fake-http.js";
import { createTempCache } from "./temp-cache.js";

/** The seam under test for the stage-level properties (3, 5, 11). Sabotages wrap the real stage. */
export type StageFactory = (config: EvidenceConfig, deps: EvidenceDeps) => EvidenceStage;
export const realStage: StageFactory = createEvidenceStage;

export const SOURCE_NAMES = ["npm", "github", "osv", "e18e"] as const;
export type SourceName = (typeof SOURCE_NAMES)[number];

export const SOURCE_HOST: Record<SourceName, string> = {
  npm: "registry.npmjs.org",
  github: "api.github.com",
  osv: "api.osv.dev",
  e18e: "raw.githubusercontent.com",
};

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function sourceOfUrl(url: string): SourceName | undefined {
  const h = hostOf(url);
  return SOURCE_NAMES.find((s) => SOURCE_HOST[s] === h);
}

export interface FixtureCase {
  caseName: string;
  pkg: string;
  /** Whether the npm document carries a parseable GitHub repository. */
  hasRepo: boolean;
}

/** The five recorded cases (Requirement 12.3). */
export const CASES: readonly FixtureCase[] = [
  { caseName: "picocolors", pkg: "picocolors", hasRepo: true },
  { caseName: "request", pkg: "request", hasRepo: true },
  { caseName: "left-pad", pkg: "left-pad", hasRepo: true },
  { caseName: "archived-repo", pkg: "gulp-util", hasRepo: true },
  { caseName: "no-repository", pkg: "demo", hasRepo: false },
];

const fixtureMemo = new Map<string, FixtureEntry[]>();
export function fixturesFor(caseName: string): FixtureEntry[] {
  let f = fixtureMemo.get(caseName);
  if (!f) {
    f = [...loadFixtureCase(caseName), ...loadFixtureCase("shared")];
    fixtureMemo.set(caseName, f);
  }
  return f;
}

/** Category the stage must report for a failure mode (design: failure classification table). */
export const MODE_CATEGORY: Record<FailureMode, string> = {
  network_error: "network_error",
  timeout: "timeout",
  http_500: "network_error",
  rate_limited: "rate_limited",
  malformed_body: "malformed_response",
  not_found: "not_found",
};

export interface RecordedRequest {
  req: HttpRequest;
  /** HTTP status when a response came back; undefined when the client threw. */
  status?: number;
}

/**
 * Wraps a client: records every request (with headers) and, optionally, answers the first
 * authenticated api.github.com request with a 401 (a rejected token).
 */
export class TapHttp implements HttpClient {
  readonly log: RecordedRequest[] = [];
  private rejected = false;
  constructor(
    private readonly inner: HttpClient,
    private readonly opts: { rejectGithubTokenOnce?: boolean } = {},
  ) {}

  async request(req: HttpRequest): Promise<HttpResponse> {
    const rec: RecordedRequest = { req: { ...req, ...(req.headers ? { headers: { ...req.headers } } : {}) } };
    this.log.push(rec);
    const authed = Object.keys(req.headers ?? {}).some((h) => h.toLowerCase() === "authorization");
    if (this.opts.rejectGithubTokenOnce && !this.rejected && authed && hostOf(req.url) === SOURCE_HOST.github) {
      this.rejected = true;
      rec.status = 401;
      return { status: 401, headers: {}, body: "{\"message\":\"Bad credentials\"}" };
    }
    const res = await this.inner.request(req);
    rec.status = res.status;
    return res;
  }
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Release the fake's pending responses in an order chosen by `picks` until `promise` settles. */
export async function drive<T>(promise: Promise<T>, fake: FakeHttp, picks: readonly number[]): Promise<T> {
  let done = false;
  let value: T | undefined;
  let error: unknown;
  let failed = false;
  promise.then(
    (v) => {
      done = true;
      value = v;
    },
    (e: unknown) => {
      done = true;
      failed = true;
      error = e;
    },
  );
  let i = 0;
  let idleSince = Date.now();
  while (!done) {
    await tick();
    if (fake.pendingCount > 0) {
      idleSince = Date.now();
      fake.release((picks[i++ % picks.length] ?? 0) % fake.pendingCount);
    } else if (Date.now() - idleSince > 10_000) {
      throw new Error("stalled: stage neither settled nor issued a request for 10s");
    }
  }
  if (failed) throw error;
  return value as T;
}

export interface RunSpec {
  make: StageFactory;
  fixtureCase: FixtureCase;
  failures?: Partial<Record<SourceName, FailureMode | undefined>>;
  now: Date | string;
  versionRange?: string | undefined;
  maxConcurrency?: number;
  /** When given, responses are held and released in this (modulo pending count) order. */
  picks?: readonly number[];
  token?: string;
  rejectTokenOnce?: boolean;
}

export interface RunOutput {
  result: EvidenceResult;
  log: RecordedRequest[];
  cacheRoot: string;
  /** Every file under `<root>/.cache` at the end of the run. */
  cacheFiles: Array<{ name: string; content: string }>;
}

/** One stage run on a fresh temp cache with a fake clock and sleep. Never touches the network. */
export async function runCase(spec: RunSpec): Promise<RunOutput> {
  const tmp = createTempCache();
  try {
    const failures = Object.entries(spec.failures ?? {}).flatMap(([src, mode]) =>
      mode ? [{ match: (r: HttpRequest) => hostOf(r.url) === SOURCE_HOST[src as SourceName], mode }] : [],
    );
    const fake = new FakeHttp({
      fixtures: fixturesFor(spec.fixtureCase.caseName),
      failures,
      hold: spec.picks !== undefined,
    });
    const tap = new TapHttp(fake, spec.rejectTokenOnce ? { rejectGithubTokenOnce: true } : {});
    const clock = createFakeClock("2026-01-01T00:00:00.000Z");
    const config: EvidenceConfig = {
      ...DEFAULT_CONFIG,
      cacheRoot: tmp.root,
      ...(spec.maxConcurrency !== undefined ? { maxConcurrency: spec.maxConcurrency } : {}),
      ...(spec.token !== undefined ? { githubToken: spec.token } : {}),
    };
    const stage = spec.make(config, { http: tap, clock: clock.clock, sleep: createFakeSleep(clock).sleep });
    const input = {
      name: spec.fixtureCase.pkg,
      now: spec.now,
      ...(spec.versionRange !== undefined ? { versionRange: spec.versionRange } : {}),
    };
    const pending = stage(input);
    const result = spec.picks !== undefined ? await drive(pending, fake, spec.picks) : await pending;
    if (fake.unmatched.length > 0) {
      throw new Error(`request(s) matched no fixture: ${fake.unmatched.map((r) => `${r.method} ${r.url}`).join(", ")}`);
    }
    const dir = join(tmp.root, ".cache");
    let names: string[] = [];
    try {
      names = readdirSync(dir).sort();
    } catch {
      names = [];
    }
    const cacheFiles = names.map((name) => ({ name, content: readFileSync(join(dir, name), "utf8") }));
    return { result, log: tap.log, cacheRoot: tmp.root, cacheFiles };
  } finally {
    tmp.cleanup();
  }
}
