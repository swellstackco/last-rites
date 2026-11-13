import intersect from "intersect";
import intersectManifest from "intersect/package.json" with { type: "json" };
import deepDiff from "deep-diff";
import deepDiffManifest from "deep-diff/package.json" with { type: "json" };

// Static imports so a bundler can follow them: the app's `loadOracle` uses a dynamic `require`
// that a bundle cannot resolve (design, "Bundling facts").

/** The same contract as the app's `loadOracle`: a pinned oracle and its installed version, else `undefined`. */
export function loadOracle(pkg: string): { module: unknown; version: string } | undefined {
  if (pkg === "intersect") return { module: intersect as unknown, version: intersectManifest.version };
  if (pkg === "deep-diff") return { module: deepDiff as unknown, version: deepDiffManifest.version };
  return undefined;
}
