import { parse } from "yaml";
import { parseActionManifest, runtimeSignal } from "../../evidence/manifest.js";
import type { ManifestParse } from "../../evidence/manifest.js";
import type { ManifestImpl } from "../properties/actions-p6.js";
import type { Sabotage } from "../sabotage-runner.js";

const real: ManifestImpl = { parseActionManifest, runtimeSignal };

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** (a) treat node20 as deprecated. */
const node20Deprecated = (u: string | undefined): boolean | undefined => (u === "node20" ? true : runtimeSignal(u));
/** (b) treat node18 as not deprecated. */
const node18Fine = (u: string | undefined): boolean | undefined => (u === "node18" ? false : runtimeSignal(u));
/** (c) treat a missing runs.using as not deprecated. */
const missingFine = (u: string | undefined): boolean | undefined => (u === undefined ? false : runtimeSignal(u));

/** Rebuilds the manifest from the parsed YAML, with one deliberate defect. */
function reparse(text: string, defect: "default-null" | "bool-required" | "runs-outputs"): ManifestParse {
  const base = parseActionManifest(text);
  if (!base.ok) return base;
  let doc: unknown;
  try {
    doc = parse(text);
  } catch {
    return base;
  }
  if (!isMap(doc)) return base;
  const inputs = new Map(base.manifest.inputs);
  const outputs = new Set(base.manifest.outputs);
  if (defect === "default-null" && isMap(doc["inputs"])) {
    for (const [k, v] of Object.entries(doc["inputs"])) {
      if (isMap(v) && "default" in v) inputs.set(k, { ...inputs.get(k)!, hasDefault: true });
    }
  }
  if (defect === "bool-required" && isMap(doc["inputs"])) {
    for (const [k, v] of Object.entries(doc["inputs"])) inputs.set(k, { ...inputs.get(k)!, required: isMap(v) && v["required"] === true });
  }
  if (defect === "runs-outputs") {
    outputs.clear();
    const runs = doc["runs"];
    if (isMap(runs) && isMap(runs["outputs"])) for (const k of Object.keys(runs["outputs"])) outputs.add(k);
  }
  return { ok: true, manifest: { ...base.manifest, inputs, outputs } };
}

/** (f) throw on a non-mapping input. */
function throwing(text: string): ManifestParse {
  const r = parseActionManifest(text);
  if (!r.ok) throw new Error("not a mapping");
  return r;
}

export const sabotages: Sabotage<ManifestImpl>[] = [
  { name: "(a) treat node20 as deprecated", impl: { ...real, runtimeSignal: node20Deprecated } },
  { name: "(b) treat node18 as not deprecated", impl: { ...real, runtimeSignal: node18Fine } },
  { name: "(c) treat a missing runs.using as not deprecated", impl: { ...real, runtimeSignal: missingFine } },
  { name: "(d) count default: null as a default", impl: { ...real, parseActionManifest: (t) => reparse(t, "default-null") } },
  { name: "(e) read only boolean required", impl: { ...real, parseActionManifest: (t) => reparse(t, "bool-required") } },
  { name: "(f) throw on a non-mapping input", impl: { ...real, parseActionManifest: throwing } },
  { name: "(g) read outputs from runs.outputs", impl: { ...real, parseActionManifest: (t) => reparse(t, "runs-outputs") } },
];
