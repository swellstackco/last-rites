import type { RefKind } from "./types.js";

export type ParsedUses =
  | { kind: "action"; owner: string; repo: string; path?: string; ref: string; refKind: RefKind }
  | { kind: "skip"; reason: "docker" | "local" | "no_ref" | "malformed" };

const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const SEGMENT = /^[A-Za-z0-9._-]+$/;
const REF = /^[A-Za-z0-9._/-]{1,255}$/;
const SHA = /^[0-9a-fA-F]{40}$/;

export const isSha = (ref: string): boolean => SHA.test(ref);

const dots = (s: string): boolean => s === "." || s === "..";

/** Pure and total. Order: docker, local, no `@`, then the grammar (Requirement 3.1). */
export function parseUses(text: string): ParsedUses {
  if (typeof text !== "string") return { kind: "skip", reason: "malformed" };
  if (text.startsWith("docker://")) return { kind: "skip", reason: "docker" };
  if (text.startsWith("./") || text.startsWith("../")) return { kind: "skip", reason: "local" };
  const at = text.indexOf("@");
  if (at < 0) return { kind: "skip", reason: "no_ref" };
  if (text.includes("${{")) return { kind: "skip", reason: "malformed" };
  const spec = text.slice(0, at);
  const ref = text.slice(at + 1);
  // A ref with a `.` or `..` segment is not a git ref and would be normalized away by a URL parser.
  if (!REF.test(ref) || ref.split("/").some(dots)) return { kind: "skip", reason: "malformed" };
  const parts = spec.split("/");
  if (parts.length < 2) return { kind: "skip", reason: "malformed" };
  const [owner, repo, ...rest] = parts as [string, string, ...string[]];
  if (!OWNER.test(owner) || !REPO.test(repo) || dots(repo)) return { kind: "skip", reason: "malformed" };
  for (const seg of rest) if (!SEGMENT.test(seg) || dots(seg)) return { kind: "skip", reason: "malformed" };
  const refKind: RefKind = isSha(ref) ? "sha" : "mutable";
  return rest.length > 0
    ? { kind: "action", owner, repo, path: rest.join("/"), ref, refKind }
    : { kind: "action", owner, repo, ref, refKind };
}

export function formatUses(u: { owner: string; repo: string; path?: string; ref: string }): string {
  return `${u.owner}/${u.repo}${u.path !== undefined ? `/${u.path}` : ""}@${u.ref}`;
}
