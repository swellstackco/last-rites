export type RepoInputResult =
  | { ok: true; repo: string; owner: string; name: string; ref?: string }
  | { ok: false; field: "repo" | "ref"; message: string };

// Same rules as the scanner's parseRepoTarget, so accepted input is not bounced as invalid_repo.
const OWNER_RE = /^[A-Za-z0-9-]{1,39}$/;
const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;
const REF_RE = /^[A-Za-z0-9._/-]{1,200}$/;
const MAX_REPO_TEXT = 300;

const REPO_MESSAGE =
  "Enter a public GitHub repository as owner/name, for example parse-community/parse-server. A github.com URL also works.";
const REF_MESSAGE =
  "A branch or tag may use 1 to 200 letters, digits, '.', '_', '-' and '/', and must not contain '..'.";

function badRepo(): RepoInputResult {
  return { ok: false, field: "repo", message: REPO_MESSAGE };
}

/** Parse the Live_Scan_Form text. Pure and total; never throws. */
export function parseRepoInput(repoText: string, refText?: string): RepoInputResult {
  if (typeof repoText !== "string") return badRepo();
  let text = repoText.trim();
  if (text.length < 1 || text.length > MAX_REPO_TEXT) return badRepo();

  const scheme = /^https?:\/\//i.exec(text);
  if (scheme) text = text.slice(scheme[0].length);
  if (text.startsWith("github.com/")) {
    text = text.slice("github.com/".length);
  } else if (scheme) {
    return badRepo();
  }

  if (text.endsWith("/")) text = text.slice(0, -1);
  if (text.endsWith(".git")) text = text.slice(0, -".git".length);

  const parts = text.split("/");
  if (parts.length !== 2) return badRepo();
  const [owner, name] = parts as [string, string];
  if (!OWNER_RE.test(owner)) return badRepo();
  if (!NAME_RE.test(name) || name === "." || name === "..") return badRepo();

  const ref = typeof refText === "string" ? refText.trim() : "";
  if (ref === "") return { ok: true, repo: `${owner}/${name}`, owner, name };
  if (!REF_RE.test(ref) || ref.includes("..")) return { ok: false, field: "ref", message: REF_MESSAGE };
  return { ok: true, repo: `${owner}/${name}`, owner, name, ref };
}
