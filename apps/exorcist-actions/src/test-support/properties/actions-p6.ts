import { deepStrictEqual, strictEqual } from "node:assert";
import fc from "fast-check";
import { parseActionManifest, runtimeSignal } from "../../evidence/manifest.js";
import type { ManifestParse } from "../../evidence/manifest.js";
import { manifestArb, nonMappingArb, usingValueArb } from "../arbitraries/manifest.js";
import type { NamedProperty } from "../sabotage-runner.js";

/** The seam under test. */
export interface ManifestImpl {
  parseActionManifest(text: string): ManifestParse;
  runtimeSignal(using: string | undefined): boolean | undefined;
}

export const realManifestImpl: ManifestImpl = { parseActionManifest, runtimeSignal };

/** The reference for the Runtime_Rule, written without the regex of the implementation. */
export function modelSignal(using: string | undefined): boolean | undefined {
  if (using === undefined) return undefined;
  if (using === "composite" || using === "docker") return false;
  if (!using.startsWith("node")) return undefined;
  const digits = using.slice(4);
  if (digits === "" || !/^[0-9]+$/.test(digits)) return undefined;
  if (digits.length > 1 && digits.startsWith("0")) return undefined;
  const n = Number(digits);
  if (n <= 16) return true;
  if (n >= 20) return false;
  return undefined;
}

export const manifestProperties: NamedProperty<ManifestImpl>[] = [
  {
    name: "P6 the parser returns the inputs, outputs and runtime of the model",
    build: (impl) =>
      fc.property(manifestArb, ({ text, model }) => {
        const r = impl.parseActionManifest(text);
        if (!r.ok) throw new Error(`parse failed for:\n${text}`);
        deepStrictEqual([...r.manifest.inputs.entries()].sort(), [...model.inputs.entries()].sort());
        deepStrictEqual([...r.manifest.outputs].sort(), [...model.outputs].sort());
        strictEqual(r.manifest.using, model.using);
      }),
  },
  {
    name: "P6 text that is not a YAML mapping gives ok false and never throws",
    build: (impl) =>
      fc.property(nonMappingArb, (text) => {
        deepStrictEqual(impl.parseActionManifest(text), { ok: false });
      }),
  },
  {
    name: "P6 the Runtime_Rule",
    build: (impl) =>
      fc.property(fc.oneof(usingValueArb, fc.string({ maxLength: 12 }), fc.constant(undefined)), (using) => {
        strictEqual(impl.runtimeSignal(using), modelSignal(using));
      }),
  },
  {
    name: "P6 the Runtime_Rule at its boundaries",
    build: (impl) =>
      fc.property(fc.integer({ min: 0, max: 60 }), (n) => {
        const got = impl.runtimeSignal(`node${n}`);
        strictEqual(got, n <= 16 ? true : n >= 20 ? false : undefined);
        strictEqual(impl.runtimeSignal("composite"), false);
        strictEqual(impl.runtimeSignal("docker"), false);
        strictEqual(impl.runtimeSignal(undefined), undefined);
      }),
  },
];
