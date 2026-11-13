import { fileURLToPath } from "node:url";

export interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
}

export interface ScanApiConfig {
  port: number;
  scanRateLimit: RateLimitConfig;
  /** Separate counter from the scan limiter. */
  demoRateLimit: RateLimitConfig;
  /** Request and scan timeout. */
  timeoutSeconds: number;
  trustProxy: boolean;
  demoDir: string;
  maxDependencies: number;
}

export const DEFAULT_PORT = 27431;

export const DEFAULT_SCAN_API_CONFIG: ScanApiConfig = {
  port: DEFAULT_PORT,
  scanRateLimit: { limit: 10, windowSeconds: 60 },
  demoRateLimit: { limit: 120, windowSeconds: 60 },
  timeoutSeconds: 60,
  trustProxy: false,
  // <repo root>/demo, from src/scan/api/config.ts
  demoDir: fileURLToPath(new URL("../../../../../demo/", import.meta.url)),
  maxDependencies: 300,
};

export class ScanApiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanApiConfigError";
  }
}

const positive = (n: unknown): boolean => typeof n === "number" && Number.isFinite(n) && n > 0;

/** Throws ScanApiConfigError naming the first invalid field. */
export function validateScanApiConfig(c: ScanApiConfig): void {
  const fail = (field: string, value: unknown): never => {
    throw new ScanApiConfigError(`invalid config field ${field}: ${String(value)}`);
  };
  if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535) fail("port", c.port);
  if (!positive(c.scanRateLimit?.limit)) fail("scanRateLimit.limit", c.scanRateLimit?.limit);
  if (!positive(c.scanRateLimit?.windowSeconds)) fail("scanRateLimit.windowSeconds", c.scanRateLimit?.windowSeconds);
  if (!positive(c.demoRateLimit?.limit)) fail("demoRateLimit.limit", c.demoRateLimit?.limit);
  if (!positive(c.demoRateLimit?.windowSeconds)) fail("demoRateLimit.windowSeconds", c.demoRateLimit?.windowSeconds);
  if (!positive(c.timeoutSeconds)) fail("timeoutSeconds", c.timeoutSeconds);
  if (typeof c.trustProxy !== "boolean") fail("trustProxy", c.trustProxy);
  if (typeof c.demoDir !== "string" || c.demoDir === "") fail("demoDir", c.demoDir);
  if (!Number.isInteger(c.maxDependencies) || c.maxDependencies <= 0) fail("maxDependencies", c.maxDependencies);
}

/** The only reader of the PORT value. `undefined` and "" give the default. */
export function parsePortEnv(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_PORT;
  if (/^[0-9]{1,5}$/.test(raw)) {
    const n = Number(raw);
    if (n >= 1 && n <= 65535) return n;
  }
  throw new ScanApiConfigError(`invalid PORT: ${JSON.stringify(raw)}`);
}
