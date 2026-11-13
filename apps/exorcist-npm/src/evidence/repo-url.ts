/**
 * parseRepoUrl (Requirement 3): maps the npm `repository` field to a GitHub
 * Repo_Ref. Pure, never throws, and deliberately does not use the `URL` class
 * (its path normalization would rewrite segments such as `..`).
 */

export interface RepoRef {
  owner: string;
  repo: string;
}

const OWNER_RE = /^[A-Za-z0-9-]{1,39}$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

/** Recognized prefixes (scheme and host are case-insensitive). Order is irrelevant: they are disjoint. */
const PREFIXES: readonly RegExp[] = [
  /^(?:git\+)?https?:\/\/(?:www\.)?github\.com\//i,
  /^git:\/\/github\.com\//i,
  /^git\+ssh:\/\/git@github\.com\//i,
  /^ssh:\/\/git@github\.com\//i,
  /^git@github\.com:/i,
  /^github:/i,
];

function extractString(field: unknown): string | undefined {
  if (typeof field === "string") return field;
  if (typeof field === "object" && field !== null && !Array.isArray(field)) {
    const url = (field as { url?: unknown }).url;
    if (typeof url === "string") return url;
  }
  return undefined;
}

export function parseRepoUrl(field: unknown): RepoRef | undefined {
  try {
    const raw = extractString(field);
    if (raw === undefined) return undefined;

    let s = raw.trim();
    const hash = s.indexOf("#");
    if (hash >= 0) s = s.slice(0, hash);
    const query = s.indexOf("?");
    if (query >= 0) s = s.slice(0, query);

    for (const prefix of PREFIXES) {
      const m = prefix.exec(s);
      if (m) {
        s = s.slice(m[0].length);
        break;
      }
    }

    // Anything else is either bare `owner/repo` or a foreign scheme/host; the
    // owner/repo validation below rejects the latter (`:` and `.` are not owner characters).
    const segments = s.split("/");
    if (segments.length < 2) return undefined;
    const owner = segments[0]!;
    let repo = segments[1]!;
    if (repo.endsWith(".git")) repo = repo.slice(0, -4);

    if (!OWNER_RE.test(owner)) return undefined;
    if (!REPO_RE.test(repo) || repo === "." || repo === "..") return undefined;
    return { owner, repo };
  } catch {
    return undefined;
  }
}
