import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHT_CONFIG, scoreDeath, toGrade } from "../death-score/index.js";
import { proofSlotFor } from "./proof-slot.js";
import { buildProofView } from "./proof-view.js";
import type { ProofState } from "./proof-slot.js";
import type { Grave, GraveRecord } from "./types.js";

const k = <T>(value: T) => ({ kind: "known", value }) as const;
const base = scoreDeath(
  {
    deprecated: k(false),
    repoArchived: k(false),
    monthsSinceLastPublish: k(0),
    monthsSinceLastCommit: k(0),
    maintainerCount: k(5),
    openVulnsNoFix: k(0),
    knownReplacementExists: k(false),
  },
  DEFAULT_WEIGHT_CONFIG,
);

function grave(score: number): Grave<GraveRecord> {
  return { key: "p", index: 0, record: { name: "p", death: { ...base, score, grade: toGrade(score) } } };
}

function assertNever(x: never): never {
  throw new Error(`unexpected ${JSON.stringify(x)}`);
}

function describeState(s: ProofState): string {
  switch (s.status) {
    case "coming_soon":
    case "loading":
    case "report":
      return s.status;
    default:
      return assertNever(s);
  }
}

describe("proofSlotFor", () => {
  it("gives dead and dying a coming_soon slot", () => {
    for (const score of [100, 75, 74, 50]) {
      expect(proofSlotFor(grave(score))).toEqual({ package: "p", state: { status: "coming_soon" } });
    }
  });

  it("gives ailing and alive nothing", () => {
    for (const score of [49, 25, 24, 0]) expect(proofSlotFor(grave(score))).toBeUndefined();
  });

  it("covers all three states exhaustively", () => {
    const view = buildProofView({
      repo: "o/r", package: "p", filesScanned: 1, callSites: [], importSites: [],
      attempts: [{
        attempt: 1, status: "no-call-sites", weak: false, numRuns: 100, runs: 0, seed: 1, shapes: [],
        recommendation: "remove-dependency", sabotage: { applied: 0, caught: 0, survivors: [] },
      }],
    });
    const states: ProofState[] = [{ status: "coming_soon" }, { status: "loading" }, { status: "report", view }];
    expect(states.map(describeState)).toEqual(["coming_soon", "loading", "report"]);
  });

  it("builds the slot package from the record name and leaves the grave untouched", () => {
    const g = grave(80);
    const before = JSON.stringify(g);
    expect(proofSlotFor(g)?.package).toBe("p");
    expect(JSON.stringify(g)).toBe(before);
  });
});
