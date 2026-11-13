import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHT_CONFIG, scoreDeath, toGrade } from "../death-score/index.js";
import { proofSlotFor } from "./proof-slot.js";
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
    case "no_call_sites":
    case "running":
    case "failed":
    case "verified":
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

  it("covers all five states exhaustively", () => {
    const leg = { target: "old", package: "p", result: "green", numRuns: 200, seed: 1 } as const;
    const states: ProofState[] = [
      { status: "coming_soon" },
      { status: "no_call_sites" },
      { status: "running", step: "old" },
      { status: "failed", leg, counterexample: { seed: 1, shrunk: "[]" } },
      { status: "verified", old: leg, new: { ...leg, target: "new" }, sabotage: { caught: true } },
    ];
    expect(states.map(describeState)).toEqual(["coming_soon", "no_call_sites", "running", "failed", "verified"]);
  });
});
