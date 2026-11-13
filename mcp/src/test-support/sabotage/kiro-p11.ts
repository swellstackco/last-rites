import { REAL_CANDIDATE_MAP, type CandidateMap } from "../validators.js";
import type { Sabotage } from "../sabotage-runner.js";

const R = REAL_CANDIDATE_MAP.candidateTarget;
type Target = ReturnType<CandidateMap["candidateTarget"]>;

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const NAME_ANY_CASE = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

/** A deliberately loose re-implementation; each sabotage switches one rule. */
function loose(opts: {
  allowDotDot?: boolean;
  lastDot?: boolean;
  anyCase?: boolean;
  anyDepth?: boolean;
  ext?: RegExp;
  noMarker?: boolean;
}): (path: string) => Target {
  const { allowDotDot = false, lastDot = false, anyCase = false, anyDepth = false, ext = /\.js$/, noMarker = false } = opts;
  const nameOk = (s: string) => (anyCase ? NAME_ANY_CASE : NAME).test(s);
  return (path) => {
    if (path.includes("\\") || path.includes("\0")) return undefined;
    const segs = path.split("/");
    if (!allowDotDot && segs.includes("..")) return undefined;
    const markerAt = segs.findIndex((s, i) => s === "demo" && segs[i + 1] === "proofs" && segs[i + 2] === "candidates");
    let repo: string | undefined;
    let file: string | undefined;
    if (markerAt >= 0) {
      const rest = segs.slice(markerAt + 3);
      if (!anyDepth && rest.length !== 2) return undefined;
      if (rest.length < 2) return undefined;
      repo = rest[0];
      file = rest[rest.length - 1];
    } else if (noMarker) {
      if (segs.length < 2) return undefined;
      repo = segs[segs.length - 2];
      file = segs[segs.length - 1];
    } else return undefined;
    if (repo === undefined || file === undefined || !ext.test(file)) return undefined;
    const base = file.replace(ext, "");
    const dot = lastDot ? base.lastIndexOf(".") : base.indexOf(".");
    if (dot <= 0) return undefined;
    const pkg = base.slice(0, dot);
    if (!nameOk(repo) || !nameOk(pkg)) return undefined;
    return { repo, package: pkg };
  };
}

export const KIRO_P11_SABOTAGES: Sabotage<CandidateMap>[] = [
  { name: "(a) accept `..`", impl: { candidateTarget: loose({ allowDotDot: true }) } },
  { name: "(b) package is everything before the last dot", impl: { candidateTarget: loose({ lastDot: true }) } },
  { name: "(c) accept upper case names", impl: { candidateTarget: loose({ anyCase: true }) } },
  { name: "(d) accept extra directory depth", impl: { candidateTarget: loose({ anyDepth: true }) } },
  { name: "(e) accept a .ts candidate", impl: { candidateTarget: loose({ ext: /\.(js|ts)$/ }) } },
  { name: "(f) accept a path without the candidates segment", impl: { candidateTarget: (p) => R(p) ?? loose({ noMarker: true })(p) } },
];
