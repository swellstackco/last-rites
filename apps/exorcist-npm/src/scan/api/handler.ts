import type { Clock, EvidenceConfig, HttpClient, Sleep } from "../../evidence/index.js";
import type { ScanPipeline } from "../pipeline.js";
import { serializeReport } from "../report.js";
import { createScanRuntime } from "../runtime.js";
import { createDeadline } from "../stop-signal.js";
import type { RepoInput, ScanError } from "../types.js";
import { clientIp } from "./client-ip.js";
import { validateScanApiConfig, type ScanApiConfig } from "./config.js";
import { createFsDemoStore, DEMO_NAME_PATTERN, type DemoStore } from "./demo-store.js";
import { createRateLimiter } from "./rate-limit.js";
import type { ApiErrorCode, ApiHandler, ApiRequest, ApiResponse } from "./types.js";
import { noWatchdog, type Watchdog } from "./watchdog.js";

export interface ScanApiDeps {
  http: HttpClient;
  clock: Clock;
  sleep: Sleep;
  config: ScanApiConfig;
  evidenceConfig: EvidenceConfig;
  /** Test seams. Defaults: a pipeline from createScanRuntime, an fs demo store, noWatchdog. */
  pipeline?: ScanPipeline;
  demoStore?: DemoStore;
  watchdog?: Watchdog;
}

const MAX_BODY_BYTES = 4096;
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const DEMO_ROUTE = /^\/api\/demo\/([^/]+)$/;
const TIMED_OUT: unique symbol = Symbol("timed_out");

const STATUS_BY_SCAN_CODE: Record<ScanError["code"], number> = {
  invalid_repo: 400,
  invalid_ref: 400,
  no_package_json: 404,
  malformed_package_json: 422,
  invalid_package_json_shape: 422,
  too_many_dependencies: 422,
  repo_fetch_failed: 502,
  scan_timeout: 504,
  internal_error: 500,
};

/** The one place an error body is built, so `code` and `message` are always non-empty. */
function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  extraHeaders: Record<string, string> = {},
): ApiResponse {
  return {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify({ error: { code, message } }),
  };
}

function rateLimited(retryAfterSeconds: number): ApiResponse {
  return errorResponse(429, "rate_limited", "too many requests; retry later", {
    "retry-after": String(retryAfterSeconds),
  });
}

function parseScanInput(bytes: Uint8Array): RepoInput | undefined {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const rec = value as Record<string, unknown>;
  const repo = rec["repo"];
  if (typeof repo !== "string" || !REPO_PATTERN.test(repo)) return undefined;
  const ref = rec["ref"];
  if (ref !== undefined && (typeof ref !== "string" || ref.length < 1 || ref.length > 256)) return undefined;
  const slash = repo.indexOf("/");
  const owner = repo.slice(0, slash);
  const name = repo.slice(slash + 1);
  return ref === undefined ? { owner, repo: name } : { owner, repo: name, ref };
}

export function createScanApi(deps: ScanApiDeps): ApiHandler {
  validateScanApiConfig(deps.config);
  const { config, clock } = deps;
  const scanLimiter = createRateLimiter({ ...config.scanRateLimit, clock });
  const demoLimiter = createRateLimiter({ ...config.demoRateLimit, clock });
  const pipeline =
    deps.pipeline ??
    createScanRuntime({
      http: deps.http,
      clock,
      sleep: deps.sleep,
      evidenceConfig: deps.evidenceConfig,
      maxDependencies: config.maxDependencies,
    }).pipeline;
  const demoStore = deps.demoStore ?? createFsDemoStore(config.demoDir);
  const watchdog = deps.watchdog ?? noWatchdog;
  const timeoutMs = config.timeoutSeconds * 1000;

  async function postScan(req: ApiRequest): Promise<ApiResponse> {
    const limited = scanLimiter.hit(clientIp(req, config.trustProxy));
    if (!limited.allowed) return rateLimited(limited.retryAfterSeconds);

    const contentType = (req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
    if (contentType !== "application/json") {
      return errorResponse(415, "unsupported_media_type", "content-type must be application/json");
    }

    const declared = req.headers["content-length"];
    if (declared !== undefined && Number(declared) > MAX_BODY_BYTES) {
      return errorResponse(413, "body_too_large", `body exceeds ${MAX_BODY_BYTES} bytes`);
    }
    const body = await req.readBody(MAX_BODY_BYTES);
    if (!body.ok) return errorResponse(413, "body_too_large", `body exceeds ${MAX_BODY_BYTES} bytes`);

    const input = parseScanInput(body.bytes);
    if (input === undefined) {
      return errorResponse(400, "invalid_input", 'body must be JSON like {"repo":"owner/name","ref":"optional"}');
    }

    const stop = createDeadline(clock, timeoutMs);
    const wd = watchdog(timeoutMs);
    let outcome: Awaited<ReturnType<ScanPipeline>> | typeof TIMED_OUT;
    try {
      outcome = await Promise.race([
        pipeline(input, { signal: stop }),
        wd.fired.then((): typeof TIMED_OUT => TIMED_OUT),
      ]);
    } finally {
      stop.abort();
      wd.dispose();
    }
    if (outcome === TIMED_OUT) return errorResponse(504, "scan_timeout", "scan exceeded the time limit");
    if (outcome.ok) {
      return { status: 200, headers: { "content-type": "application/json" }, body: serializeReport(outcome.report) };
    }
    const { code, message } = outcome.error;
    return errorResponse(STATUS_BY_SCAN_CODE[code] ?? 500, code, message);
  }

  async function getDemo(req: ApiRequest, name: string): Promise<ApiResponse> {
    const limited = demoLimiter.hit(clientIp(req, config.trustProxy));
    if (!limited.allowed) return rateLimited(limited.retryAfterSeconds);
    if (!DEMO_NAME_PATTERN.test(name)) {
      return errorResponse(400, "invalid_demo_name", "demo name must match [a-z0-9][a-z0-9-]{0,63}");
    }
    const bytes = await demoStore(name);
    if (bytes === undefined) return errorResponse(404, "demo_not_found", "no such demo");
    return { status: 200, headers: { "content-type": "application/json" }, body: bytes };
  }

  return async (req) => {
    try {
      if (req.path === "/api/scan") {
        if (req.method !== "POST") return errorResponse(405, "method_not_allowed", "use POST", { allow: "POST" });
        return await postScan(req);
      }
      const m = DEMO_ROUTE.exec(req.path);
      if (m !== null) {
        if (req.method !== "GET") return errorResponse(405, "method_not_allowed", "use GET", { allow: "GET" });
        return await getDemo(req, m[1] as string);
      }
      return errorResponse(404, "not_found", "no such route");
    } catch {
      return errorResponse(500, "internal_error", "unexpected error");
    }
  };
}
