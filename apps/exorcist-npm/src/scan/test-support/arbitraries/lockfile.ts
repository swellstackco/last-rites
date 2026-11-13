import fc from "fast-check";
import { manifestArb } from "./manifest.js";
import type { GeneratedManifest } from "./manifest.js";

/** How a direct dependency appears in the generated lockfile. */
export type LockVariant = "usable" | "link" | "mismatchedName" | "invalidSemver" | "missing" | "nested";

export interface GeneratedLockfile {
  manifest: GeneratedManifest;
  /** present: a JSON lockfile with a `packages` map; absent: no lockfile text; unparseable: not JSON. */
  mode: "present" | "absent" | "unparseable";
  /** Written `lockfileVersion`; undefined means the field is missing. */
  lockfileVersion: number | undefined;
  /** The lockfile text, undefined when absent. */
  text: string | undefined;
  /** name -> version of every entry that is usable when the lockfile is accepted (version 2 or 3). */
  usable: Map<string, string>;
  /** Variant chosen per manifest name. */
  variants: Map<string, LockVariant>;
  /** Non-direct packages written to the lockfile (top-level and nested). */
  extras: string[];
}

const VARIANTS: readonly LockVariant[] = ["usable", "link", "mismatchedName", "invalidSemver", "missing", "nested"];

/** A small pool so versions often fail the generated ranges (mismatch warnings are common). */
const GOOD_VERSIONS = ["1.2.3", "2.0.0", "0.0.1", "3.4.5", "1.0.0", "1.9.9"];
const BAD_VERSIONS = ["1.2", "latest", "", "x.y.z", "1.2.3.4"];

function setOwn(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
}

const variantArb = fc.oneof(
  { weight: 5, arbitrary: fc.constant<LockVariant>("usable") },
  ...VARIANTS.filter((v) => v !== "usable").map((v) => ({ weight: 1, arbitrary: fc.constant<LockVariant>(v) })),
);

const lockfileVersionArb: fc.Arbitrary<number | undefined> = fc.oneof(
  { weight: 3, arbitrary: fc.constant<number | undefined>(2) },
  { weight: 3, arbitrary: fc.constant<number | undefined>(3) },
  { weight: 1, arbitrary: fc.constant<number | undefined>(1) },
  { weight: 1, arbitrary: fc.constant<number | undefined>(4) },
  { weight: 1, arbitrary: fc.constant<number | undefined>(undefined) },
);

const modeArb = fc.oneof(
  { weight: 12, arbitrary: fc.constant<GeneratedLockfile["mode"]>("present") },
  { weight: 1, arbitrary: fc.constant<GeneratedLockfile["mode"]>("absent") },
  { weight: 1, arbitrary: fc.constant<GeneratedLockfile["mode"]>("unparseable") },
);

/** A lockfile generated from a manifest: per-name variants, a lockfileVersion, and extra non-direct packages. */
export function lockfileFor(manifest: GeneratedManifest): fc.Arbitrary<GeneratedLockfile> {
  const names = [...manifest.declared.keys()];
  return fc
    .tuple(
      modeArb,
      lockfileVersionArb,
      fc.array(fc.tuple(variantArb, fc.constantFrom(...GOOD_VERSIONS), fc.constantFrom(...BAD_VERSIONS)), {
        minLength: names.length,
        maxLength: names.length,
      }),
      fc.integer({ min: 0, max: 3 }),
    )
    .map(([mode, lockfileVersion, perName, extraCount]) => {
      const usable = new Map<string, string>();
      const variants = new Map<string, LockVariant>();
      const packages: Record<string, unknown> = {};
      setOwn(packages, "", { name: "generated", version: "1.0.0" });
      names.forEach((name, i) => {
        const [variant, good, bad] = perName[i]!;
        variants.set(name, variant);
        const key = `node_modules/${name}`;
        switch (variant) {
          case "usable":
            setOwn(packages, key, { version: good, resolved: `https://registry.example.test/${name}` });
            usable.set(name, good);
            break;
          case "link":
            // A real link entry has no version; this one carries one so honoring `link` is detectable.
            setOwn(packages, key, { link: true, resolved: `../${name}`, version: good });
            break;
          case "mismatchedName":
            setOwn(packages, key, { name: `${name}-other`, version: good });
            break;
          case "invalidSemver":
            setOwn(packages, key, { version: bad });
            break;
          case "missing":
            break;
          case "nested":
            setOwn(packages, `node_modules/host-pkg/node_modules/${name}`, { version: good });
            break;
        }
      });
      const extras: string[] = [];
      for (let i = 0; i < extraCount; i++) {
        const extra = `extra-${i}`;
        extras.push(extra);
        setOwn(packages, `node_modules/${extra}`, { version: "1.0.0" });
        setOwn(packages, `node_modules/${extra}/node_modules/inner-${i}`, { version: "1.0.0" });
      }
      const lock: Record<string, unknown> = { name: "generated", version: "1.0.0" };
      if (lockfileVersion !== undefined) lock["lockfileVersion"] = lockfileVersion;
      lock["packages"] = packages;
      const text =
        mode === "present" ? JSON.stringify(lock, null, 2) : mode === "unparseable" ? '{"lockfileVersion": 3,' : undefined;
      return { manifest, mode, lockfileVersion, text, usable, variants, extras };
    });
}

/** Manifest from the shared arbitrary plus a generated lockfile. */
export const lockfileArb: fc.Arbitrary<GeneratedLockfile> = manifestArb.chain(lockfileFor);

/** True when the generated lockfile is accepted by the scanner (present, version 2 or 3, with packages). */
export function lockfileAccepted(l: GeneratedLockfile): boolean {
  return l.mode === "present" && (l.lockfileVersion === 2 || l.lockfileVersion === 3);
}
