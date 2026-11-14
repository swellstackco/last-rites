// Package_Link: where a dependency name leads. Pure and total; npm packages get no link (the npm page is unchanged).
import type { Ecosystem } from "@last-rites/skeleton/proof";
import { safeHref } from "../dom/h.js";

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;
const MAX_NAME = 200;

/** `https://github.com/<owner>/<repo>` for `owner/repo[/path...]`; undefined for any other shape. */
export function packageHref(ecosystem: Ecosystem | undefined, name: string): Record<"href" | "host", string> | undefined {
  if (ecosystem !== "github-actions" || typeof name !== "string") return undefined;
  if (name === "" || name.length > MAX_NAME || /\s/.test(name) || name.includes("@")) return undefined;
  const [owner, repo, ...rest] = name.split("/");
  if (owner === undefined || repo === undefined) return undefined;
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo) || repo === "." || repo === "..") return undefined;
  if (rest.some((p) => !PATH_SEGMENT.test(p) || p === "." || p === "..")) return undefined;
  const href = safeHref(`https://github.com/${owner}/${repo}`);
  return href === undefined ? undefined : { href, host: "github.com" };
}
