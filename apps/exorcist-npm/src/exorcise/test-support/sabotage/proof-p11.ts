// Sabotage_List for Property 11 (names, paths and CLI arguments). Each entry is the real implementation with one defect.
import { isProofName, parseProofReportPath, proofReportPath } from "@last-rites/skeleton/proof";
import type { Sabotage } from "../../../evidence/test-support/sabotage-runner.js";
import { parseCliArgs, type CliArgs, type CliParse } from "../../cli-args.js";
import type { NamesCliImpl } from "../../names-cli.p11.test.js";

export const P11_REQUIRED = [
  "name pattern allows upper case",
  "name pattern allows a dot",
  "length limit 65",
  "path built without validating",
  "accept --runs 99",
  "accept --runs 1e3",
  "accept a negative seed",
  "accept an unknown flag",
  "--out directory not validated",
] as const;

const real: NamesCliImpl = { isProofName, proofReportPath, parseProofReportPath, parseCliArgs };

const withName = (test: (s: string) => boolean): NamesCliImpl => ({
  ...real,
  isProofName: (s) => test(s),
  proofReportPath: (repo, pkg) => (test(repo) && test(pkg) ? `demo/proofs/${repo}/${pkg}.json` : undefined),
  parseProofReportPath: (path) => {
    const m = /^demo\/proofs\/([^/]+)\/([^/]+)\.json$/.exec(path);
    return m && test(m[1]!) && test(m[2]!) ? { repo: m[1]!, package: m[2]! } : undefined;
  },
});

/**
 * Run the real parser on argv where the value of `flag` that matches `bad` is replaced by `stand`, then put the
 * original value back into the result with `restore`.
 */
function lenient(
  flag: string,
  bad: (v: string) => boolean,
  stand: string,
  restore: (args: CliArgs, v: string) => void,
): (argv: readonly string[]) => CliParse {
  return (argv) => {
    const at = argv.indexOf(flag);
    const v = at >= 0 ? argv[at + 1] : undefined;
    if (v === undefined || !bad(v)) return parseCliArgs(argv);
    const patched = [...argv];
    patched[at + 1] = stand;
    const out = parseCliArgs(patched);
    if (out.ok) restore(out.args, v);
    return out;
  };
}

const withCli = (parse: (argv: readonly string[]) => CliParse): NamesCliImpl => ({ ...real, parseCliArgs: parse });

const KNOWN = new Set(["--repo", "--package", "--runs", "--seed", "--out", "--label", "--commit", "--candidate", "--fresh"]);

export const P11_SABOTAGES: readonly Sabotage<NamesCliImpl>[] = [
  { name: "name pattern allows upper case", impl: withName((s) => /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/.test(s)) },
  { name: "name pattern allows a dot", impl: withName((s) => /^[a-z0-9][a-z0-9.-]{0,63}$/.test(s)) },
  { name: "length limit 65", impl: withName((s) => /^[a-z0-9][a-z0-9-]{0,64}$/.test(s)) },
  { name: "path built without validating", impl: { ...real, proofReportPath: (repo, pkg) => `demo/proofs/${repo}/${pkg}.json` } },
  {
    name: "accept --runs 99",
    impl: withCli(lenient("--runs", (v) => /^\d+$/.test(v) && Number(v) < 100, "100", (a, v) => void (a.runs = Number(v)))),
  },
  {
    name: "accept --runs 1e3",
    impl: withCli(lenient("--runs", (v) => /^\d+e\d+$/.test(v), "100", (a, v) => void (a.runs = Number(v)))),
  },
  {
    name: "accept a negative seed",
    impl: withCli(lenient("--seed", (v) => /^-\d+$/.test(v), "0", (a, v) => void (a.seed = Number(v)))),
  },
  {
    name: "accept an unknown flag",
    impl: withCli((argv) => parseCliArgs(argv.filter((t) => !t.startsWith("--") || KNOWN.has(t) ? true : false))),
  },
  {
    name: "--out directory not validated",
    impl: withCli(lenient("--out", () => true, "demo/proofs/ok/a.json", (a, v) => void (a.out = v))),
  },
];
