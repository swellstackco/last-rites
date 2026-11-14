import fc from "fast-check";
import { parseUses, formatUses } from "../../inventory/uses.js";
import type { ParsedUses } from "../../inventory/uses.js";
import {
  commitUrl,
  manifestPageUrl,
  rawManifestUrl,
  releasesLatestUrl,
  releasesPageUrl,
  tagsPageUrl,
  tagsUrl,
} from "../../evidence/urls.js";
import { usesStringArb } from "../arbitraries/uses.js";
import type { NamedProperty } from "../sabotage-runner.js";

export interface ActionParts {
  owner: string;
  repo: string;
  path?: string;
  ref: string;
}

/** The seam under test: the parser and the URL builders for an accepted action. */
export interface UsesImpl {
  parseUses(text: string): ParsedUses;
  urlsFor(a: ActionParts): string[];
}

export function realUrlsFor(a: ActionParts): string[] {
  const name = `${a.owner}/${a.repo}`;
  return [
    releasesLatestUrl(a.owner, a.repo),
    tagsUrl(a.owner, a.repo),
    commitUrl(a.owner, a.repo, a.ref),
    rawManifestUrl(name, a.ref, a.path, "action.yml"),
    rawManifestUrl(name, a.ref, a.path, "action.yaml"),
    manifestPageUrl(name, a.ref, a.path, "action.yml"),
    releasesPageUrl(a.owner, a.repo),
    tagsPageUrl(a.owner, a.repo),
  ];
}

export const realUsesImpl: UsesImpl = { parseUses, urlsFor: realUrlsFor };

// ---- the reference model: character predicates, written without the regexes of the implementation ----

const isAlnum = (c: string): boolean => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9");
const allOf = (s: string, extra: string, first?: (c: string) => boolean): boolean => {
  if (s.length === 0) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (!(isAlnum(c) || extra.includes(c))) return false;
  }
  return first === undefined || first(s.charAt(0));
};

export type Model =
  | { kind: "action"; owner: string; repo: string; path?: string; ref: string }
  | { kind: "docker" | "local" | "no_ref" | "malformed" };

export function modelOf(s: string): Model {
  if (s.startsWith("docker://")) return { kind: "docker" };
  if (s.startsWith("./") || s.startsWith("../")) return { kind: "local" };
  const at = s.indexOf("@");
  if (at === -1) return { kind: "no_ref" };
  if (s.includes("${{")) return { kind: "malformed" };
  const ref = s.slice(at + 1);
  const parts = s.slice(0, at).split("/");
  if (parts.length < 2) return { kind: "malformed" };
  const owner = parts[0]!;
  const repo = parts[1]!;
  const rest = parts.slice(2);
  const ownerOk = owner.length <= 39 && allOf(owner, "-", isAlnum);
  const repoOk = repo.length <= 100 && allOf(repo, "._-") && repo !== "." && repo !== "..";
  const restOk = rest.every((seg) => allOf(seg, "._-") && seg !== "." && seg !== "..");
  // Deviation noted in docs/kiro-log.md: a ref with a `.` or `..` segment is malformed (never a git ref).
  const refOk = ref.length <= 255 && allOf(ref, "._/-") && !ref.split("/").some((seg) => seg === "." || seg === "..");
  if (!(ownerOk && repoOk && restOk && refOk)) return { kind: "malformed" };
  return rest.length > 0 ? { kind: "action", owner, repo, path: rest.join("/"), ref } : { kind: "action", owner, repo, ref };
}

const isHex40 = (ref: string): boolean => ref.length === 40 && [...ref].every((c) => "0123456789abcdefABCDEF".includes(c));

const HOSTS = new Set(["api.github.com", "raw.githubusercontent.com", "github.com"]);
const dotSegment = (seg: string): boolean => seg === "." || seg === "..";
const isQueryFree = (u: string): boolean => !u.includes("?") || u.endsWith("?per_page=1");

/** Returns a problem text, or undefined when the URL is safe. */
export function urlProblem(u: string, a: ActionParts): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return `not a URL: ${u}`;
  }
  if (!HOSTS.has(parsed.host)) return `unexpected host ${parsed.host}`;
  const afterHost = u.slice(u.indexOf(parsed.host) + parsed.host.length);
  const pathPart = afterHost.split("?")[0]!;
  if (parsed.pathname !== pathPart) return `path was normalized: ${pathPart} -> ${parsed.pathname}`;
  if (!isQueryFree(u) || parsed.hash !== "") return `query or fragment smuggled into ${u}`;
  for (const seg of pathPart.split("/").slice(1)) {
    if (dotSegment(seg)) return `dot segment in ${u}`;
    if (/%2e/i.test(seg)) return `encoded dot in ${u}`;
  }
  return undefined;
}

/** Hostile segments handed straight to the builders: they must stay one path segment each. */
const hostileSegmentArb = fc.oneof(
  fc.constantFrom("a?b", "a#b", "a b", "%2e", "a%2fb", "é", "x\ny", "a\\b", "q=1&r=2", "a:b", "@"),
  fc.string({ maxLength: 6 }).filter((x) => x !== "." && x !== ".."),
);

export const usesProperties: NamedProperty<UsesImpl>[] = [
  {
    name: "P2 parseUses is total, classifies exactly like the model and round-trips",
    build: (impl) =>
      fc.property(usesStringArb, (s) => {
        const got = impl.parseUses(s);
        const want = modelOf(s);
        if (want.kind !== "action") {
          if (got.kind !== "skip" || got.reason !== want.kind) {
            throw new Error(`expected skip ${want.kind} for ${JSON.stringify(s)}, got ${JSON.stringify(got)}`);
          }
          return;
        }
        if (got.kind !== "action") throw new Error(`expected an action for ${JSON.stringify(s)}, got ${JSON.stringify(got)}`);
        if (got.owner !== want.owner || got.repo !== want.repo || got.path !== want.path || got.ref !== want.ref) {
          throw new Error(`wrong parts for ${JSON.stringify(s)}: ${JSON.stringify(got)}`);
        }
        if (got.refKind !== (isHex40(want.ref) ? "sha" : "mutable")) throw new Error(`wrong refKind for ${want.ref}`);
        if (formatUses(got) !== s) throw new Error(`format does not round-trip: ${s}`);
      }),
  },
  {
    name: "P2 URLs of an accepted action are safe",
    build: (impl) =>
      fc.property(usesStringArb, (s) => {
        const got = impl.parseUses(s);
        if (got.kind !== "action") return;
        for (const u of impl.urlsFor(got)) {
          const problem = urlProblem(u, got);
          if (problem !== undefined) throw new Error(`${problem} (from ${JSON.stringify(s)})`);
        }
      }),
  },
  {
    name: "P2 builders keep hostile segments inside one path segment",
    build: (impl) =>
      fc.property(hostileSegmentArb, hostileSegmentArb, hostileSegmentArb, hostileSegmentArb, (owner, repo, path, ref) => {
        for (const u of impl.urlsFor({ owner, repo, path, ref })) {
          const problem = urlProblem(u, { owner, repo, path, ref });
          if (problem !== undefined) throw new Error(`${problem} (from ${JSON.stringify([owner, repo, path, ref])})`);
        }
      }),
  },
];
