/**
 * Manual scan fixture recorder (task 3.1). NEVER run by `npm test`.
 *
 *   npm run record-scan-fixtures -w @last-rites/exorcist-npm -- <case> <owner/repo> [ref]
 *
 * Records a public MIT repository's `package.json` and `package-lock.json` (pinned to a commit SHA)
 * plus one evidence fixture directory per registry dependency, under `scan/__fixtures__/<case>/`.
 * Unauthenticated: this script never reads GITHUB_TOKEN, sends no Authorization header, and request
 * headers are never written.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ResilientClient } from "../../evidence/http/resilient-client.js";
import {
  createRecorder,
  fetchClient,
  recordPackageCase,
} from "../../evidence/test-support/record-fixtures.js";
import { FIXTURES_ROOT as EVIDENCE_FIXTURES_ROOT } from "../../evidence/test-support/fake-http.js";
import { inventory } from "../inventory.js";

export const SCAN_FIXTURES_ROOT = fileURLToPath(new URL("../__fixtures__", import.meta.url));

const TIMEOUT_MS = 30_000;
const MAX_PACKAGES = 25;
const E18E_FILES = ["e18e-native", "e18e-micro-utilities", "e18e-preferred"] as const;

/** `@scope/pkg` is stored as `@scope__pkg`. */
export function sanitizePackageName(name: string): string {
  return name.replaceAll("/", "__");
}

export interface ScanFixtureMeta {
  owner: string;
  repo: string;
  sha: string;
  license: string;
  lockfileVersion: number;
  recordedAt: string;
  packageCount: number;
  dependencies: string[];
}

function plainClient(): ResilientClient {
  return new ResilientClient(
    fetchClient,
    () => new Date(),
    (ms) => new Promise<void>((r) => setTimeout(r, ms)),
    { maxConcurrency: 1, maxRetries: 3, githubMaxWaitSeconds: 60 },
  );
}

async function getJson(client: ResilientClient, url: string): Promise<unknown> {
  const res = await client.request({ method: "GET", url, timeoutMs: TIMEOUT_MS });
  if (res.status < 200 || res.status > 299) throw new Error(`GET ${url} returned HTTP ${res.status}`);
  return JSON.parse(res.body) as unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Names listed in the shared e18e `mappings` fixtures. */
function loadE18eNames(): Set<string> {
  const names = new Set<string>();
  for (const f of E18E_FILES) {
    const file = join(EVIDENCE_FIXTURES_ROOT, "shared", `${f}.json`);
    if (!existsSync(file)) continue;
    const entry = JSON.parse(readFileSync(file, "utf8")) as { response: { body: string } };
    const mappings = (JSON.parse(entry.response.body) as { mappings?: unknown }).mappings;
    if (isRecord(mappings)) for (const k of Object.keys(mappings)) names.add(k);
  }
  return names;
}

export async function recordScanCase(caseName: string, slug: string, requestedRef?: string): Promise<ScanFixtureMeta> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(caseName)) throw new Error(`invalid case name: ${caseName}`);
  const m = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(slug);
  if (!m) throw new Error(`expected <owner/repo>, got: ${slug}`);
  const [, owner, repo] = m as unknown as [string, string, string];
  const client = plainClient();

  // 1. Public + MIT check (not recorded).
  const info = await getJson(client, `https://api.github.com/repos/${owner}/${repo}`);
  if (!isRecord(info)) throw new Error("unexpected repository response");
  const license = isRecord(info["license"]) ? String(info["license"]["spdx_id"]) : "none";
  if (info["private"] === true) throw new Error(`${slug} is private; refusing`);
  if (license !== "MIT") throw new Error(`${slug} license is ${license}, not MIT; refusing`);

  // 2. Pin the commit.
  const commit = await getJson(
    client,
    `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(requestedRef ?? "HEAD")}`,
  );
  const sha = isRecord(commit) ? commit["sha"] : undefined;
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) throw new Error("could not resolve a 40-character commit SHA");

  // 3. Record the two files at the SHA.
  const rec = createRecorder(SCAN_FIXTURES_ROOT);
  const raw = (file: string): string => `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${file}`;
  await rec.record(`${caseName}/repo`, "package-json", { method: "GET", url: raw("package.json") });
  const lock = await rec.record(`${caseName}/repo`, "package-lock-json", { method: "GET", url: raw("package-lock.json") });

  // 4. Check the lockfile.
  if (!isRecord(lock)) throw new Error("lockfile is not a JSON object");
  const lockfileVersion = lock["lockfileVersion"];
  if (lockfileVersion !== 2 && lockfileVersion !== 3) throw new Error(`lockfileVersion ${String(lockfileVersion)} is not 2 or 3; refusing`);
  const packages = lock["packages"];
  if (!isRecord(packages)) throw new Error("lockfile has no packages map; refusing");
  const packageCount = Object.keys(packages).filter((k) => k !== "").length;
  if (packageCount > MAX_PACKAGES) throw new Error(`lockfile lists ${packageCount} packages (max ${MAX_PACKAGES}); refusing`);

  // 5. Inventory the recorded text with the real function and record each registry dependency.
  const manifestText = readFileSync(join(SCAN_FIXTURES_ROOT, caseName, "repo", "package-json.json"), "utf8");
  const lockText = readFileSync(join(SCAN_FIXTURES_ROOT, caseName, "repo", "package-lock-json.json"), "utf8");
  const manifestEntry = JSON.parse(manifestText) as { response: { body: string } };
  const lockEntry = JSON.parse(lockText) as { response: { body: string } };
  const outcome = inventory(manifestEntry.response.body, lockEntry.response.body);
  if (!outcome.ok) throw new Error(`inventory failed: ${outcome.error.message}`);

  const dependencies: string[] = [];
  const deprecated: string[] = [];
  const e18eListed: string[] = [];
  const e18eNames = loadE18eNames();
  for (const dep of outcome.inventory.dependencies) {
    const dir = `${caseName}/${sanitizePackageName(dep.name)}`;
    await recordPackageCase(rec, dir, dep.name, dep.resolvedVersion);
    dependencies.push(dep.name);
    const npm = JSON.parse(readFileSync(join(SCAN_FIXTURES_ROOT, dir, "npm.json"), "utf8")) as { response: { body: string } };
    const doc = JSON.parse(npm.response.body) as { versions?: Record<string, { deprecated?: unknown }>; "dist-tags"?: { latest?: string } };
    const v = dep.resolvedVersion ?? doc["dist-tags"]?.latest;
    if (v !== undefined && doc.versions?.[v]?.deprecated) deprecated.push(dep.name);
    if (e18eNames.has(dep.name)) e18eListed.push(dep.name);
  }

  // 6. meta.json, plus a warning when nothing interesting is present.
  const meta: ScanFixtureMeta = {
    owner,
    repo,
    sha,
    license,
    lockfileVersion,
    recordedAt: new Date().toISOString(),
    packageCount,
    dependencies,
  };
  mkdirSync(join(SCAN_FIXTURES_ROOT, caseName), { recursive: true });
  writeFileSync(join(SCAN_FIXTURES_ROOT, caseName, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`wrote ${caseName}/meta.json; skipped specifiers: ${outcome.inventory.skipped.length}`);
  console.log(`deprecated direct dependencies: ${deprecated.join(", ") || "none"}; e18e-listed: ${e18eListed.join(", ") || "none"}`);
  if (deprecated.length === 0 && e18eListed.length === 0) {
    console.warn("WARNING: no direct dependency is deprecated or e18e-listed; note this in __fixtures__/README.md");
  }
  return meta;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const [caseName, slug, ref] = args;
  if (!caseName || !slug) {
    console.error("usage: record-scan-fixtures <case> <owner/repo> [ref]");
    process.exit(1);
  }
  await recordScanCase(caseName, slug, ref);
}

// Never run under Vitest (so importing this module from a test is inert).
if (!process.env["VITEST"]) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
