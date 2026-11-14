export interface DemoRepo {
  /** Matches `/demo/<name>.json` and `^[a-z0-9][a-z0-9-]{0,63}$`. */
  name: string;
  /** `owner/repo` of the scanned repository. */
  repo: string;
  /** One sentence with no counts, so a re-snapshot cannot make it wrong. */
  blurb: string;
}

/** The only list of demos, in display order. */
export const DEMO_REPOS: readonly DemoRepo[] = [
  { name: "parse-server", repo: "parse-community/parse-server", blurb: "A large backend with long-abandoned dependencies." },
  { name: "prettier", repo: "prettier/prettier", blurb: "A famous tool with one dead dependency." },
  { name: "jest", repo: "jestjs/jest", blurb: "Healthy on the surface: ranges only, no lockfile." },
  { name: "pump", repo: "mafintosh/pump", blurb: "A tiny repo. A quiet baseline." },
  { name: "nixpacks-actions", repo: "railwayapp/nixpacks", blurb: "Archived GitHub Actions in a build tool's workflows." },
];
