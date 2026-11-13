import type { Sabotage } from "../../../evidence/test-support/sabotage-runner.js";
import type { ParseRepoTargetFn } from "../properties/scan-p8.js";
import type { RepoInput } from "../../types.js";

interface Opts {
  ownerRe?: RegExp;
  allowDotRepo?: boolean;
  allowDotDotRef?: boolean;
  maxRef?: number;
  refFirst?: boolean;
  refRe?: RegExp;
}

/** A parser with the real rules, with selected rules weakened. */
function make(o: Opts): ParseRepoTargetFn {
  const ownerRe = o.ownerRe ?? /^[A-Za-z0-9-]{1,39}$/;
  const refRe = o.refRe ?? /^[A-Za-z0-9._/-]+$/;
  const maxRef = o.maxRef ?? 200;
  return (input: RepoInput) => {
    const repoOk = (r: string) => /^[A-Za-z0-9._-]{1,100}$/.test(r) && (o.allowDotRepo || (r !== "." && r !== ".."));
    const refOk = (r: string | undefined) =>
      r === undefined || (r.length >= 1 && r.length <= maxRef && refRe.test(r) && (o.allowDotDotRef || !r.includes("..")));
    const repoValid = ownerRe.test(input.owner) && repoOk(input.repo);
    const refValid = refOk(input.ref);
    const repoErr = { ok: false as const, error: { code: "invalid_repo" as const, message: "invalid repo" } };
    const refErr = { ok: false as const, error: { code: "invalid_ref" as const, message: "invalid ref" } };
    if (o.refFirst && !refValid) return refErr;
    if (!repoValid) return repoErr;
    if (!refValid) return refErr;
    return { ok: true, target: { owner: input.owner, repo: input.repo, ref: input.ref ?? "HEAD" } };
  };
}

export const SCAN_P8_SABOTAGES: ReadonlyArray<Sabotage<ParseRepoTargetFn>> = [
  { name: "owner allows underscore", impl: make({ ownerRe: /^[A-Za-z0-9_-]{1,39}$/ }) },
  { name: "repo '..' allowed", impl: make({ allowDotRepo: true }) },
  { name: "ref containing '..' allowed", impl: make({ allowDotDotRef: true }) },
  { name: "ref length limit 201", impl: make({ maxRef: 201 }) },
  { name: "invalid_ref takes precedence over invalid_repo", impl: make({ refFirst: true }) },
  { name: "owner length limit 40", impl: make({ ownerRe: /^[A-Za-z0-9-]{1,40}$/ }) },
  { name: "ref charset allows '?' and '#'", impl: make({ refRe: /^[A-Za-z0-9._/?#-]+$/ }) },
];
