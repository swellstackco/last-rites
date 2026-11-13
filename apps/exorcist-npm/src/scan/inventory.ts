import semver from "semver";
import { KIND_PRECEDENCE } from "./types.js";
import type {
  DependencyEntry,
  DependencyKind,
  InventoryOutcome,
  InventoryResult,
  SkipReason,
  SkippedEntry,
} from "./types.js";

const GIT_PREFIXES = ["git:", "git+", "github:", "gitlab:", "bitbucket:", "gist:", "ssh:"];
const SCP_LIKE = /^[\w.-]+@[\w.-]+:/;
const GITHUB_SHORTHAND = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._-]+(#.*)?$/;
const FILE_PREFIXES = ["file:", "./", "../", "~/", "/"];

/** Classify a Declared_Range: a SkipReason for an Unscannable_Specifier, undefined for a Registry_Specifier. */
export function classifySpecifier(spec: string): SkipReason | undefined {
  const s = spec.trim();
  if (s.startsWith("npm:")) return "npm_alias";
  if (GIT_PREFIXES.some((p) => s.startsWith(p)) || SCP_LIKE.test(s) || GITHUB_SHORTHAND.test(s)) return "git";
  if (FILE_PREFIXES.some((p) => s.startsWith(p))) return "file";
  if (s.startsWith("link:")) return "link";
  if (s.startsWith("http:") || s.startsWith("https:")) return "http";
  if (s.startsWith("workspace:")) return "workspace";
  if (s.startsWith("portal:") || s.includes("/")) return "other";
  return undefined;
}

const WORKSPACES_WARNING = "workspaces are not scanned in v1; only the root package.json is inventoried";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

type LockfileStatus = { packages: Record<string, unknown> } | { warning: string };

function lockfileStatus(lockfileText: string | undefined): LockfileStatus {
  if (lockfileText === undefined) {
    return { warning: "no lockfile found; results use declared ranges" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(lockfileText.charCodeAt(0) === 0xfeff ? lockfileText.slice(1) : lockfileText);
  } catch {
    return { warning: "lockfile is not valid JSON" };
  }
  if (!isPlainObject(parsed)) return { warning: "lockfile is not a JSON object" };
  const v = Object.hasOwn(parsed, "lockfileVersion") ? parsed["lockfileVersion"] : undefined;
  if (v !== 2 && v !== 3) {
    const found = v === undefined ? "missing" : (JSON.stringify(v) ?? "missing");
    return { warning: `lockfile version is unsupported: found ${found}` };
  }
  const packages = Object.hasOwn(parsed, "packages") ? parsed["packages"] : undefined;
  if (!isPlainObject(packages)) return { warning: "lockfile has no packages map" };
  return { packages };
}

/** The usable lockfile version of a direct dependency, or undefined. */
function lockedVersion(packages: Record<string, unknown>, name: string): string | undefined {
  const key = "node_modules/" + name;
  if (!Object.hasOwn(packages, key)) return undefined;
  const entry = packages[key];
  if (!isPlainObject(entry)) return undefined;
  if (entry["link"] === true) return undefined;
  if (Object.hasOwn(entry, "name") && entry["name"] !== name) return undefined;
  const version = entry["version"];
  if (typeof version !== "string" || semver.valid(version) === null) return undefined;
  return version;
}

/**
 * The npm adapter's inventory stage. Pure: no I/O, clock or environment. Never throws.
 */
export function inventory(manifestText: string, lockfileText?: string): InventoryOutcome {
  try {
    return inventoryUnsafe(manifestText, lockfileText);
  } catch (e) {
    // Defensive: the stage must never throw. Treated as a malformed manifest.
    return { ok: false, error: { code: "malformed_package_json", message: `unreadable package.json: ${String(e)}` } };
  }
}

function inventoryUnsafe(manifestText: string, lockfileText: string | undefined): InventoryOutcome {
  const text = manifestText.charCodeAt(0) === 0xfeff ? manifestText.slice(1) : manifestText;
  let manifest: unknown;
  try {
    manifest = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: "malformed_package_json", message: "package.json is not valid JSON" } };
  }
  if (!isPlainObject(manifest)) {
    return {
      ok: false,
      error: { code: "invalid_package_json_shape", message: "package.json must be a JSON object" },
    };
  }

  // name -> kind -> range. Maps, so `__proto__` and `constructor` are ordinary keys.
  const names = new Map<string, Map<DependencyKind, string>>();
  for (const kind of KIND_PRECEDENCE) {
    if (!Object.hasOwn(manifest, kind)) continue;
    const field = manifest[kind];
    if (!isPlainObject(field)) {
      return {
        ok: false,
        error: { code: "invalid_package_json_shape", message: `field "${kind}" must be an object` },
      };
    }
    for (const name of Object.keys(field)) {
      const range = field[name];
      if (typeof range !== "string") {
        return {
          ok: false,
          error: {
            code: "invalid_package_json_shape",
            message: `dependency "${name}" in "${kind}" must have a string specifier`,
          },
        };
      }
      let perKind = names.get(name);
      if (!perKind) {
        perKind = new Map();
        names.set(name, perKind);
      }
      perKind.set(kind, range);
    }
  }

  const warnings: string[] = [];
  if (Object.hasOwn(manifest, "workspaces")) warnings.push(WORKSPACES_WARNING);

  const status = lockfileStatus(lockfileText);
  const packages = "packages" in status ? status.packages : undefined;
  if ("warning" in status) warnings.push(status.warning);

  const dependencies: DependencyEntry[] = [];
  const skipped: SkippedEntry[] = [];
  const nameWarnings: string[] = [];

  for (const name of [...names.keys()].sort()) {
    const perKind = names.get(name)!;
    const kinds = KIND_PRECEDENCE.filter((k) => perKind.has(k));
    const usedKind = kinds[0]!;
    const range = perKind.get(usedKind)!;

    const differing = kinds.slice(1).filter((k) => perKind.get(k) !== range);
    if (differing.length > 0) {
      nameWarnings.push(
        `package "${name}" is declared with different ranges; using ${usedKind} "${range}", ignoring ` +
          differing.map((k) => `${k} "${perKind.get(k)!}"`).join(", "),
      );
    }

    const reason = classifySpecifier(range);
    if (reason !== undefined) {
      skipped.push({ name, kind: usedKind, specifier: range, reason });
      continue;
    }

    const locked = packages ? lockedVersion(packages, name) : undefined;
    if (locked !== undefined) {
      dependencies.push({ name, kinds, declaredRange: range, resolvedVersion: locked, versionSource: "lockfile" });
      if (
        semver.validRange(range) !== null &&
        !semver.satisfies(locked, range, { includePrerelease: true })
      ) {
        nameWarnings.push(`lockfile version ${locked} of "${name}" does not satisfy declared range "${range}"`);
      }
    } else {
      dependencies.push({ name, kinds, declaredRange: range, versionSource: "range" });
    }
  }

  dependencies.sort(byName);
  skipped.sort(byName);
  const result: InventoryResult = {
    dependencies,
    skipped,
    warnings: [...warnings, ...nameWarnings],
    lockfile: packages ? "used" : "absent",
  };
  return { ok: true, inventory: result };
}
