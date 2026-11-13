import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Source } from "../types.js";
import type { Clock, HttpClient, HttpRequest, HttpResponse } from "./types.js";

export type TransportCategory = "timeout" | "network_error" | "rate_limited";

export type CacheResult =
  | { ok: true; response: HttpResponse; fromCache: boolean }
  | {
      ok: false;
      failure: { kind: "http"; response: HttpResponse } | { kind: "transport"; category: TransportCategory };
    };

export interface CacheEntry {
  schema: 1;
  /** ISO 8601 from the injected Clock. */
  storedAt: string;
  method: "GET" | "POST";
  url: string;
  response: { status: number; headers: Record<string, string>; body: string };
}

/** sha256 over method, URL and body. Headers are excluded, so a token can never reach a key. */
export function cacheKey(req: Pick<HttpRequest, "method" | "url" | "body">): string {
  return createHash("sha256")
    .update(`${req.method}\n${req.url}\n${req.body ?? ""}`)
    .digest("hex");
}

/** `<rootDir>/.cache/<hash>.json` */
export function cachePath(rootDir: string, req: Pick<HttpRequest, "method" | "url" | "body">): string {
  return join(rootDir, ".cache", `${cacheKey(req)}.json`);
}

function isEntry(v: unknown): v is CacheEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  if (e["schema"] !== 1 || typeof e["storedAt"] !== "string") return false;
  if (Number.isNaN(Date.parse(e["storedAt"]))) return false;
  const r = e["response"] as Record<string, unknown> | null | undefined;
  return (
    typeof r === "object" &&
    r !== null &&
    typeof r["status"] === "number" &&
    typeof r["body"] === "string" &&
    typeof r["headers"] === "object" &&
    r["headers"] !== null
  );
}

function transportCategory(e: unknown): TransportCategory {
  const c = (e as { category?: unknown } | null)?.category;
  return c === "timeout" || c === "rate_limited" ? c : "network_error";
}

let tmpCounter = 0;

export class CacheLayer {
  constructor(
    private readonly rootDir: string,
    private readonly client: HttpClient,
    private readonly clock: Clock,
    private readonly ttlSeconds: Record<Source, number>,
  ) {}

  async get(source: Source, req: HttpRequest): Promise<CacheResult> {
    const path = cachePath(this.rootDir, req);
    const hit = await this.readFresh(path, this.ttlSeconds[source]);
    if (hit) return { ok: true, response: hit.response, fromCache: true };

    let live: HttpResponse;
    try {
      live = await this.client.request(req);
    } catch (e) {
      return { ok: false, failure: { kind: "transport", category: transportCategory(e) } };
    }
    if (live.status < 200 || live.status > 299) {
      return { ok: false, failure: { kind: "http", response: live } };
    }
    const entry: CacheEntry = {
      schema: 1,
      storedAt: this.clock().toISOString(),
      method: req.method,
      url: req.url,
      response: { status: live.status, headers: { ...live.headers }, body: live.body },
    };
    // Return the in-memory normalized copy so a later hit deep-equals this read.
    const response = JSON.parse(JSON.stringify(entry.response)) as HttpResponse;
    await this.write(path, entry);
    return { ok: true, response, fromCache: false };
  }

  private async readFresh(path: string, ttlSeconds: number): Promise<CacheEntry | undefined> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, "utf8"));
    } catch {
      return undefined;
    }
    if (!isEntry(parsed)) return undefined;
    const age = this.clock().getTime() - Date.parse(parsed.storedAt);
    if (age < 0 || age >= ttlSeconds * 1000) return undefined;
    return parsed;
  }

  private async write(path: string, entry: CacheEntry): Promise<void> {
    const tmp = `${path}.${process.pid}.${tmpCounter++}.tmp`;
    try {
      await mkdir(join(this.rootDir, ".cache"), { recursive: true });
      await writeFile(tmp, JSON.stringify(entry), "utf8");
      await rename(tmp, path);
    } catch {
      // A failed write is ignored; the live response is still used.
      await rm(tmp, { force: true }).catch(() => undefined);
    }
  }
}
