import fc from "fast-check";
import type { NamedProperty } from "../../../evidence/test-support/sabotage-runner.js";
import type { ParseRepoTargetOutcome } from "../../repo-target.js";
import type { RepoInput } from "../../types.js";

/** The seam under test for Property 8. */
export type ParseRepoTargetFn = (input: RepoInput) => ParseRepoTargetOutcome;

const OWNER_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-".split("");
const REPO_CHARS = [...OWNER_CHARS, ".", "_"];
const REF_CHARS = [...REPO_CHARS, "/"];

interface Part {
  value: string;
  valid: boolean;
}

const str = (chars: string[], min: number, max: number) => fc.stringOf(fc.constantFrom(...chars), { minLength: min, maxLength: max });
const bad = (value: string): Part => ({ value, valid: false });
const good = (value: string): Part => ({ value, valid: true });

const owner: fc.Arbitrary<Part> = fc.oneof(
  { weight: 8, arbitrary: str(OWNER_CHARS, 1, 39).map(good) },
  { weight: 1, arbitrary: str(OWNER_CHARS, 39, 39).map(good) },
  { weight: 1, arbitrary: fc.constant(bad("")) },
  { weight: 2, arbitrary: str(OWNER_CHARS, 40, 40).map(bad) },
  { weight: 1, arbitrary: str(OWNER_CHARS, 0, 10).map((s) => bad(s + "_" + s)) },
  { weight: 1, arbitrary: str(OWNER_CHARS, 0, 10).map((s) => bad(s + "." + s)) },
  { weight: 1, arbitrary: str(OWNER_CHARS, 0, 10).map((s) => bad(s + "/" + s)) },
  { weight: 1, arbitrary: str(OWNER_CHARS, 0, 10).map((s) => bad(s + "é")) },
);

const repo: fc.Arbitrary<Part> = fc.oneof(
  { weight: 8, arbitrary: str(REPO_CHARS, 1, 100).filter((r) => r !== "." && r !== "..").map(good) },
  { weight: 1, arbitrary: str(REPO_CHARS, 100, 100).filter((r) => r !== "." && r !== "..").map(good) },
  { weight: 1, arbitrary: fc.constantFrom("a", "a.b", "...", ".github", "x_y-z").map(good) },
  { weight: 1, arbitrary: fc.constant(bad("")) },
  { weight: 1, arbitrary: str(REPO_CHARS, 101, 101).map(bad) },
  { weight: 2, arbitrary: fc.constantFrom(".", "..").map(bad) },
  { weight: 1, arbitrary: str(REPO_CHARS, 0, 10).map((s) => bad(s + "/" + s)) },
  { weight: 1, arbitrary: str(REPO_CHARS, 0, 10).map((s) => bad(s + " " + s)) },
);

const ref: fc.Arbitrary<Part | undefined> = fc.oneof(
  { weight: 1, arbitrary: fc.constant(undefined) },
  { weight: 4, arbitrary: str(REF_CHARS, 1, 200).filter((r) => !r.includes("..")).map(good) },
  { weight: 1, arbitrary: str(REF_CHARS, 200, 200).filter((r) => !r.includes("..")).map(good) },
  { weight: 1, arbitrary: fc.constantFrom("main", "v1.2.3", "feature/x", "HEAD", "a.b").map(good) },
  { weight: 1, arbitrary: fc.constant(bad("")) },
  { weight: 4, arbitrary: str(["a", "b", "1"], 201, 201).map(bad) },
  { weight: 2, arbitrary: str(REF_CHARS, 0, 10).map((s) => bad(s + ".." + s)) },
  ...["?", "#", "%", " ", "\t", "é"].map((c) => ({
    weight: 1,
    arbitrary: str(REF_CHARS, 0, 10).map((s) => bad(s + c + s)),
  })),
);

/** Property 8: repo target validation. */
export const property8: NamedProperty<ParseRepoTargetFn> = {
  name: "Property 8: Repo target validation",
  build: (impl) =>
    fc.property(owner, repo, ref, (o, r, f) => {
      const input: RepoInput = f === undefined ? { owner: o.value, repo: r.value } : { owner: o.value, repo: r.value, ref: f.value };
      const out = impl(input);
      const refValid = f === undefined || f.valid;
      if (o.valid && r.valid && refValid) {
        if (!out.ok) throw new Error(`valid target rejected: ${out.error.code}`);
        const expectedRef = f === undefined ? "HEAD" : f.value;
        if (out.target.owner !== o.value || out.target.repo !== r.value || out.target.ref !== expectedRef) {
          throw new Error(`wrong target ${JSON.stringify(out.target)}`);
        }
        return;
      }
      if (out.ok) throw new Error("invalid target accepted");
      const expected = !o.valid || !r.valid ? "invalid_repo" : "invalid_ref";
      if (out.error.code !== expected) throw new Error(`code ${out.error.code}, expected ${expected}`);
    }),
};
