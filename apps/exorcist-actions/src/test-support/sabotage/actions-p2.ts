import type { ParsedUses } from "../../inventory/uses.js";
import { realUrlsFor, type ActionParts, type UsesImpl } from "../properties/actions-p2.js";
import type { Sabotage } from "../sabotage-runner.js";

interface Options {
  dotDotPath: boolean;
  shaLengths: readonly number[];
  lowerOnlySha: boolean;
  dockerMalformed: boolean;
  maxOwner: number;
  dollarInRef: boolean;
}

const CORRECT: Options = {
  dotDotPath: false,
  shaLengths: [40],
  lowerOnlySha: false,
  dockerMalformed: false,
  maxOwner: 39,
  dollarInRef: false,
};

/** A parameterized copy of the parser with one defect switched on at a time. */
function makeParse(overrides: Partial<Options>): (text: string) => ParsedUses {
  const o = { ...CORRECT, ...overrides };
  const isSha = (ref: string): boolean =>
    o.shaLengths.includes(ref.length) && (o.lowerOnlySha ? /^[0-9a-f]+$/ : /^[0-9a-fA-F]+$/).test(ref);
  return (text) => {
    if (text.startsWith("docker://")) return { kind: "skip", reason: o.dockerMalformed ? "malformed" : "docker" };
    if (text.startsWith("./") || text.startsWith("../")) return { kind: "skip", reason: "local" };
    const at = text.indexOf("@");
    if (at < 0) return { kind: "skip", reason: "no_ref" };
    if (!o.dollarInRef && text.includes("${{")) return { kind: "skip", reason: "malformed" };
    const spec = text.slice(0, at);
    const ref = text.slice(at + 1);
    const refRe = o.dollarInRef ? /^[A-Za-z0-9._/${} -]{1,255}$/ : /^[A-Za-z0-9._/-]{1,255}$/;
    if (!refRe.test(ref) || ref.split("/").some((s) => s === "." || s === "..")) return { kind: "skip", reason: "malformed" };
    const parts = spec.split("/");
    if (parts.length < 2) return { kind: "skip", reason: "malformed" };
    const [owner, repo, ...rest] = parts as [string, string, ...string[]];
    const ownerRe = new RegExp(`^[A-Za-z0-9][A-Za-z0-9-]{0,${o.maxOwner - 1}}$`);
    if (!ownerRe.test(owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(repo) || repo === "." || repo === "..") {
      return { kind: "skip", reason: "malformed" };
    }
    for (const seg of rest) {
      if (!/^[A-Za-z0-9._-]+$/.test(seg)) return { kind: "skip", reason: "malformed" };
      if (!o.dotDotPath && (seg === "." || seg === "..")) return { kind: "skip", reason: "malformed" };
    }
    const refKind = isSha(ref) ? "sha" : "mutable";
    return rest.length > 0
      ? { kind: "action", owner, repo, path: rest.join("/"), ref, refKind }
      : { kind: "action", owner, repo, ref, refKind };
  };
}

const withParser = (overrides: Partial<Options>): UsesImpl => ({ parseUses: makeParse(overrides), urlsFor: realUrlsFor });

/** (g): the URLs are built with the segments joined as they are. */
function rawUrlsFor(a: ActionParts): string[] {
  const name = `${a.owner}/${a.repo}`;
  const base = `https://api.github.com/repos/${name}`;
  const p = a.path !== undefined && a.path !== "" ? `${a.path}/` : "";
  return [
    `${base}/releases/latest`,
    `${base}/tags?per_page=1`,
    `${base}/commits/${a.ref}`,
    `https://raw.githubusercontent.com/${name}/${a.ref}/${p}action.yml`,
    `https://raw.githubusercontent.com/${name}/${a.ref}/${p}action.yaml`,
    `https://github.com/${name}/blob/${a.ref}/${p}action.yml`,
    `https://github.com/${name}/releases`,
    `https://github.com/${name}/tags`,
  ];
}

export const sabotages: Sabotage<UsesImpl>[] = [
  { name: "(a) accept `..` in the path", impl: withParser({ dotDotPath: true }) },
  { name: "(b) treat 39 or 41 hexadecimal characters as a sha", impl: withParser({ shaLengths: [39, 40, 41] }) },
  { name: "(c) treat only lower-case hexadecimal as a sha", impl: withParser({ lowerOnlySha: true }) },
  { name: "(d) classify docker:// as malformed", impl: withParser({ dockerMalformed: true }) },
  { name: "(e) accept an owner of 40 characters", impl: withParser({ maxOwner: 40 }) },
  { name: "(f) accept `${{` inside the ref", impl: withParser({ dollarInRef: true }) },
  { name: "(g) build the URL without encoding the path segments", impl: { parseUses: makeParse({}), urlsFor: rawUrlsFor } },
];
