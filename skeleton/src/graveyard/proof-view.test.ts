import { describe, expect, it } from "vitest";
import type { CallSite, ProofAttempt, ProofReport } from "../proof/types.js";
import { buildProofView, MAX_CALL_SITES_SHOWN } from "./proof-view.js";

const site = (n: number, enclosing: "src" | "test" = "src"): CallSite => ({
  file: `src/f${n}.js`,
  line: n,
  column: 1,
  callee: "x",
  member: "",
  argCount: 1,
  argTexts: ["a"],
  enclosing,
});

const attempt = (over: Partial<ProofAttempt> = {}): ProofAttempt => ({
  attempt: 1,
  status: "proved",
  weak: false,
  numRuns: 200,
  runs: 200,
  seed: 20261113,
  shapes: [],
  sabotage: { applied: 6, caught: 6, survivors: [] },
  ...over,
});

const report = (attempts: ProofAttempt[], callSites: CallSite[] = [site(3)]): ProofReport => ({
  repo: "o/r",
  package: "intersect",
  filesScanned: 1,
  callSites,
  importSites: [],
  attempts,
});

describe("buildProofView", () => {
  it("a proved report", () => {
    const v = buildProofView(report([attempt()]));
    expect(v.badge).toBe("proved");
    expect(v.badgeLabel).toBe("Proved");
    expect(v.runsText).toBe("200 runs");
    expect(v.seedText).toBe("seed 20261113");
    expect(v.sabotageLine).toBe("Sabotage: 6 of 6 broken migrations caught");
    expect(v.callSites).toEqual([{ label: "src/f3.js:3", enclosing: "src" }]);
    expect(v.moreCount).toBe(0);
    expect(v.recommendation).toBeUndefined();
  });

  it("a weak report", () => {
    const v = buildProofView(report([attempt({ weak: true, sabotage: { applied: 6, caught: 5, survivors: ["s:m"] } })]));
    expect(v.badge).toBe("weak");
    expect(v.badgeLabel).toBe("Weak");
    expect(v.sabotageLine).toBe("Sabotage: 5 of 6 broken migrations caught");
  });

  it("a counterexample report keeps the strings unchanged", () => {
    const c = {
      shape: "intersect",
      input: ' [["a","a"]] \n',
      shrinks: 3,
      path: "1:0",
      oldOutput: '["a","a"]',
      newOutput: '["a"]<b>',
      oldProjected: "p<",
      newProjected: "&amp;",
    };
    const v = buildProofView(report([attempt({ status: "counterexample", counterexample: c })]));
    expect(v.badgeLabel).toBe("Counterexample");
    expect(v.sabotageLine).toBe("Sabotage: not run");
    const { shrinks: _s, path: _p, ...shown } = c;
    expect(v.attempts[0]!.counterexample).toEqual(shown);
  });

  it("no-call-sites with each recommendation", () => {
    const a = report([attempt({ status: "no-call-sites", recommendation: "remove-dependency" })], []);
    expect(buildProofView(a).badgeLabel).toBe("No call sites");
    expect(buildProofView(a).recommendation).toBe("Remove the dependency: no source file imports or requires it.");
    const b = report([attempt({ status: "no-call-sites", recommendation: "review-imports" })], []);
    expect(buildProofView(b).recommendation).toBe(
      "Review the imports: the package is imported but never called directly.",
    );
  });

  it("an error report", () => {
    const v = buildProofView(report([attempt({ status: "error", error: { code: "no_recipe", message: "m" } })]));
    expect(v.badge).toBe("error");
    expect(v.badgeLabel).toBe("Proof error");
    expect(v.attempts[0]!.errorText).toBe("no_recipe: m");
  });

  it("caps 51 call sites at 50 with moreCount", () => {
    const v = buildProofView(report([attempt()], Array.from({ length: 51 }, (_, i) => site(i + 1))));
    expect(MAX_CALL_SITES_SHOWN).toBe(50);
    expect(v.callSites).toHaveLength(50);
    expect(v.callSiteTotal).toBe(51);
    expect(v.moreCount).toBe(1);
  });

  it("takes the badge from the last attempt and keeps history order", () => {
    const v = buildProofView(report([attempt({ status: "counterexample" }), attempt({ attempt: 2 })]));
    expect(v.badge).toBe("proved");
    expect(v.attempts.map((a) => a.attempt)).toEqual([1, 2]);
    expect(v.attempts.map((a) => a.badge)).toEqual(["counterexample", "proved"]);
  });

  it("a candidate name is carried, a report without attempts is an error", () => {
    expect(buildProofView(report([attempt({ candidate: { name: "c.js", source: "s" } })])).attempts[0]!.candidateName).toBe("c.js");
    expect(buildProofView(report([])).badge).toBe("error");
  });
});
