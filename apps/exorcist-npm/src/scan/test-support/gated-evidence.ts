import type { PackageSignals, SignalName } from "@graveyard-kit/skeleton";
import { SIGNAL_NAMES } from "@graveyard-kit/skeleton";
import { EvidenceInputError } from "../../evidence/index.js";
import type { EvidenceResult, EvidenceStage, ReplacementInfo, UnknownReason } from "../../evidence/index.js";

/** About six signal profiles. Some produce equal death scores so sorting has ties. */
export const PROFILE_COUNT = 6;

const URL_FOR = (name: string, signal: SignalName): string =>
  `https://example.test/${encodeURIComponent(name)}/${signal}`;

type Known = { kind: "known"; value: boolean | number };

/** Per-profile signal values; `undefined` means unknown. Order matches SIGNAL_NAMES. */
const PROFILES: ReadonlyArray<Partial<Record<SignalName, boolean | number>>> = [
  // 0: healthy
  { deprecated: false, repoArchived: false, monthsSinceLastPublish: 1, monthsSinceLastCommit: 1, maintainerCount: 6, openVulnsNoFix: 0, knownReplacementExists: false },
  // 1: healthy but a replacement exists (ties with 0 on nothing, differs slightly)
  { deprecated: false, repoArchived: false, monthsSinceLastPublish: 1, monthsSinceLastCommit: 1, maintainerCount: 6, openVulnsNoFix: 0, knownReplacementExists: true },
  // 2: dead
  { deprecated: true, repoArchived: true, monthsSinceLastPublish: 60, monthsSinceLastCommit: 80, maintainerCount: 0, openVulnsNoFix: 3, knownReplacementExists: true },
  // 3: all unknown
  {},
  // 4: ailing-ish
  { deprecated: false, repoArchived: false, monthsSinceLastPublish: 30, monthsSinceLastCommit: 40, maintainerCount: 1, openVulnsNoFix: 0, knownReplacementExists: false },
  // 5: same shape as 4 (ties on score with 4)
  { deprecated: false, repoArchived: false, monthsSinceLastPublish: 30, monthsSinceLastCommit: 40, maintainerCount: 1, openVulnsNoFix: 0, knownReplacementExists: false },
];

/** A pure EvidenceResult for `name` built from one of the profiles. Satisfies the evidence result invariant. */
export function evidenceFor(profile: number, name: string): EvidenceResult {
  const p = PROFILES[((profile % PROFILE_COUNT) + PROFILE_COUNT) % PROFILE_COUNT] ?? {};
  const signals: Record<string, unknown> = {};
  const sourceUrls: Partial<Record<SignalName, string>> = {};
  const unknownReasons: Partial<Record<SignalName, UnknownReason>> = {};
  for (const s of SIGNAL_NAMES) {
    const v = p[s];
    if (v === undefined) {
      signals[s] = { kind: "unknown" };
      unknownReasons[s] = { source: "npm", category: "not_found", message: `no data for ${s}` };
    } else {
      signals[s] = { kind: "known", value: v } satisfies Known;
      sourceUrls[s] = URL_FOR(name, s);
    }
  }
  const out: EvidenceResult = {
    signals: { ...(signals as unknown as PackageSignals), sourceUrls },
    unknownReasons,
    warnings: profile % PROFILE_COUNT === 3 ? [`no evidence found for ${name}`] : [],
  };
  if (p.knownReplacementExists === true) {
    const replacement: ReplacementInfo = { type: "native", replacement: `native-${name}`, replacements: [`native-${name}`] };
    out.replacement = replacement;
  }
  return out;
}

export type GateFailure = "reject" | "throw" | "input_error";

export interface GatedCall {
  name: string;
  versionRange: string | undefined;
  now: Date | string;
}

export interface GatedEvidence {
  stage: EvidenceStage;
  calls: GatedCall[];
  readonly inFlight: number;
  readonly maxInFlight: number;
  /** Calls started and not yet released. */
  readonly pendingCount: number;
  /** Release the pending call at `index` (modulo-free; caller picks a valid index). */
  release(index: number): void;
}

export interface GatedEvidenceOptions {
  profileOf: (name: string) => number;
  /** Names whose calls fail. "throw" fails synchronously at call time; the others fail on release. */
  failures?: ReadonlyMap<string, GateFailure>;
}

/** An EvidenceStage whose calls stay pending until released. Records calls and concurrency. */
export function createGatedEvidence(opts: GatedEvidenceOptions): GatedEvidence {
  const calls: GatedCall[] = [];
  const pending: Array<() => void> = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const stage: EvidenceStage = (input) => {
    calls.push({ name: input.name, versionRange: input.versionRange, now: input.now });
    const failure = opts.failures?.get(input.name);
    if (failure === "throw") throw new Error(`gated evidence threw for ${input.name}`);
    inFlight++;
    if (inFlight > maxInFlight) maxInFlight = inFlight;
    return new Promise<EvidenceResult>((resolve, reject) => {
      pending.push(() => {
        inFlight--;
        if (failure === "reject") reject(new Error(`gated evidence rejected for ${input.name}`));
        else if (failure === "input_error") reject(new EvidenceInputError(`bad input for ${input.name}`));
        else resolve(evidenceFor(opts.profileOf(input.name), input.name));
      });
    });
  };

  return {
    stage,
    calls,
    get inFlight() {
      return inFlight;
    },
    get maxInFlight() {
      return maxInFlight;
    },
    get pendingCount() {
      return pending.length;
    },
    release(index) {
      const [fn] = pending.splice(index, 1);
      if (!fn) throw new Error(`no pending evidence call at index ${index}`);
      fn();
    },
  };
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * Release pending evidence calls in an order chosen by `picks` (modulo the pending count)
 * until `promise` settles. Uses setImmediate ticks; never waits on a real timer.
 */
export async function driveScan<T>(
  promise: Promise<T>,
  gate: Pick<GatedEvidence, "pendingCount" | "release">,
  picks: readonly number[],
): Promise<T> {
  let done = false;
  let value: T | undefined;
  let error: unknown;
  let failed = false;
  promise.then(
    (v) => {
      done = true;
      value = v;
    },
    (e: unknown) => {
      done = true;
      failed = true;
      error = e;
    },
  );
  let i = 0;
  let idleTicks = 0;
  while (!done) {
    await tick();
    if (gate.pendingCount > 0) {
      idleTicks = 0;
      gate.release((picks[i++ % Math.max(1, picks.length)] ?? 0) % gate.pendingCount);
    } else if (++idleTicks > 10_000) {
      throw new Error("stalled: scan neither settled nor issued an evidence call");
    }
  }
  if (failed) throw error;
  return value as T;
}
