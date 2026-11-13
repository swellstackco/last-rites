import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { scheduler } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { configFromEnv } from "../evidence/index.js";
import {
  DEFAULT_SCAN_API_CONFIG,
  parsePortEnv,
  ScanApiConfigError,
  type ScanApiConfig,
} from "./api/config.js";
import { createScanApi } from "./api/handler.js";
import type { ApiHandler, ApiRequest, ApiResponse } from "./api/types.js";
import { realWatchdog } from "./api/watchdog.js";
import { createFetchClient } from "./fetch-client.js";

/** The host is fixed in code: the API listens on loopback only, nginx fronts it. */
export const LISTEN_HOST = "127.0.0.1";

export class ServerStartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerStartError";
  }
}

export function toApiRequest(req: IncomingMessage): ApiRequest {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    headers[k] = Array.isArray(v) ? v.join(", ") : v;
  }
  let path = "/";
  try {
    path = new URL(req.url ?? "/", "http://x").pathname;
  } catch {
    path = "/";
  }
  return {
    method: (req.method ?? "GET").toUpperCase(),
    path,
    headers,
    remoteAddress: req.socket.remoteAddress,
    readBody(limitBytes) {
      return new Promise((resolve) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let done = false;
        const finish = (v: Awaited<ReturnType<ApiRequest["readBody"]>>): void => {
          if (done) return;
          done = true;
          req.off("data", onData);
          req.off("end", onEnd);
          req.off("error", onError);
          resolve(v);
        };
        const onData = (chunk: Buffer): void => {
          total += chunk.length;
          if (total > limitBytes) {
            // Stop reading: nothing more is buffered from this request.
            req.pause();
            finish({ ok: false, reason: "too_large" });
            return;
          }
          chunks.push(chunk);
        };
        const onEnd = (): void => finish({ ok: true, bytes: new Uint8Array(Buffer.concat(chunks)) });
        const onError = (): void => finish({ ok: true, bytes: new Uint8Array(0) });
        req.on("data", onData);
        req.on("end", onEnd);
        req.on("error", onError);
      });
    },
  };
}

export function writeApiResponse(req: IncomingMessage, res: ServerResponse, out: ApiResponse): void {
  const headers: Record<string, string> = { ...out.headers };
  if (out.status === 413) headers["connection"] = "close";
  res.writeHead(out.status, headers);
  res.end(out.body);
  if (out.status === 413) {
    // Do not read the rest of an oversized body.
    res.once("finish", () => req.destroy());
  }
}

export function startServer(handler: ApiHandler, opts: { port: number; timeoutSeconds?: number }): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      handler(toApiRequest(req)).then(
        (out) => writeApiResponse(req, res, out),
        () =>
          writeApiResponse(req, res, {
            status: 500,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ error: { code: "internal_error", message: "unexpected error" } }),
          }),
      );
    });
    const slackMs = ((opts.timeoutSeconds ?? DEFAULT_SCAN_API_CONFIG.timeoutSeconds) + 5) * 1000;
    server.headersTimeout = slackMs;
    server.requestTimeout = slackMs;
    server.once("error", (err: NodeJS.ErrnoException) => {
      reject(new ServerStartError(`cannot listen on port ${opts.port}: ${err.code ?? err.message}`));
    });
    server.listen(opts.port, LISTEN_HOST, () => {
      server.removeAllListeners("error");
      resolve(server);
    });
  });
}

export interface MainOptions {
  /** Defaults to process.env. */
  env?: Record<string, string | undefined>;
  stderr?: (line: string) => void;
  exit?: (code: number) => void;
}

/** The only reader of process.env for the API. */
export async function main(opts: MainOptions = {}): Promise<void> {
  const env = opts.env ?? process.env;
  const stderr = opts.stderr ?? ((line: string) => void process.stderr.write(`${line}\n`));
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  try {
    const port = parsePortEnv(env["PORT"]);
    const config: ScanApiConfig = { ...DEFAULT_SCAN_API_CONFIG, port };
    const cacheRoot = fileURLToPath(new URL("../../../../", import.meta.url));
    const handler = createScanApi({
      http: createFetchClient(),
      clock: () => new Date(),
      sleep: (ms) => scheduler.wait(ms),
      config,
      evidenceConfig: configFromEnv(env, cacheRoot),
      watchdog: realWatchdog,
    });
    await startServer(handler, { port, timeoutSeconds: config.timeoutSeconds });
  } catch (err) {
    if (err instanceof ScanApiConfigError || err instanceof ServerStartError) {
      stderr(err.message);
      exit(1);
      return;
    }
    throw err;
  }
}

// Never run under Vitest, and only when this file is the process entry point.
if (!process.env["VITEST"] && /server\.[cm]?[jt]s$/.test(process.argv[1] ?? "")) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
