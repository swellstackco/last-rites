/**
 * Manual fixture recorder (Requirement 16.2). NEVER run by `npm test`.
 *
 *   npm run record-fixtures -w @last-rites/exorcist-actions -- --clone <path of the Hero_Repo clone>
 *       live run (the only task with requests); the clone must hold the fixture workflow files byte for byte
 *   npm run record-fixtures -w @last-rites/exorcist-actions -- --regenerate
 *       offline: rewrite the demo files from the committed fixtures
 *
 * The live run puts a recording HttpClient under the real pipeline (scan, swap, pin) and under the
 * manifest and repository lookups of every Replacement. It reads GITHUB_TOKEN only through configFromEnv
 * (sent to api.github.com by the existing client); request headers are never written to a fixture.
 * It never writes into the Hero_Repo clone.
 *
 * Resume: unauthenticated GitHub allows 60 API calls an hour and the hero pipeline needs more. A re-run
 * therefore answers every request that already has a recorded 2xx or 404 exchange from that exchange, and
 * goes to the network only for the missing or failed ones (403, 429, 5xx). The demo files are always
 * written by the last run from the complete, final set of exchanges.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createFetchClient, createGithubGet, parseReport } from "@last-rites/exorcist-npm/programmatic";
import type { HttpClient } from "@last-rites/exorcist-npm/programmatic";
import { FakeHttp, createFakeClock, createFakeSleep, loadFixtureCase } from "@last-rites/exorcist-npm/programmatic/testing";
import type { FixtureEntry } from "@last-rites/exorcist-npm/programmatic/testing";
import { fetchManifest } from "../evidence/sources.js";
import { REPLACEMENTS } from "../replacements.js";
import {
  DEMO_PROOFS_DIR,
  DEMO_SNAPSHOT_PATH,
  NIXPACKS_FIXTURES,
  NIXPACKS_REPO,
  createSourceContext,
  runHero,
} from "./harness.js";
import type { HeroOutput } from "./harness.js";

type Req = Parameters<HttpClient["request"]>[0];

/** Response headers worth keeping in a fixture (the same set as the npm recorder). */
const KEEP_HEADERS = new Set(["content-type", "link", "retry-after", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"]);

/** The repository metadata request of `fetchGithub`, for an Action_Name that is a constant of the map. */
const repoApiUrl = (name: string): string => {
  const [owner, repo] = name.split("/") as [string, string];
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
};

const slug = (s: string): string => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

/** An HttpClient decorator that keeps the last exchange per (method, url, body). Request headers are dropped. */
export function recordingClient(
  inner: HttpClient,
  previous: readonly FixtureEntry[] = [],
): { client: HttpClient; entries: Map<string, FixtureEntry>; live: () => number } {
  const entries = new Map<string, FixtureEntry>();
  const keyOf = (method: string, url: string, body: string | undefined): string => `${method} ${url} ${body ?? ""}`;
  const reusable = new Map<string, FixtureEntry>();
  for (const e of previous) {
    const s = e.response.status;
    if ((s >= 200 && s <= 299) || s === 404) reusable.set(keyOf(e.method, e.url, e.body), e);
  }
  let live = 0;
  const client: HttpClient = {
    async request(req: Req) {
      const key = keyOf(req.method, req.url, req.body);
      const kept = reusable.get(key);
      if (kept !== undefined) {
        entries.set(key, kept);
        return { status: kept.response.status, headers: { ...kept.response.headers }, body: kept.response.body };
      }
      live++;
      const res = await inner.request(req);
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers)) if (KEEP_HEADERS.has(k)) headers[k] = v;
      entries.set(key, {
        method: req.method,
        url: req.url,
        ...(req.body !== undefined ? { body: req.body } : {}),
        response: { status: res.status, headers, body: res.body },
      });
      return res;
    },
  };
  return { client, entries, live: () => live };
}

export function writeEntries(dir: string, entries: Iterable<FixtureEntry>): number {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const e of entries) {
    const hash = createHash("sha256").update(`${e.method} ${e.url} ${e.body ?? ""}`).digest("hex").slice(0, 8);
    const name = `${e.method.toLowerCase()}-${slug(e.url.replace(/^https:\/\//, ""))}-${hash}.json`;
    writeFileSync(join(dir, name), `${JSON.stringify(e, null, 2)}\n`);
    n++;
  }
  return n;
}

function writeDemo(out: HeroOutput): void {
  writeFileSync(DEMO_SNAPSHOT_PATH, out.scan);
  rmSync(DEMO_PROOFS_DIR, { recursive: true, force: true });
  mkdirSync(DEMO_PROOFS_DIR, { recursive: true });
  for (const [file, text] of Object.entries(out.proofs)) writeFileSync(join(DEMO_PROOFS_DIR, file), text);
}

/** Requirement 16.3: manifests and repository metadata of every Replacement `from` and `to`. */
async function recordReplacements(deps: Parameters<typeof createSourceContext>[0]): Promise<void> {
  const ctx = createSourceContext(deps);
  for (const r of REPLACEMENTS) {
    const { get } = createGithubGet(ctx);
    // Repository metadata only (archived / exists): one API call per repository, as the data check needs.
    await get(repoApiUrl(r.from));
    // The old action at the ref the hero repository uses (`v1`); the recorded 404s are part of the evidence.
    await fetchManifest(ctx, r.from, "v1", undefined);
    if (r.kind === "action") {
      await get(repoApiUrl(r.to));
      await fetchManifest(ctx, r.to, r.toRef, undefined);
      // The default-branch spelling too, so the data check can see both when `toRef` has to change.
      for (const ref of ["main", "master"]) await fetchManifest(ctx, r.to, ref, undefined);
    }
  }
}

async function live(clonePath: string): Promise<void> {
  const clone = resolve(process.cwd(), clonePath);
  // The clone must hold the fixture workflow files byte for byte (they were copied from it, Requirement 16.4).
  for (const f of readdirSync(join(NIXPACKS_REPO, ".github/workflows"))) {
    const a = readFileSync(join(NIXPACKS_REPO, ".github/workflows", f), "utf8");
    const b = readFileSync(join(clone, ".github/workflows", f), "utf8");
    if (a !== b) throw new Error(`clone differs from the fixture tree: ${f}`);
  }

  const cacheDir = mkdtempSync(join(tmpdir(), "exorcist-actions-record-"));
  const httpDir = join(NIXPACKS_FIXTURES, "http");
  const { client, entries, live: liveCount } = recordingClient(
    createFetchClient({ userAgent: "exorcist-actions-recorder" }),
    loadFixtureCase("http", NIXPACKS_FIXTURES),
  );
  let requests = 0;
  const counting: HttpClient = { request: (req) => (requests++, client.request(req)) };
  try {
    const deps = {
      http: counting,
      clock: () => new Date(),
      sleep: (ms: number) => new Promise<void>((done) => setTimeout(done, ms)),
      env: process.env,
      cacheDir,
    };
    const out = await runHero({ ...deps, repoDir: clone });
    await recordReplacements(deps);
    const n = writeEntries(httpDir, entries.values());
    writeDemo(out);
    const failed = [...entries.values()].filter((e) => e.response.status === 403 || e.response.status === 429 || e.response.status >= 500);
    console.log(
      `recorded ${n} exchanges (${requests} requests, ${liveCount()} live, token ${process.env["GITHUB_TOKEN"] ? "yes" : "no"})`,
    );
    for (const e of failed) console.log(`  FAILED ${e.response.status} ${e.url} (re-run after the limit resets)`);
    console.log(`exit codes: swap ${out.exits.swap}, pin ${out.exits.pin}`);
    for (const line of out.printed) console.log(`  ${line}`);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

/** Offline: the same pipeline over the committed fixtures, at the committed snapshot's `scannedAt`. */
async function regenerate(): Promise<void> {
  const parsed = parseReport(readFileSync(DEMO_SNAPSHOT_PATH, "utf8"));
  if (!parsed.ok) throw new Error("demo/nixpacks-actions.json is not a valid report");
  const http = new FakeHttp({ fixtures: loadFixtureCase("http", NIXPACKS_FIXTURES) });
  const clock = createFakeClock(parsed.report.scannedAt);
  const cacheDir = mkdtempSync(join(tmpdir(), "exorcist-actions-regen-"));
  try {
    const out = await runHero({ http, clock: clock.clock, sleep: createFakeSleep(clock).sleep, env: {}, cacheDir });
    if (http.unmatched.length > 0) throw new Error(`unmatched requests: ${http.unmatched.map((r) => r.url).join(", ")}`);
    writeDemo(out);
    console.log(`regenerated demo files; exit codes: swap ${out.exits.swap}, pin ${out.exits.pin}`);
    for (const line of out.printed) console.log(`  ${line}`);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

// Never run under Vitest (so importing this module from a test is inert).
if (!process.env["VITEST"] && /(record-fixtures\.[cm]?[jt]s|vite-node)$/.test(process.argv[1] ?? "")) {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const usage = "usage: record-fixtures --clone <path> | --regenerate";
  const run =
    args.length === 1 && args[0] === "--regenerate"
      ? regenerate()
      : args.length === 2 && args[0] === "--clone" && args[1] !== undefined
        ? live(args[1])
        : Promise.reject(new Error(usage));
  run.catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
}
