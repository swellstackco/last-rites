import { EvidenceConfigError, type Source } from "./types.js";

export interface EvidenceConfig {
  /** Directory that holds .cache/. */
  cacheRoot: string;
  /** Seconds; each > 0. */
  ttlSeconds: Record<Source, number>;
  /** Default 10000. */
  requestTimeoutMs: number;
  /** Integer 1..32, default 4. */
  maxConcurrency: number;
  /** Integer 0..10, default 3 (429 only). */
  maxRetries: number;
  /** Default 60. */
  githubMaxWaitSeconds: number;
  /** Empty string is treated as unset. */
  githubToken?: string;
  depsdev: { enabled: boolean };
}

/** Maximum OSV pages followed (Requirement 5.4). */
export const OSV_MAX_PAGES = 10;

export const DEFAULT_TTL_SECONDS: Record<Source, number> = {
  npm: 3600,
  github: 3600,
  osv: 21600,
  e18e: 86400,
  depsdev: 86400,
};

export const DEFAULT_CONFIG: Omit<EvidenceConfig, "cacheRoot" | "githubToken"> = {
  ttlSeconds: DEFAULT_TTL_SECONDS,
  requestTimeoutMs: 10000,
  maxConcurrency: 4,
  maxRetries: 3,
  githubMaxWaitSeconds: 60,
  depsdev: { enabled: false },
};

const SOURCES: readonly Source[] = ["npm", "github", "osv", "e18e", "depsdev"];

function isIntInRange(v: unknown, min: number, max: number): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

/** Throws EvidenceConfigError naming the invalid field and value. Never touches I/O. */
export function validateConfig(config: EvidenceConfig): void {
  const bad = (field: string, value: unknown, rule: string): never => {
    throw new EvidenceConfigError(`invalid config ${field}=${String(value)}: ${rule}`);
  };
  if (typeof config.cacheRoot !== "string" || config.cacheRoot === "") {
    bad("cacheRoot", config.cacheRoot, "must be a non-empty string");
  }
  if (!isIntInRange(config.maxConcurrency, 1, 32)) {
    bad("maxConcurrency", config.maxConcurrency, "must be an integer from 1 to 32");
  }
  if (!isIntInRange(config.maxRetries, 0, 10)) {
    bad("maxRetries", config.maxRetries, "must be an integer from 0 to 10");
  }
  for (const s of SOURCES) {
    const ttl = config.ttlSeconds?.[s];
    if (typeof ttl !== "number" || !Number.isFinite(ttl) || ttl <= 0) {
      bad(`ttlSeconds.${s}`, ttl, "must be a number greater than 0");
    }
  }
  const t = config.requestTimeoutMs;
  if (typeof t !== "number" || !Number.isFinite(t) || t <= 0) {
    bad("requestTimeoutMs", t, "must be a number greater than 0");
  }
  const w = config.githubMaxWaitSeconds;
  if (typeof w !== "number" || !Number.isFinite(w) || w < 0) {
    bad("githubMaxWaitSeconds", w, "must be a number >= 0");
  }
}

/** The only place that reads the environment. An empty GITHUB_TOKEN is treated as unset. */
export function configFromEnv(
  env: Record<string, string | undefined>,
  cacheRoot: string,
): EvidenceConfig {
  const token = env["GITHUB_TOKEN"];
  const config: EvidenceConfig = { ...DEFAULT_CONFIG, ttlSeconds: { ...DEFAULT_TTL_SECONDS }, cacheRoot };
  if (token !== undefined && token !== "") config.githubToken = token;
  return config;
}
