import fc from "fast-check";
import type { NamedProperty } from "../sabotage-runner.js";
import type { RepoRef } from "../../repo-url.js";

/** The seam under test for Properties 1 and 2. */
export type ParseRepoUrlFn = (field: unknown) => RepoRef | undefined;

const OWNER_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-".split("");
const REPO_CHARS = [...OWNER_CHARS, ".", "_"];

export const validOwner: fc.Arbitrary<string> = fc.oneof(
  fc.stringOf(fc.constantFrom(...OWNER_CHARS), { minLength: 1, maxLength: 39 }),
  fc.stringOf(fc.constantFrom(...OWNER_CHARS), { minLength: 39, maxLength: 39 }),
  fc.constantFrom("a", "-", "0", "Octo-Cat", "facebook"),
);

export const validRepo: fc.Arbitrary<string> = fc
  .oneof(
    fc.stringOf(fc.constantFrom(...REPO_CHARS), { minLength: 1, maxLength: 100 }),
    fc.stringOf(fc.constantFrom(...REPO_CHARS), { minLength: 100, maxLength: 100 }),
    fc.constantFrom("a", "a.b", "x-.", "a_b", ".github", "...", "node.js", "r.gi", "git"),
  )
  .filter((r) => r !== "." && r !== ".." && !r.endsWith(".git"));

/** Scheme + host prefixes for the nine accepted forms (index 8 is the bare `o/r` shorthand). */
const FORM_COUNT = 9;
export function formPrefix(form: number, www: boolean): string {
  const w = www ? "www." : "";
  switch (form) {
    case 0:
      return `https://${w}github.com/`;
    case 1:
      return `http://${w}github.com/`;
    case 2:
      return `git+https://${w}github.com/`;
    case 3:
      return "git://github.com/";
    case 4:
      return "git+ssh://git@github.com/";
    case 5:
      return "ssh://git@github.com/";
    case 6:
      return "git@github.com:";
    case 7:
      return "github:";
    default:
      return "";
  }
}

/** Upper-case the letters selected by the bits of `mask`. */
export function mixCase(s: string, mask: number): string {
  return s
    .split("")
    .map((c, i) => (((mask >> (i % 30)) & 1) === 1 ? c.toUpperCase() : c))
    .join("");
}

export interface P1Case {
  owner: string;
  repo: string;
  input: unknown;
}

const ws = fc.stringOf(fc.constantFrom(" ", "\t", "\n", "\r"), { minLength: 0, maxLength: 3 });

export const p1Case: fc.Arbitrary<P1Case> = fc
  .record({
    owner: validOwner,
    repo: validRepo,
    form: fc.integer({ min: 0, max: FORM_COUNT - 1 }),
    www: fc.boolean(),
    mask: fc.nat({ max: 0x3fffffff }),
    dotGit: fc.boolean(),
    trailingSlash: fc.boolean(),
    fragment: fc.option(fc.stringOf(fc.constantFrom("a", "b", "1", "-", "/", ":"), { maxLength: 8 }), { nil: undefined }),
    query: fc.option(fc.stringOf(fc.constantFrom("a", "b", "1", "=", "&", "/"), { maxLength: 8 }), { nil: undefined }),
    tree: fc.option(fc.constantFrom("/tree/main", "/tree/main/packages/x", "/blob/dev/a/b.ts", "/tree/feat/x/y"), {
      nil: undefined,
    }),
    wsBefore: ws,
    wsAfter: ws,
    wrapper: fc.constantFrom("bare", "object", "objectWithDirectory"),
    directory: fc.constantFrom("packages/x", "src", ""),
  })
  .map((c) => {
    let s = mixCase(formPrefix(c.form, c.www), c.mask) + c.owner + "/" + c.repo;
    if (c.dotGit) s += ".git";
    if (c.tree !== undefined) s += c.tree;
    if (c.trailingSlash) s += "/";
    if (c.query !== undefined) s += `?${c.query}`;
    if (c.fragment !== undefined) s += `#${c.fragment}`;
    s = c.wsBefore + s + c.wsAfter;
    const input: unknown =
      c.wrapper === "bare"
        ? s
        : c.wrapper === "object"
          ? { type: "git", url: s }
          : { type: "git", url: s, directory: c.directory };
    return { owner: c.owner, repo: c.repo, input };
  });

/** Property 1: Every GitHub URL form maps to the same Repo_Ref. */
export const property1: NamedProperty<ParseRepoUrlFn> = {
  name: "Property 1: Every GitHub URL form maps to the same Repo_Ref",
  build: (impl) =>
    fc.property(p1Case, ({ owner, repo, input }) => {
      const got = impl(input);
      if (got === undefined || got.owner !== owner || got.repo !== repo) {
        throw new Error(`expected ${owner}/${repo}, got ${got === undefined ? "undefined" : `${got.owner}/${got.repo}`}`);
      }
      if (Object.keys(got).length !== 2) throw new Error("Repo_Ref must be exactly { owner, repo }");
    }),
};

// ---- Property 2 ----------------------------------------------------------

const aName = fc.stringOf(fc.constantFrom("a", "b", "c", "1"), { minLength: 1, maxLength: 10 });

const otherHosts = fc.constantFrom(
  "gitlab.com",
  "bitbucket.org",
  "example.com",
  "notgithub.com",
  "github.com.evil.example",
  "githubusercontent.com",
  "git.sr.ht",
);

const foreignHostUrl = fc
  .tuple(fc.constantFrom("https://", "http://", "git+https://", "git://", "ssh://git@", "git+ssh://git@"), otherHosts, aName, aName)
  .map(([scheme, host, o, r]) => `${scheme}${host}/${o}/${r}`);

const foreignShorthand = fc
  .tuple(fc.constantFrom("gitlab:", "bitbucket:", "gist:", "foo:", "git@gitlab.com:"), aName, aName)
  .map(([p, o, r]) => `${p}${o}/${r}`);

const badOwner = fc
  .oneof(
    fc
      .tuple(aName, fc.constantFrom("_", ".", " ", "!", "é", "@", "$", "%"), aName)
      .map(([a, c, b]) => a + c + b),
    fc.integer({ min: 40, max: 80 }).map((n) => "a".repeat(n)),
  )
  .chain((o) => fc.tuple(fc.constantFrom("https://github.com/", "github:", "", "git@github.com:"), fc.constant(o), aName))
  .map(([p, o, r]) => `${p}${o}/${r}`);

const badRepo = fc
  .oneof(
    fc
      .tuple(aName, fc.constantFrom("!", " ", "@", "$", "%", "é", "*", ":"), aName)
      .map(([a, c, b]) => a + c + b),
    fc.integer({ min: 101, max: 160 }).map((n) => "a".repeat(n)),
    fc.constantFrom(".", "..", ".git", "...git"),
  )
  .chain((r) => fc.tuple(fc.constantFrom("https://github.com/", "github:", "", "git+ssh://git@github.com/"), aName, fc.constant(r)))
  .map(([p, o, r]) => `${p}${o}/${r}`);

const missingParts = fc.oneof(
  fc.constantFrom(
    "",
    " ",
    "\t\n",
    "https://github.com/",
    "https://github.com",
    "github:",
    "git@github.com:",
    "/",
    "//",
    "/repo",
    "https://github.com//repo",
    "https://github.com/owner",
    "https://github.com/owner/",
    "github:owner",
    "owner",
  ),
  aName,
);

const objectWithoutUrl = fc.oneof(
  fc.constant({}),
  fc.record({ type: fc.constant("git") }),
  fc.record({ url: fc.oneof(fc.integer(), fc.constant(null), fc.array(fc.string()), fc.record({ a: fc.string() })) }),
  fc.record({ directory: fc.string() }),
);

const isStringUrlObject = (v: unknown): boolean =>
  typeof v === "object" && v !== null && typeof (v as { url?: unknown }).url === "string";

const arbitraryNonRepo: fc.Arbitrary<unknown> = fc.oneof(
  fc.anything().filter((v) => typeof v !== "string" && !isStringUrlObject(v)),
  fc.integer(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(fc.string()),
  // Strings without any "/" can never be `owner/repo`.
  fc.string().filter((s) => !s.includes("/")),
);

export const p2Case: fc.Arbitrary<unknown> = fc.oneof(
  foreignHostUrl,
  foreignHostUrl.map((url) => ({ type: "git", url })),
  foreignShorthand,
  badOwner,
  badRepo,
  missingParts,
  objectWithoutUrl,
  arbitraryNonRepo,
);

/** Property 2: Non-GitHub and invalid values map to no Repo_Ref and never throw. */
export const property2: NamedProperty<ParseRepoUrlFn> = {
  name: "Property 2: Non-GitHub and invalid values map to no Repo_Ref and never throw",
  build: (impl) =>
    fc.property(p2Case, (input) => {
      const got = impl(input);
      if (got !== undefined) throw new Error(`expected undefined, got ${got.owner}/${got.repo}`);
    }),
};
