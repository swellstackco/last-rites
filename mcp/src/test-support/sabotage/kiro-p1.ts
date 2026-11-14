import { DEMO_REPOS, parseRepoTarget, REPO_PATTERN } from "@last-rites/exorcist-npm/programmatic";
import { REAL_GUARDS, type Guards } from "../validators.js";
import type { Sabotage } from "../sabotage-runner.js";

const R = REAL_GUARDS;
const DEMOS = DEMO_REPOS.map((d) => d.name);

type Classify = Guards["classifyRepoArgument"];

const githubFrom = (s: string): ReturnType<Classify> => {
  const i = s.indexOf("/");
  return { kind: "github", owner: s.slice(0, i), repo: s.slice(i + 1) };
};

export const KIRO_P1_SABOTAGES: Sabotage<Guards>[] = [
  {
    name: "(a) treat a leading ./ plus owner/name as github",
    impl: {
      ...R,
      classifyRepoArgument: (s) => (typeof s === "string" && s.startsWith("./") && REPO_PATTERN.test(s.slice(2)) ? githubFrom(s.slice(2)) : R.classifyRepoArgument(s)),
    },
  },
  {
    name: "(b) classify demo names before the local prefix",
    impl: {
      ...R,
      classifyRepoArgument: (s) => {
        const bare = typeof s === "string" ? s.replace(/^(\.\.\/|\.\/|\/)/, "") : s;
        return typeof bare === "string" && DEMOS.includes(bare) ? { kind: "demo", name: bare } : R.classifyRepoArgument(s);
      },
    },
  },
  { name: "(c) accept upper case in the Npm_Name", impl: { ...R, isNpmName: (s): s is string => typeof s === "string" && s.length <= 214 && /^(?:@[A-Za-z0-9][A-Za-z0-9._~-]*\/)?[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(s) } },
  { name: "(d) accept runs 99", impl: { ...R, checkRuns: (raw) => (raw === 99 ? { ok: true, runs: 99 } : R.checkRuns(raw)) } },
  {
    name: "(e) skip parseRepoTarget for the owner",
    impl: {
      ...R,
      classifyRepoArgument: (s) => {
        const real = R.classifyRepoArgument(s);
        if (real.kind === "invalid" && typeof s === "string" && REPO_PATTERN.test(s) && !/^\.{1,2}\//.test(s)) {
          const g = githubFrom(s);
          if (g.kind === "github" && parseRepoTarget({ owner: "x", repo: g.repo }).ok) return g;
        }
        return real;
      },
    },
  },
  {
    name: "(f) call the pipeline before the path guard",
    impl: {
      ...R,
      guardedScan: async (probe, cwd, input, call) => {
        const arg = R.classifyRepoArgument(input.repo as string);
        if (arg.kind !== "invalid") await call({ arg, ref: undefined, abs: undefined });
        return R.guardedScan(probe, cwd, input, async () => undefined as never);
      },
    },
  },
  {
    name: "(g) accept a ref with a local path",
    impl: {
      ...R,
      guardedScan: (probe, cwd, input, call) => {
        const arg = R.classifyRepoArgument(input.repo as string);
        return R.guardedScan(probe, cwd, arg.kind === "local" ? { repo: input.repo } : input, call);
      },
    },
  },
];
