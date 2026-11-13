import fc from "fast-check";
import {
  configWithFloorArb,
  declaredAbandonedArb,
  packageSignalsArb,
} from "../../death-score/arbitraries.js";
import { SIGNAL_NAMES, scoreDeath, toGrade } from "../../death-score/index.js";
import type {
  DeathScoreResult,
  GradeBand,
  PackageSignals,
  SignalName,
  WeightConfig,
} from "../../death-score/index.js";
import type { GraveRecord, UnknownReasonView } from "../types.js";

// ---------------------------------------------------------------------------
// Names: a small collision-prone pool so ties and duplicates are frequent.
// ---------------------------------------------------------------------------

export const NAME_POOL: readonly string[] = [
  "a",
  "A",
  "b",
  "Z",
  "@scope/a",
  "é",
  "a#2",
  "__proto__",
  "constructor",
  " ",
  "left-pad",
  "request",
];

const nameArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 9, arbitrary: fc.constantFrom(...NAME_POOL) },
  { weight: 1, arbitrary: fc.string({ minLength: 1, maxLength: 8 }) },
);

// ---------------------------------------------------------------------------
// Unknown reasons
// ---------------------------------------------------------------------------

const reasonArb: fc.Arbitrary<UnknownReasonView> = fc.record({
  source: fc.constantFrom("npm", "github", "osv", "deps.dev"),
  category: fc.constantFrom("not_found", "rate_limited", "timeout", "invalid_response"),
  message: fc.string({ maxLength: 40 }),
});

/** One optional reason per signal; used only for signals that end up unknown. */
const reasonSlotsArb: fc.Arbitrary<(UnknownReasonView | undefined)[]> = fc.array(
  fc.option(reasonArb, { nil: undefined }),
  { minLength: SIGNAL_NAMES.length, maxLength: SIGNAL_NAMES.length },
);

function withReasons(
  name: string,
  death: DeathScoreResult,
  slots: (UnknownReasonView | undefined)[],
): GraveRecord {
  const unknownReasons: Partial<Record<SignalName, UnknownReasonView>> = {};
  let any = false;
  SIGNAL_NAMES.forEach((signal, i) => {
    const part = death.parts.find((p) => p.signal === signal);
    const reason = slots[i];
    if (part?.status === "unknown" && reason !== undefined) {
      unknownReasons[signal] = reason;
      any = true;
    }
  });
  return any ? { name, death, unknownReasons } : { name, death };
}

// ---------------------------------------------------------------------------
// Records built with the real scoreDeath
// ---------------------------------------------------------------------------

const scoredInputArb: fc.Arbitrary<[PackageSignals, WeightConfig | undefined]> = fc.oneof(
  { weight: 5, arbitrary: fc.tuple(packageSignalsArb, configWithFloorArb) },
  { weight: 3, arbitrary: declaredAbandonedArb },
  {
    weight: 2,
    arbitrary: packageSignalsArb.map((s): [PackageSignals, undefined] => [s, undefined]),
  },
);

/** Records scored by the real engine: parts, calibration and score are consistent. */
export const scoredRecordArb: fc.Arbitrary<GraveRecord> = fc
  .tuple(nameArb, scoredInputArb, reasonSlotsArb)
  .map(([name, [signals, config], slots]) =>
    withReasons(name, config ? scoreDeath(signals, config) : scoreDeath(signals), slots),
  );

/** Scores that sit on grade boundaries, plus the extremes. */
export const BOUNDARY_SCORES: readonly number[] = [0, 1, 24, 25, 49, 50, 74, 75, 99, 100];

/**
 * Synthetic records whose score sits exactly on a grade boundary (or is a
 * small score like 9, so string comparison of scores goes wrong). Parts are
 * empty, so these are used only where the breakdown arithmetic is not asserted.
 */
export const boundaryRecordArb: fc.Arbitrary<GraveRecord> = fc
  .tuple(nameArb, fc.oneof(fc.constantFrom(...BOUNDARY_SCORES), fc.constantFrom(9, 10, 12), fc.integer({ min: 0, max: 100 })))
  .map(([name, score]) => {
    const death: DeathScoreResult = { score, grade: toGrade(score), parts: [] };
    return { name, death };
  });

/** A record for the grouping and ordering properties. */
export const graveRecordArb: fc.Arbitrary<GraveRecord> = fc.oneof(
  { weight: 3, arbitrary: scoredRecordArb },
  { weight: 2, arbitrary: boundaryRecordArb },
);

/** 0..60 records. `size: "max"` makes long lists (over 50) common. */
export const graveRecordsArb: fc.Arbitrary<GraveRecord[]> = fc.array(graveRecordArb, {
  minLength: 0,
  maxLength: 60,
  size: "max",
});

// ---------------------------------------------------------------------------
// Tampered records
// ---------------------------------------------------------------------------

const OTHER_GRADE: Record<GradeBand, GradeBand> = {
  dead: "alive",
  dying: "dead",
  ailing: "dying",
  alive: "ailing",
};

type Tamper = "part" | "score" | "grade" | "calibration";

/** A scored record with exactly one tamper so sums or grades disagree. */
export const tamperedRecordArb: fc.Arbitrary<GraveRecord> = fc
  .tuple(
    scoredRecordArb,
    fc.constantFrom<Tamper>("part", "score", "grade", "calibration"),
    fc.integer({ min: 1, max: 7 }),
    fc.nat({ max: 6 }),
  )
  .map(([record, tamper, delta, partIndex]) => {
    const death = record.death;
    switch (tamper) {
      case "grade":
        return { ...record, death: { ...death, grade: OTHER_GRADE[death.grade] } };
      case "score":
        return { ...record, death: { ...death, score: death.score + delta } };
      case "calibration":
        if (death.calibration !== undefined) {
          return {
            ...record,
            death: {
              ...death,
              calibration: { ...death.calibration, points: death.calibration.points + delta },
            },
          };
        }
      // falls through to tamper a part when there is no calibration
      case "part":
      default: {
        const i = partIndex % death.parts.length;
        const parts = death.parts.map((p, j) => (j === i ? { ...p, points: p.points + delta } : p));
        return { ...record, death: { ...death, parts } };
      }
    }
  });

// ---------------------------------------------------------------------------
// Hostile URLs
// ---------------------------------------------------------------------------

/** Hand-written corpus (Requirement 19.6) plus near misses. */
export const HOSTILE_URL_CORPUS: readonly string[] = [
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "  javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
  "//evil.example/x",
  "/relative/path",
  "relative/path",
  "",
  " https://example.com/",
  "\thttps://example.com/",
  "\nhttps://example.com/",
  "\u0000https://example.com/",
  "https://exa\tmple.com/",
  "https://example.com/a\nb",
  "https://example.com/a b",
  "https://user@example.com/",
  "https://user:pw@example.com/",
  "https://example.com\\@evil.example/",
  "https:\\\\example.com/",
  "https://example.com/<script>",
  'https://example.com/"onmouseover="x',
  "https://example.com/'x",
  "https://example.com/`x",
  "https://",
  "http://",
  "https:///path",
  "https://?q=1",
  "httpx://example.com/",
  "http:/example.com/",
  "http:example.com",
  "httpsjavascript:alert(1)",
  "https://example.com/" + "a".repeat(2100),
  "https://" + "a".repeat(2048),
];

/** Valid URLs, including mixed case and `@` in the path. */
export const GOOD_URL_CORPUS: readonly string[] = [
  "https://registry.npmjs.org/x",
  "HTTP://Example.com/a?b#c",
  "HtTpS://Example.COM",
  "https://github.com/a/b@c",
  "https://example.com/?email=a@b.c",
  "https://example.com:8080/x#frag@x",
  "http://localhost:3000",
];

const caseMixArb = (s: string): fc.Arbitrary<string> =>
  fc.array(fc.boolean(), { minLength: s.length, maxLength: s.length }).map((flags) =>
    s
      .split("")
      .map((c, i) => (flags[i] ? c.toUpperCase() : c.toLowerCase()))
      .join(""),
  );

/** Valid ASCII URLs with a mixed-case scheme. */
export const validUrlArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("http", "https").chain(caseMixArb),
    fc.stringMatching(/^[a-z0-9]([a-z0-9.-]{0,20}[a-z0-9])?$/),
    fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
    fc.stringMatching(/^(\/[A-Za-z0-9._~%@:+-]{0,10}){0,3}$/),
    fc.option(fc.stringMatching(/^[A-Za-z0-9=&@._-]{0,12}$/), { nil: undefined }),
  )
  .map(([scheme, host, port, path, query]) =>
    `${scheme}://${host}${port === undefined ? "" : `:${port}`}${path}${query === undefined ? "" : `?${query}`}`,
  );

export const hostileUrlArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(...HOSTILE_URL_CORPUS) },
  { weight: 2, arbitrary: fc.constantFrom(...GOOD_URL_CORPUS) },
  { weight: 3, arbitrary: validUrlArb },
  { weight: 2, arbitrary: fc.string({ maxLength: 40 }) },
  {
    weight: 2,
    arbitrary: fc
      .tuple(fc.constantFrom("http://", "https://", "HTTPS://", "javascript:", "//", ""), fc.string({ maxLength: 30 }))
      .map(([p, s]) => p + s),
  },
  {
    weight: 1,
    arbitrary: fc
      .tuple(fc.constantFrom(" ", "\t", "\n", "\u0000", "\u007f", "\u0085", "\u2028"), validUrlArb)
      .map(([c, u]) => c + u),
  },
  {
    weight: 2,
    arbitrary: fc
      .tuple(fc.stringMatching(/^[a-z]{1,6}(:[a-z]{1,6})?$/), validUrlArb)
      .map(([userinfo, u]) => u.replace("://", `://${userinfo}@`)),
  },
  { weight: 1, arbitrary: validUrlArb.map((u) => u.replace(/^[a-zA-Z]+:/, "")) },
);

/** Values that are not strings. */
export const nonStringArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.integer(),
  fc.boolean(),
  fc.object(),
  fc.array(fc.string()),
);

/** A scored record with a hostile `sourceUrl` on some of its parts. */
export const urlTamperedRecordArb: fc.Arbitrary<GraveRecord> = fc
  .tuple(
    scoredRecordArb,
    fc.array(fc.option(hostileUrlArb, { nil: undefined }), { minLength: 7, maxLength: 7 }),
  )
  .map(([record, urls]) => {
    const parts = record.death.parts.map((p, i) => {
      const url = urls[i % urls.length];
      return url === undefined ? p : { ...p, sourceUrl: url };
    });
    return { ...record, death: { ...record.death, parts } };
  });
