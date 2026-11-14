// One builder per request of the design. Every argument must already have passed `parseUses`;
// every segment is still percent-encoded (Requirement 3.7).
import { repoPageUrl } from "@last-rites/exorcist-npm/programmatic";

export { repoPageUrl };

// Every segment is percent-encoded. A dot-segment ref never reaches here: `parseUses` rejects it
// (a URL parser normalizes `..` even when written `%2e%2e`).
const enc = encodeURIComponent;

/** Encodes each `/`-separated segment of a path or ref. */
const encPath = (p: string): string => p.split("/").map(enc).join("/");

const repoApi = (owner: string, repo: string): string => `https://api.github.com/repos/${enc(owner)}/${enc(repo)}`;
const repoWeb = (owner: string, repo: string): string => `https://github.com/${enc(owner)}/${enc(repo)}`;

export const releasesLatestUrl = (owner: string, repo: string): string => `${repoApi(owner, repo)}/releases/latest`;
export const tagsUrl = (owner: string, repo: string): string => `${repoApi(owner, repo)}/tags?per_page=1`;
export const commitUrl = (owner: string, repo: string, refOrSha: string): string =>
  `${repoApi(owner, repo)}/commits/${encPath(refOrSha)}`;

export type ManifestFile = "action.yml" | "action.yaml";

const manifestPath = (path: string | undefined, file: ManifestFile): string =>
  `${path !== undefined && path !== "" ? `${encPath(path)}/` : ""}${file}`;

/** `name` is the Action_Name `owner/repo`. */
const splitName = (name: string): [string, string] => {
  const i = name.indexOf("/");
  return i < 0 ? [name, ""] : [name.slice(0, i), name.slice(i + 1)];
};

export const rawManifestUrl = (name: string, ref: string, path: string | undefined, file: ManifestFile): string => {
  const [owner, repo] = splitName(name);
  return `https://raw.githubusercontent.com/${enc(owner)}/${enc(repo)}/${encPath(ref)}/${manifestPath(path, file)}`;
};

export const manifestPageUrl = (name: string, ref: string, path: string | undefined, file: ManifestFile): string => {
  const [owner, repo] = splitName(name);
  return `${repoWeb(owner, repo)}/blob/${encPath(ref)}/${manifestPath(path, file)}`;
};

export const releasesPageUrl = (owner: string, repo: string): string => `${repoWeb(owner, repo)}/releases`;
export const tagsPageUrl = (owner: string, repo: string): string => `${repoWeb(owner, repo)}/tags`;
