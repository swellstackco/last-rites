import { deepStrictEqual, ok as assert, strictEqual } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { SIGNAL_NAMES, scoreDeath } from "@graveyard-kit/skeleton";
import type { PackageSignals, SignalName } from "@graveyard-kit/skeleton";
import { configFromEnv, monthsSince, reasonMessage } from "@graveyard-kit/exorcist-npm/programmatic";
import type { HttpClient, Outcome } from "@graveyard-kit/exorcist-npm/programmatic";
import { assembleActionEvidence, MAINTAINER_MESSAGE } from "../../evidence/assemble.js";
import type { ActionEvidenceAssembleInput, EvidenceResult, GithubEvidence } from "../../evidence/assemble.js";
import type { ManifestEvidence, PublishEvidence } from "../../evidence/sources.js";
import { createActionEvidenceStage } from "../../evidence/stage.js";
import type { ActionEvidenceStage } from "../../evidence/stage.js";
import { REPLACEMENTS } from "../../replacements.js";
import type { NamedProperty } from "../sabotage-runner.js";
import { modelSignal } from "./actions-p6.js";

/** The seam under test: the pure assembly, and the stage factory (which decides what is requested). */
export interface EvidenceImpl {
  assemble(input: ActionEvidenceAssembleInput): EvidenceResult;
  makeStage: typeof createActionEvidenceStage;
}

export const realEvidenceImpl: EvidenceImpl = { assemble: assembleActionEvidence, makeStage: createActionEvidenceStage };

type Failure = Extract<Outcome<never>, { ok: false }>["reason"];

const NOW = new Date("2026-01-01T12:00:00.000Z");

const failureArb: fc.Arbitrary<Failure> = fc.record({
  source: fc.constantFrom<Failure["source"][]>("github", "osv", "npm"),
  category: fc.constantFrom<Failure["category"][]>(
    "not_found",
    "timeout",
    "rate_limited",
    "malformed_response",
    "network_error",
    "not_applicable",
    "incomplete",
  ),
});

const outcomeArb = <T>(value: fc.Arbitrary<T>, failRate = 3): fc.Arbitrary<Outcome<T>> =>
  fc.oneof(
    { weight: 10 - failRate, arbitrary: value.map((v): Outcome<T> => ({ ok: true, value: v })) },
    { weight: failRate, arbitrary: failureArb.map((reason): Outcome<T> => ({ ok: false, reason })) },
  );

/** Valid, far past, future, and unparseable timestamps. */
export const timestampArb: fc.Arbitrary<string> = fc.constantFrom(
  "2025-12-31T12:00:00Z",
  "2024-03-15T08:30:00Z",
  "2019-01-01T00:00:00Z",
  "2026-01-01T12:00:00Z",
  "2030-06-01T00:00:00Z",
  "2026-01-02",
  "not a date",
  "",
  "2024-13-45T00:00:00Z",
);

const githubArb: fc.Arbitrary<GithubEvidence> = fc.record({
  repoArchived: outcomeArb(fc.boolean(), 2),
  lastCommit: outcomeArb(timestampArb, 2),
  warnings: fc.constantFrom<string[][]>([], ["GitHub token rejected (HTTP 401); retried without authentication"]),
});

const publishArb: fc.Arbitrary<PublishEvidence> = fc.record({
  timestamp: timestampArb,
  via: fc.constantFrom<PublishEvidence["via"][]>("release", "tag"),
  warnings: fc.constantFrom<string[][]>([], ["w"]),
});

const manifestArb: fc.Arbitrary<ManifestEvidence> = fc.record({
  manifest: fc
    .oneof(
      fc.integer({ min: 0, max: 30 }).map((n) => `node${n}`),
      fc.constantFrom("composite", "docker", "weird"),
      fc.constant(undefined),
    )
    .map((using) => ({ inputs: new Map(), outputs: new Set<string>(), ...(using !== undefined ? { using } : {}) })),
  file: fc.constantFrom<ManifestEvidence["file"][]>("action.yml", "action.yaml"),
});

const NAMES = [
  "actions/checkout",
  "actions-rs/toolchain",
  "Actions-RS/Cargo",
  "actions/create-release",
  "actions/upload-release-asset",
  "o/r",
  "Some-Org/dead.x",
  "dtolnay/rust-toolchain",
];

export const evidenceInputArb: fc.Arbitrary<ActionEvidenceAssembleInput> = fc
  .record({
    name: fc.constantFrom(...NAMES),
    ref: fc.constantFrom("v1", "main", "0123456789abcdef0123456789abcdef01234567"),
    path: fc.constantFrom<(string | undefined)[]>(undefined, "sub", "a/b"),
    site: fc.constantFrom<("step" | "job")[]>("step", "step", "job"),
    github: outcomeArb(githubArb),
    publish: outcomeArb(publishArb),
    manifest: outcomeArb(manifestArb),
    osv: outcomeArb(fc.nat({ max: 20 })),
  })
  .map((r) => ({
    name: r.name,
    ref: r.ref,
    ...(r.path !== undefined ? { path: r.path } : {}),
    site: r.site,
    now: NOW,
    github: r.github,
    publish: r.publish,
    // A Site `job` use has no manifest outcome: no request is made for it.
    ...(r.site === "step" ? { manifest: r.manifest } : {}),
    osv: r.osv,
  }));

// ---- the reference model, written from the requirements and not from the implementation ----

type Expected =
  | { kind: "known"; value: boolean | number; url: string }
  | { kind: "unknown"; source: Failure["source"]; category: Failure["category"]; url: string | undefined; message?: string };

const splitName = (name: string): [string, string] => {
  const i = name.indexOf("/");
  return [name.slice(0, i), name.slice(i + 1)];
};

function monthsOf(timestamp: string, url: string): Expected {
  const m = monthsSince(timestamp, NOW);
  return m === undefined
    ? { kind: "unknown", source: "github", category: "malformed_response", url }
    : { kind: "known", value: m, url };
}

export function expectedSignals(i: ActionEvidenceAssembleInput): Record<SignalName, Expected> {
  const [owner, repo] = splitName(i.name);
  const gh = `https://github.com/${owner}/${repo}`;
  const fromFailure = (f: Failure, url: string | undefined): Expected => ({ kind: "unknown", ...f, url });
  const out = {} as Record<SignalName, Expected>;

  const g = i.github!;
  if (!g.ok) {
    out.repoArchived = fromFailure(g.reason, gh);
    out.monthsSinceLastCommit = fromFailure(g.reason, gh);
  } else {
    out.repoArchived = g.value.repoArchived.ok
      ? { kind: "known", value: g.value.repoArchived.value, url: gh }
      : fromFailure(g.value.repoArchived.reason, gh);
    out.monthsSinceLastCommit = g.value.lastCommit.ok ? monthsOf(g.value.lastCommit.value, gh) : fromFailure(g.value.lastCommit.reason, gh);
  }

  const p = i.publish!;
  out.monthsSinceLastPublish = !p.ok
    ? fromFailure(p.reason, `${gh}/releases`)
    : monthsOf(p.value.timestamp, p.value.via === "tag" ? `${gh}/tags` : `${gh}/releases`);

  if (i.site === "job") {
    out.deprecated = { kind: "unknown", source: "github", category: "not_applicable", url: undefined };
  } else {
    const m = i.manifest!;
    const blob = (file: string): string => `${gh}/blob/${i.ref}/${i.path !== undefined ? `${i.path}/` : ""}${file}`;
    if (!m.ok) out.deprecated = fromFailure(m.reason, blob("action.yml"));
    else {
      const s = modelSignal(m.value.manifest.using);
      const url = blob(m.value.file);
      out.deprecated =
        s === undefined ? { kind: "unknown", source: "github", category: "malformed_response", url } : { kind: "known", value: s, url };
    }
  }

  out.maintainerCount = { kind: "unknown", source: "github", category: "not_applicable", url: undefined, message: MAINTAINER_MESSAGE };

  const o = i.osv!;
  const osvUrl = `https://osv.dev/list?q=${i.name}`;
  out.openVulnsNoFix = o.ok ? { kind: "known", value: o.value, url: osvUrl } : fromFailure(o.reason, osvUrl);

  const entry = REPLACEMENTS.find((r) => r.from.toLowerCase() === i.name.toLowerCase());
  out.knownReplacementExists = entry ? { kind: "known", value: true, url: entry.sourceUrl } : { kind: "known", value: false, url: gh };
  return out;
}

export function expectedReplacement(name: string): unknown {
  const entry = REPLACEMENTS.find((r) => r.from.toLowerCase() === name.toLowerCase());
  if (!entry) return undefined;
  const to = entry.kind === "action" ? entry.to : entry.command;
  return { type: entry.kind, replacement: to, replacements: [to] };
}

function checkAgainstModel(i: ActionEvidenceAssembleInput, r: EvidenceResult): void {
  const exp = expectedSignals(i);
  for (const s of SIGNAL_NAMES) {
    const e = exp[s];
    const got = r.signals[s];
    if (e.kind === "known") {
      deepStrictEqual(got, { kind: "known", value: e.value }, `signal ${s}`);
      strictEqual(r.signals.sourceUrls?.[s], e.url, `url of ${s}`);
      strictEqual(r.unknownReasons[s], undefined, `reason of known ${s}`);
      if (typeof e.value === "number") assert(e.value >= 0, `negative months for ${s}`);
    } else {
      deepStrictEqual(got, { kind: "unknown" }, `signal ${s}`);
      strictEqual(r.signals.sourceUrls?.[s], undefined, `url of unknown ${s}`);
      deepStrictEqual(
        r.unknownReasons[s],
        { source: e.source, category: e.category, message: e.message ?? reasonMessage(e.source, e.category, e.url) },
        `reason of ${s}`,
      );
    }
  }
  deepStrictEqual(Object.keys(r.unknownReasons).sort(), SIGNAL_NAMES.filter((s) => exp[s].kind === "unknown").sort());
  deepStrictEqual(r.replacement, expectedReplacement(i.name));
}

const ALIVE: { [K in SignalName]: PackageSignals[K] } = {
  deprecated: { kind: "known", value: false },
  repoArchived: { kind: "known", value: false },
  monthsSinceLastPublish: { kind: "known", value: 0 },
  monthsSinceLastCommit: { kind: "known", value: 0 },
  maintainerCount: { kind: "known", value: 10 },
  openVulnsNoFix: { kind: "known", value: 0 },
  knownReplacementExists: { kind: "known", value: false },
};

/** A recording client that answers 404 to everything. */
function recordingHttp(urls: string[]): HttpClient {
  return {
    request: async (req) => {
      urls.push(req.url);
      return { status: 404, headers: {}, body: "{}" };
    },
  };
}

export const evidenceProperties: NamedProperty<EvidenceImpl>[] = [
  {
    name: "P7 every signal follows the reference model: failed sources stay unknown, succeeded ones are known",
    build: (impl) => fc.property(evidenceInputArb, (i) => checkAgainstModel(i, impl.assemble(i))),
  },
  {
    name: "P7 the result does not depend on the order of the outcomes",
    build: (impl) =>
      fc.property(evidenceInputArb, fc.infiniteStream(fc.nat()), (i, picks) => {
        const keys = Object.keys(i) as (keyof ActionEvidenceAssembleInput)[];
        const it = picks[Symbol.iterator]();
        const rest = [...keys];
        const shuffled: Partial<ActionEvidenceAssembleInput> = {};
        while (rest.length > 0) {
          const k = rest.splice(it.next().value % rest.length, 1)[0]!;
          (shuffled as Record<string, unknown>)[k] = i[k];
        }
        deepStrictEqual(impl.assemble(shuffled as ActionEvidenceAssembleInput), impl.assemble(i));
      }),
  },
  {
    name: "P7 unknown is never scored lower than the alive value of the same signal",
    build: (impl) =>
      fc.property(evidenceInputArb, (i) => {
        const r = impl.assemble(i);
        const base = scoreDeath(r.signals).score;
        let unknowns = 0;
        for (const s of SIGNAL_NAMES) {
          if (r.signals[s].kind !== "unknown") continue;
          unknowns++;
          const alive = { ...r.signals, [s]: ALIVE[s] } as PackageSignals;
          assert(base >= scoreDeath(alive).score, `${s}: unknown scored below alive`);
        }
        assert(unknowns >= 1, "maintainerCount is always unknown");
      }),
  },
  {
    name: "P7 a Site job use makes no manifest request and a step use makes one",
    build: (impl) =>
      fc.asyncProperty(evidenceInputArb, async (i) => {
        const root = mkdtempSync(join(tmpdir(), "exorcist-actions-p7-"));
        try {
          const urls: string[] = [];
          const config = configFromEnv({}, root);
          const stage: ActionEvidenceStage = impl.makeStage(config, { http: recordingHttp(urls), clock: () => NOW, sleep: async () => {} });
          await stage({ name: i.name, ref: i.ref, ...(i.path !== undefined ? { path: i.path } : {}), site: i.site, now: NOW });
          const raw = urls.filter((u) => new URL(u).hostname === "raw.githubusercontent.com");
          if (i.site === "job") strictEqual(raw.length, 0, `job use requested ${raw.join(", ")}`);
          else assert(raw.length >= 1, "a step use must request its manifest");
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      }),
  },
];
