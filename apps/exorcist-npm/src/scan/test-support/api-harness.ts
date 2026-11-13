import { DEFAULT_CONFIG, type EvidenceConfig } from "../../evidence/config.js";
import { createFakeClock, type FakeClock } from "../../evidence/test-support/fake-clock.js";
import { createFakeSleep } from "../../evidence/test-support/fake-sleep.js";
import { FakeHttp } from "../../evidence/test-support/fake-http.js";
import { DEFAULT_SCAN_API_CONFIG, type ScanApiConfig } from "../api/config.js";
import { createScanApi } from "../api/handler.js";
import type { DemoStore } from "../api/demo-store.js";
import type { ApiRequest, ApiResponse } from "../api/types.js";
import type { Watchdog } from "../api/watchdog.js";
import type { ScanPipeline } from "../pipeline.js";
import type { ScanOutcome, ScanReport } from "../types.js";

export const EMPTY_REPORT: ScanReport = {
  repo: "o/r",
  ref: "HEAD",
  scannedAt: "2026-11-13T00:00:00.000Z",
  dependencies: [],
  skipped: [],
  warnings: [],
  summary: { total: 0, skipped: 0, alive: 0, ailing: 0, dying: 0, dead: 0 },
};

export interface ReqOptions {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  remoteAddress?: string | undefined;
  body?: string | Uint8Array;
}

export interface TestRequest extends ApiRequest {
  readBodyCalls: number;
}

export function makeRequest(o: ReqOptions = {}): TestRequest {
  const raw = o.body ?? "";
  const bytes = typeof raw === "string" ? new TextEncoder().encode(raw) : raw;
  const req: TestRequest = {
    method: o.method ?? "GET",
    path: o.path ?? "/",
    headers: o.headers ?? {},
    remoteAddress: "remoteAddress" in o ? o.remoteAddress : "10.0.0.1",
    readBodyCalls: 0,
    async readBody(limit) {
      req.readBodyCalls++;
      return bytes.byteLength > limit ? { ok: false, reason: "too_large" } : { ok: true, bytes };
    },
  };
  return req;
}

export function postScan(body: string | Uint8Array, headers: Record<string, string> = {}, o: ReqOptions = {}) {
  return makeRequest({
    method: "POST",
    path: "/api/scan",
    headers: { "content-type": "application/json", ...headers },
    body,
    ...o,
  });
}

export interface ManualWatchdog {
  watchdog: Watchdog;
  fire(): void;
  disposed: number;
}

export function manualWatchdog(): ManualWatchdog {
  let resolve: () => void = () => {};
  const m: ManualWatchdog = {
    disposed: 0,
    fire: () => resolve(),
    watchdog: () => ({
      fired: new Promise<void>((r) => {
        resolve = r;
      }),
      dispose() {
        m.disposed++;
      },
    }),
  };
  return m;
}

export interface Harness {
  handler: (req: ApiRequest) => Promise<ApiResponse>;
  clock: FakeClock;
  pipelineCalls: Array<{ input: unknown; signal: unknown }>;
  storeCalls: string[];
  http: FakeHttp;
}

export interface HarnessOptions {
  config?: Partial<ScanApiConfig>;
  outcome?: ScanOutcome | (() => Promise<ScanOutcome>);
  store?: DemoStore;
  watchdog?: Watchdog;
}

export function makeHarness(o: HarnessOptions = {}): Harness {
  const clock = createFakeClock("2026-11-13T00:00:00.000Z");
  const http = new FakeHttp({ fixtures: [] });
  const pipelineCalls: Harness["pipelineCalls"] = [];
  const storeCalls: string[] = [];
  const pipeline: ScanPipeline = async (input, opts) => {
    pipelineCalls.push({ input, signal: opts?.signal });
    const out = o.outcome ?? { ok: true, report: EMPTY_REPORT };
    return typeof out === "function" ? out() : out;
  };
  const store: DemoStore =
    o.store ??
    (async () => undefined);
  const handler = createScanApi({
    http,
    clock: clock.clock,
    sleep: createFakeSleep(clock).sleep,
    config: { ...DEFAULT_SCAN_API_CONFIG, ...o.config },
    evidenceConfig: { ...DEFAULT_CONFIG, cacheRoot: "/nonexistent-never-used" } as EvidenceConfig,
    pipeline,
    demoStore: async (name) => {
      storeCalls.push(name);
      return store(name);
    },
    ...(o.watchdog ? { watchdog: o.watchdog } : {}),
  });
  return { handler, clock, pipelineCalls, storeCalls, http };
}

export function bodyText(res: ApiResponse): string {
  return typeof res.body === "string" ? res.body : new TextDecoder().decode(res.body);
}

export function errorCode(res: ApiResponse): string {
  const parsed = JSON.parse(bodyText(res)) as { error: { code: string; message: string } };
  return parsed.error.code;
}
