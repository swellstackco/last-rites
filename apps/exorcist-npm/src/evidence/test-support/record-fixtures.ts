/**
 * Manual fixture recorder (task 4.1). NEVER run by `npm test`.
 *
 *   npm run record-fixtures -w @graveyard-kit/exorcist-npm -- <case|all>
 *
 * Cases: picocolors, request, left-pad, archived-repo, no-repository, shared.
 *
 * Performs live requests through the real HTTP stack (fetch client wrapped by ResilientClient)
 * and writes each exchange to `__fixtures__/<case>/<name>.json` as a FixtureEntry
 * (layout defined in fake-http.ts). Recording is always unauthenticated: this script never
 * reads GITHUB_TOKEN, sends no Authorization header, and request headers are never written.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseRepoUrl } from "../repo-url.js";
import { ResilientClient } from "../http/resilient-client.js";
import {
  HttpClientError,
  type HttpClient,
  type HttpRequest,
  type HttpResponse,
} from "../http/types.js";
import { FIXTURES_ROOT, type FixtureEntry } from "./fake-http.js";

const TIMEOUT_MS = 30_000;
const OSV_MAX_PAGES = 10;
const E18E_BASE = "https://raw.githubusercontent.com/e18e/module-replacements/main/manifests";
const E18E_MANIFESTS = ["native", "micro-utilities", "preferred"] as const;

/** Response headers worth keeping in a fixture. Everything else (cookies, ids, ...) is dropped. */
const KEEP_HEADERS = new Set([
  "content-type",
  "link",
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
]);

/** Real fetch-based client. Never attaches credentials. */
export const fetchClient: HttpClient = {
  async request(req: HttpRequest): Promise<HttpResponse> {
    try {
      const res = await fetch(req.url, {
        method: req.method,
        headers: {
          accept: "application/json",
          "user-agent": "graveyard-kit-fixture-recorder",
          ...(req.body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(req.body !== undefined ? { body: req.body } : {}),
        signal: AbortSignal.timeout(req.timeoutMs),
      });
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      return { status: res.status, headers, body: await res.text() };
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new HttpClientError(timedOut ? "timeout" : "network_error", e instanceof Error ? e.message : String(e));
    }
  },
};

export interface Recorder {
  /** GET/POST `req`, require a 2xx, and write `<case>/<name>.json`. Returns the parsed JSON body. */
  record(caseName: string, name: string, req: Omit<HttpRequest, "timeoutMs">): Promise<unknown>;
}

export function createRecorder(
  root: string = FIXTURES_ROOT,
  client: HttpClient = new ResilientClient(
    fetchClient,
    () => new Date(),
    (ms) => new Promise<void>((r) => setTimeout(r, ms)),
    { maxConcurrency: 1, maxRetries: 3, githubMaxWaitSeconds: 60 },
  ),
): Recorder {
  return {
    async record(caseName, name, req) {
      const res = await client.request({ ...req, timeoutMs: TIMEOUT_MS });
      if (res.status < 200 || res.status > 299) {
        throw new Error(`${req.method} ${req.url} returned HTTP ${res.status}; refusing to record a failure for ${caseName}/${name}`);
      }
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers)) if (KEEP_HEADERS.has(k)) headers[k] = v;
      const entry: FixtureEntry = {
        method: req.method,
        url: req.url,
        ...(req.body !== undefined ? { body: req.body } : {}),
        response: { status: res.status, headers, body: res.body },
      };
      const file = join(root, caseName, `${name}.json`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify(entry, null, 2)}\n`);
      console.log(`recorded ${caseName}/${name}.json (${res.body.length} bytes) <- ${req.method} ${req.url}`);
      return JSON.parse(res.body) as unknown;
    },
  };
}

export function osvBody(name: string, version: string, pageToken?: string): string {
  return JSON.stringify({
    package: { name, ecosystem: "npm" },
    version,
    ...(pageToken !== undefined ? { page_token: pageToken } : {}),
  });
}

/** Record the npm document, then (when a GitHub repo can be derived) repo + latest commit, then OSV. */
export async function recordPackageCase(
  rec: Recorder,
  caseName: string,
  pkg: string,
  /** When given, replaces `dist-tags.latest` as the version sent to OSV. */
  version?: string,
): Promise<void> {
  const doc = (await rec.record(caseName, "npm", {
    method: "GET",
    url: `https://registry.npmjs.org/${encodeURIComponent(pkg)}`,
  })) as { repository?: unknown; "dist-tags"?: { latest?: string } };

  const ref = parseRepoUrl(doc.repository);
  if (ref) {
    const repo = (await rec.record(caseName, "github-repo", {
      method: "GET",
      url: `https://api.github.com/repos/${ref.owner}/${ref.repo}`,
    })) as { default_branch?: string };
    const branch = repo.default_branch ?? "main";
    await rec.record(caseName, "github-commit", {
      method: "GET",
      url: `https://api.github.com/repos/${ref.owner}/${ref.repo}/commits?per_page=1&sha=${encodeURIComponent(branch)}`,
    });
  }

  const osvVersion = version ?? doc["dist-tags"]?.latest;
  if (!osvVersion) throw new Error(`${pkg} has no dist-tags.latest; cannot query OSV`);
  let token: string | undefined;
  for (let page = 1; page <= OSV_MAX_PAGES; page++) {
    const out = (await rec.record(caseName, page === 1 ? "osv" : `osv-${page}`, {
      method: "POST",
      url: "https://api.osv.dev/v1/query",
      body: osvBody(pkg, osvVersion, token),
    })) as { next_page_token?: string };
    token = out.next_page_token;
    if (!token) break;
  }
}

export async function recordShared(rec: Recorder): Promise<void> {
  for (const m of E18E_MANIFESTS) {
    await rec.record("shared", `e18e-${m}`, { method: "GET", url: `${E18E_BASE}/${m}.json` });
  }
  await rec.record("shared", "depsdev-picocolors", {
    method: "GET",
    url: "https://api.deps.dev/v3/systems/npm/packages/picocolors",
  });
}

export const CASES: Record<string, (rec: Recorder) => Promise<void>> = {
  picocolors: async (rec) => {
    await recordPackageCase(rec, "picocolors", "picocolors");
    await recordShared(rec);
  },
  request: (rec) => recordPackageCase(rec, "request", "request"),
  "left-pad": (rec) => recordPackageCase(rec, "left-pad", "left-pad"),
  "archived-repo": (rec) => recordPackageCase(rec, "archived-repo", "gulp-util"),
  "no-repository": (rec) => recordPackageCase(rec, "no-repository", "demo"),
  shared: recordShared,
};

async function main(): Promise<void> {
  const arg = process.argv.slice(2).filter((a) => a !== "--")[0];
  const names = arg === "all" ? Object.keys(CASES) : arg ? [arg] : [];
  if (names.length === 0 || names.some((n) => !CASES[n])) {
    console.error(`usage: record-fixtures <${[...Object.keys(CASES), "all"].join("|")}>`);
    process.exit(1);
  }
  const rec = createRecorder();
  for (const n of names) await CASES[n]!(rec);
}

// Never run under Vitest (so importing this module from a test is inert).
if (!process.env["VITEST"]) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
