import fc from "fast-check";
import { ensure } from "@last-rites/skeleton/graveyard/testing";
import { parseRepoInput } from "../../model/repo-input.js";

export type ParseRepoInputFn = typeof parseRepoInput;

const OWNER_RE = /^[A-Za-z0-9-]{1,39}$/;
const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;
const REF_RE = /^[A-Za-z0-9._/-]{1,200}$/;

const ownerArb = fc.stringMatching(/^[A-Za-z0-9-]{1,39}$/);
const nameArb = fc.oneof(
  { weight: 3, arbitrary: fc.stringMatching(/^[A-Za-z0-9._-]{1,40}$/) },
  // Names with ".git" inside, such as a GitHub Pages repo: stripping ".git" anywhere would break them.
  { weight: 1, arbitrary: fc.constantFrom("my.github.io", "a.gitb", "x.git.y", "user_name", "_", "a_b.c-d") },
  { weight: 1, arbitrary: fc.tuple(fc.constantFrom("a", "B", "_"), fc.constantFrom("_", ".", "-")).map(([a, b]) => a + b + a) },
)
  // A name ending in ".git" is stripped by design (a spelling of the URL), so it is not a stable pair.
  .filter((n) => n !== "." && n !== ".." && !n.endsWith(".git"));
const refArb = fc.stringMatching(/^[A-Za-z0-9._/-]{1,30}$/).filter((r) => !r.includes(".."));

const prefixArb = fc.constantFrom("", "github.com/", "https://github.com/", "http://github.com/", "HTTPS://github.com/", "Http://github.com/");
const suffixArb = fc.constantFrom("", "/", ".git", ".git/");
const spaceArb = fc.constantFrom("", " ", "\t", "\n ", "  ");

const hostArb = fc.oneof(
  fc.constantFrom("gitlab.com", "www.github.com", "example.org", "github.com.evil.com", "bitbucket.org", "githubcom", "GITHUB.COM", "github.io"),
  fc.stringMatching(/^[a-z]{1,10}\.(com|org|io)$/).filter((h) => h !== "github.com"),
);

/** Inputs that must be rejected with the `repo` field. */
const badRepoTextArb: fc.Arbitrary<string> = fc.oneof(
  fc.tuple(ownerArb, nameArb, fc.stringMatching(/^[A-Za-z0-9._-]{1,8}$/), prefixArb).map(([o, n, x, p]) => `${p}${o}/${n}/${x}`),
  fc.tuple(hostArb, ownerArb, nameArb, fc.constantFrom("", "https://", "http://")).map(([h, o, n, s]) => `${s}${h}/${o}/${n}`),
  fc.tuple(ownerArb, prefixArb).map(([o, p]) => `${p}${o}/..`),
  fc.tuple(ownerArb, prefixArb).map(([o, p]) => `${p}${o}/.`),
  fc.tuple(ownerArb, nameArb, fc.constantFrom("a b", " x", "x y")).map(([o, n, s]) => `${o}/${n}${s}`),
  fc.tuple(ownerArb, nameArb).map(([o, n]) => `${o} /${n}`),
  fc.tuple(ownerArb, nameArb).map(([o, n]) => `${o}/${n.slice(0, 1)} ${n}`),
  fc.integer({ min: 301, max: 400 }).map((n) => `o/${"a".repeat(n - 2)}`),
  fc.constantFrom("", "   ", "/", "owner", "owner/", "/name", "a/b/c", "git@github.com:o/n", "ftp://github.com/o/n"),
  ownerArb.map((o) => `${o}x`.repeat(30) + "/n"),
);

const badRefArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom("a..b", "..", "a b", "a~b", "a:b", "a^b", "a?b", "a*b", "a\\b", "a@{b"),
  fc.integer({ min: 201, max: 260 }).map((n) => "r".repeat(n)),
  fc.tuple(refArb, refArb).map(([a, b]) => `${a}..${b}`),
);

/** Mixed pieces so that some random inputs are accepted and the acceptance contract can be checked. */
const mixedTextArb: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 40 }),
  fc
    .array(fc.constantFrom("github.com/", "https://", "http://", "owner", "name", "/", ".git", " ", "..", "a_b", "x.y", "-", "\n"), { maxLength: 8 })
    .map((a) => a.join("")),
  fc.tuple(prefixArb, ownerArb, nameArb, suffixArb).map(([p, o, n, s]) => `${p}${o}/${n}${s}`),
);

const mixedRefArb: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constantFrom("", " ", "main", "a..b", "v1.0/x", "a b"),
  fc.string({ maxLength: 20 }),
  refArb,
);

/** Property 7: repo input parsing. */
export function build(impl: ParseRepoInputFn = parseRepoInput) {
  return fc.property(
    mixedTextArb,
    mixedRefArb,
    ownerArb,
    nameArb,
    prefixArb,
    suffixArb,
    spaceArb,
    spaceArb,
    badRepoTextArb,
    badRefArb,
    hostArb,
    refArb,
    (text, refText, owner, name, prefix, suffix, left, right, badRepo, badRef, host, goodRef) => {
      // 1. Accepted outputs satisfy the patterns.
      const r = impl(text, refText);
      if (r.ok) {
        ensure(OWNER_RE.test(r.owner), `owner ${JSON.stringify(r.owner)} violates the pattern`);
        ensure(NAME_RE.test(r.name) && r.name !== "." && r.name !== "..", `name ${JSON.stringify(r.name)} violates the pattern`);
        ensure(r.repo === `${r.owner}/${r.name}`, "repo must equal owner/name");
        if (r.ref !== undefined) {
          ensure(REF_RE.test(r.ref) && !r.ref.includes(".."), `ref ${JSON.stringify(r.ref)} violates the pattern`);
        }
      } else {
        ensure(r.field === "repo" || r.field === "ref", "rejection must name a field");
        ensure(r.message.length > 0, "rejection must carry a message");
      }

      // 2. Every valid pair is accepted in every spelling, with case preserved.
      const spelled = `${left}${prefix}${owner}/${name}${suffix}${right}`;
      const ok = impl(spelled);
      ensure(ok.ok, `valid spelling ${JSON.stringify(spelled)} was rejected`);
      if (ok.ok) {
        ensure(ok.owner === owner && ok.name === name && ok.repo === `${owner}/${name}`, `spelling ${JSON.stringify(spelled)} changed the pair: ${ok.repo}`);
        ensure(ok.ref === undefined, "no ref was given");
      }
      const withRef = impl(`${owner}/${name}`, ` ${goodRef} `);
      ensure(withRef.ok && withRef.ref === goodRef, `valid ref ${JSON.stringify(goodRef)} must be accepted unchanged`);
      const emptyRef = impl(`${owner}/${name}`, "  ");
      ensure(emptyRef.ok && emptyRef.ref === undefined, "an empty ref means none");

      // 3. Other hosts are never accepted.
      for (const s of ["", "https://", "http://"]) {
        const h = impl(`${s}${host}/${owner}/${name}`);
        ensure(!h.ok && h.field === "repo", `host ${host} must be rejected (scheme ${JSON.stringify(s)})`);
      }

      // 4. Other bad repo text is rejected with the repo field.
      const bad = impl(badRepo);
      ensure(!bad.ok && bad.field === "repo", `bad repo text ${JSON.stringify(badRepo.slice(0, 60))} must be rejected`);

      // 5. A bad ref is rejected with the ref field.
      const br = impl(`${owner}/${name}`, badRef);
      ensure(!br.ok && br.field === "ref", `bad ref ${JSON.stringify(badRef.slice(0, 40))} must be rejected with field ref`);
    },
  );
}
