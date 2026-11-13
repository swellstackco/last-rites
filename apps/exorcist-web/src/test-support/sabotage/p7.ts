import type { Sabotage } from "@graveyard-kit/skeleton/graveyard/testing";
import { parseRepoInput } from "../../model/repo-input.js";
import type { RepoInputResult } from "../../model/repo-input.js";
import type { ParseRepoInputFn } from "../properties/p7.js";

const real = parseRepoInput;

function mapOk(r: RepoInputResult, f: (o: { owner: string; name: string; ref?: string }) => { owner: string; name: string; ref?: string }): RepoInputResult {
  if (!r.ok) return r;
  const m = f({ owner: r.owner, name: r.name, ...(r.ref !== undefined ? { ref: r.ref } : {}) });
  return { ok: true, repo: `${m.owner}/${m.name}`, owner: m.owner, name: m.name, ...(m.ref !== undefined ? { ref: m.ref } : {}) };
}

const extraSegments: ParseRepoInputFn = (text, ref) => {
  const r = real(text, ref);
  if (r.ok) return r;
  const m = /^(?:https?:\/\/)?(?:github\.com\/)?([^/\s]+)\/([^/\s]+)\/.+$/i.exec(typeof text === "string" ? text.trim() : "");
  return m ? real(`${m[1]}/${m[2]}`, ref) : r;
};

const anyHost: ParseRepoInputFn = (text, ref) => {
  const r = real(text, ref);
  if (r.ok) return r;
  const m = /^(?:https?:\/\/)?[^/\s]+\.[^/\s]+\/([^/\s]+\/[^/\s]+)$/i.exec(typeof text === "string" ? text.trim() : "");
  return m ? real(m[1]!, ref) : r;
};

const dotDotInRef: ParseRepoInputFn = (text, ref) => {
  const r = real(text, ref);
  if (r.ok || r.field !== "ref" || typeof ref !== "string") return r;
  const base = real(text);
  return base.ok ? { ...base, ref: ref.trim() } : r;
};

const underscoreRejected: ParseRepoInputFn = (text, ref) => {
  const r = real(text, ref);
  return r.ok && r.name.includes("_") ? { ok: false, field: "repo", message: "no underscores" } : r;
};

const lowerCased: ParseRepoInputFn = (text, ref) =>
  mapOk(real(text, ref), (o) => ({
    owner: o.owner.toLowerCase(),
    name: o.name.toLowerCase(),
    ...(o.ref !== undefined ? { ref: o.ref.toLowerCase() } : {}),
  }));

const gitStrippedAnywhere: ParseRepoInputFn = (text, ref) =>
  mapOk(real(text, ref), (o) => ({ ...o, name: o.name.replaceAll(".git", "") || o.name }));

export const P7_SABOTAGES: readonly Sabotage<ParseRepoInputFn>[] = [
  { name: "accepts extra path segments", impl: extraSegments },
  { name: "accepts any host", impl: anyHost },
  { name: "accepts .. in a ref", impl: dotDotInRef },
  { name: "rejects an underscore in a repo name", impl: underscoreRejected },
  { name: "lower-cases the result", impl: lowerCased },
  { name: "strips .git anywhere in the name", impl: gitStrippedAnywhere },
];
