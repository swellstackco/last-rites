import { parseRepoInput } from "../model/repo-input.js";

export type Route =
  | { view: "picker" }
  | { view: "demo"; name: string; pkg?: string }
  | { view: "live"; repo: string; ref?: string; pkg?: string };

const DEMO_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PICKER: Route = { view: "picker" };

function decode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/** Parse the query string into a map. First occurrence of a key wins. Undefined on a bad escape. */
function parseQuery(query: string): Map<string, string> | undefined {
  const out = new Map<string, string>();
  if (query === "") return out;
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? "" : pair.slice(eq + 1);
    const key = decode(rawKey);
    const value = decode(rawValue);
    if (key === undefined || value === undefined) return undefined;
    if (!out.has(key)) out.set(key, value);
  }
  return out;
}

/** Total: any string gives a Route; anything unrecognised gives the picker. */
export function parseRoute(hash: string): Route {
  if (typeof hash !== "string" || !hash.startsWith("#/")) return PICKER;
  const rest = hash.slice(1); // starts with "/"
  const q = rest.indexOf("?");
  const path = q === -1 ? rest : rest.slice(0, q);
  const query = parseQuery(q === -1 ? "" : rest.slice(q + 1));
  if (query === undefined) return PICKER;
  const pkgRaw = query.get("pkg");
  const pkg = pkgRaw === undefined || pkgRaw === "" ? undefined : pkgRaw;

  if (path === "/") return PICKER;

  if (path.startsWith("/demo/")) {
    const name = path.slice("/demo/".length);
    if (!DEMO_NAME_RE.test(name)) return PICKER;
    return pkg === undefined ? { view: "demo", name } : { view: "demo", name, pkg };
  }

  if (path === "/live") {
    const repoText = query.get("repo");
    if (repoText === undefined) return PICKER;
    const refText = query.get("ref");
    const parsed = parseRepoInput(repoText, refText);
    if (!parsed.ok) return PICKER;
    const route: Route = { view: "live", repo: parsed.repo };
    if (parsed.ref !== undefined) route.ref = parsed.ref;
    if (pkg !== undefined) route.pkg = pkg;
    return route;
  }

  return PICKER;
}

function tryEncode(value: string): string | undefined {
  try {
    return encodeURIComponent(value);
  } catch {
    return undefined; // lone surrogate
  }
}

/** Format a Route as a hash. Every value is percent-encoded. Never throws. */
export function formatRoute(route: Route): string {
  switch (route.view) {
    case "picker":
      return "#/";
    case "demo": {
      const pkg = route.pkg ? tryEncode(route.pkg) : undefined;
      return `#/demo/${route.name}${pkg === undefined ? "" : `?pkg=${pkg}`}`;
    }
    case "live": {
      const parts: string[] = [];
      const repo = tryEncode(route.repo);
      if (repo === undefined) return "#/";
      parts.push(`repo=${repo}`);
      const ref = route.ref ? tryEncode(route.ref) : undefined;
      if (ref !== undefined) parts.push(`ref=${ref}`);
      const pkg = route.pkg ? tryEncode(route.pkg) : undefined;
      if (pkg !== undefined) parts.push(`pkg=${pkg}`);
      return `#/live?${parts.join("&")}`;
    }
    default: {
      const never: never = route;
      return never;
    }
  }
}
