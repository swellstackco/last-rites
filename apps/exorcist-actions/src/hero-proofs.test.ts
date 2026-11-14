// Requirement 16.6 and 16.8: the committed hero proof reports, and `--write` on a temporary copy of the
// fixture workflow tree through the real node ReportFs (only for an attempt that is proved and not weak).
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isProofName, parseProofReport, serializeProofReport } from "@graveyard-kit/skeleton/proof";
import type { ProofAttempt } from "@graveyard-kit/skeleton/proof";
import { createNodeReportFs, createNodeSourceFs, parseReport } from "@graveyard-kit/exorcist-npm/programmatic";
import { FakeHttp, createFakeClock, createFakeSleep, loadFixtureCase } from "@graveyard-kit/exorcist-npm/programmatic/testing";
import { fetchManifest, resolveCommit } from "./evidence/sources.js";
import { runExorcise } from "./exorcise/run.js";
import type { ExorciseFix } from "./exorcise/cli-args.js";
import { inventoryText } from "./inventory/inventory.js";
import { actionProofName } from "./proof/names.js";
import { DEMO_PROOFS_DIR, DEMO_SNAPSHOT_PATH, HERO, NIXPACKS_FIXTURES, NIXPACKS_REPO, createSourceContext, tempCache } from "./test-support/harness.js";

const WORKFLOWS = ".github/workflows";
const fileOf = (action: string): string => `${actionProofName(action)}.json`;
const read = (action: string): string => readFileSync(join(DEMO_PROOFS_DIR, fileOf(action)), "utf8");
const lastAttempt = (action: string): ProofAttempt => {
  const parsed = parseProofReport(read(action));
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.report.attempts[parsed.report.attempts.length - 1]!;
};

/** The committed statuses, recorded as they came out of the 2026-11-14 Recorder run (Requirement 16.6). */
const COMMITTED = {
  [HERO.swapAction]: { status: "proved", weak: false },
  [HERO.pinAction]: { status: "proved", weak: false },
} as const;

describe("hero proof reports under demo/proofs/nixpacks-actions", () => {
  it("the folder holds exactly the two hero reports, with Proof_Name folder and file names", () => {
    expect(isProofName("nixpacks-actions")).toBe(true);
    const files = readdirSync(DEMO_PROOFS_DIR).sort();
    expect(files).toEqual([fileOf(HERO.pinAction), fileOf(HERO.swapAction)].sort());
    for (const f of files) expect(isProofName(f.replace(/\.json$/, ""))).toBe(true);
  });

  it.each([HERO.swapAction, HERO.pinAction])("%s: valid, canonical, package equals the file name", (action) => {
    const text = read(action);
    const parsed = parseProofReport(text);
    expect(parsed.ok, parsed.ok ? "" : parsed.error.message).toBe(true);
    if (!parsed.ok) return;
    expect(serializeProofReport(parsed.report)).toBe(text);
    expect(parsed.report.package).toBe(actionProofName(action));
    expect(parsed.report.repo).toBe(HERO.label);
    expect(parsed.report.commit).toBe(HERO.commit);
    expect(parsed.report.callSites.length).toBeGreaterThan(0);
  });

  it.each([HERO.swapAction, HERO.pinAction])("%s: the status equals the committed one", (action) => {
    const a = lastAttempt(action);
    expect({ status: a.status, weak: a.weak }).toEqual(COMMITTED[action]);
  });

  it("the swap shows override and profile as dropped.* coverage, one per use", () => {
    const a = lastAttempt(HERO.swapAction);
    expect(a.shapes[0]!.id).toBe("contract");
    const cov = a.shapes[0]!.coverage;
    expect(cov["uses"]).toBe(6);
    expect(cov["dropped.override"]).toBe(6);
    expect(cov["dropped.profile"]).toBe(6);
  });

  it("the pin covers every actions/checkout use of the fixture tree", () => {
    const a = lastAttempt(HERO.pinAction);
    expect(a.shapes[0]!.id).toBe("pin");
    expect(a.shapes[0]!.coverage["uses"]).toBe(11);
  });
});

/** One `--write` exorcise on a temporary copy of the fixture tree, over the recorded exchanges. */
async function writeOnCopy(action: string, fix: ExorciseFix) {
  const parsedScan = parseReport(readFileSync(DEMO_SNAPSHOT_PATH, "utf8"));
  if (!parsedScan.ok) throw new Error("snapshot does not parse");
  const copy = mkdtempSync(join(tmpdir(), "exorcist-actions-write-"));
  const cache = tempCache();
  try {
    cpSync(NIXPACKS_REPO, copy, { recursive: true });
    const http = new FakeHttp({ fixtures: loadFixtureCase("http", NIXPACKS_FIXTURES) });
    const clock = createFakeClock(parsedScan.report.scannedAt);
    const source = createSourceContext({ http, clock: clock.clock, sleep: createFakeSleep(clock).sleep, env: {}, cacheDir: cache.dir });
    const printed: string[] = [];
    const outcome = await runExorcise(
      { repo: copy, action, fix, write: true, label: HERO.label, commit: HERO.commit, cache: cache.dir, fresh: false },
      {
        fs: createNodeSourceFs(),
        reports: createNodeReportFs(),
        evidence: {
          resolveCommit: (o, r, ref) => resolveCommit(source, o, r, ref),
          fetchManifest: async (name, ref) => {
            const res = await fetchManifest(source, name, ref, undefined);
            return res.ok ? { ok: true, value: res.value.manifest } : res;
          },
        },
        print: (l) => printed.push(l),
      },
    );
    const after = new Map<string, string>();
    for (const f of readdirSync(join(copy, WORKFLOWS))) after.set(f, readFileSync(join(copy, WORKFLOWS, f), "utf8"));
    return { outcome, after, copy, unmatched: http.unmatched };
  } finally {
    rmSync(copy, { recursive: true, force: true });
    cache.dispose();
  }
}

const originals = new Map<string, string>(
  readdirSync(join(NIXPACKS_REPO, WORKFLOWS)).map((f) => [f, readFileSync(join(NIXPACKS_REPO, WORKFLOWS, f), "utf8")]),
);

describe("--write on a temporary copy (real node ReportFs)", () => {
  it.each([
    [HERO.swapAction, "swap"],
    [HERO.pinAction, "pin"],
  ] as const)("%s (%s): writes the proved files only when proved and not weak", async (action, fix) => {
    const committed = lastAttempt(action);
    const { outcome, after, copy, unmatched } = await writeOnCopy(action, fix);
    expect(unmatched).toEqual([]);
    expect(outcome.attempt?.status).toBe(committed.status);
    expect(outcome.attempt?.weak).toBe(committed.weak);

    const lower = action.toLowerCase();
    const holds = (text: string) => inventoryText("f", text).uses.some((u) => `${u.owner}/${u.repo}`.toLowerCase() === lower);
    const touched = [...originals].filter(([, t]) => holds(t)).map(([f]) => f).sort();
    expect(touched.length).toBeGreaterThan(0);

    if (committed.status === "proved" && !committed.weak) {
      expect(outcome.exit).toBe(0);
      expect([...outcome.written].sort()).toEqual(touched.map((f) => join(copy, WORKFLOWS, f)).sort());
      for (const [f, text] of originals) {
        if (!touched.includes(f)) {
          expect(after.get(f), f).toBe(text);
          continue;
        }
        expect(after.get(f), f).not.toBe(text);
        const uses = inventoryText(f, after.get(f)!).uses.filter((u) => `${u.owner}/${u.repo}`.toLowerCase() === lower);
        if (fix === "swap") expect(uses).toEqual([]);
        else expect(uses.every((u) => u.refKind === "sha")).toBe(true);
      }
    } else {
      expect(outcome.written).toEqual([]);
      for (const [f, text] of originals) expect(after.get(f), f).toBe(text);
    }
  });
});
