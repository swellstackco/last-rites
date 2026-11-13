import fc from "fast-check";
import { describe, it, expect } from "vitest";
import type { Check } from "./index.js";
import { assertProperty } from "../test-support/fc-runner.js";
import { assertAllSabotagesCaught, type NamedProperty } from "../test-support/sabotage-runner.js";
import { REAL_VALIDATORS, type Validators } from "../test-support/validators.js";
import { KIRO_P8_SABOTAGES } from "../test-support/sabotage/kiro-p8.js";
import {
  FAULTS,
  agentFileArb,
  hookFileArb,
  injectFault,
  jsonText,
  mcpSettingsArb,
  pluginManifestArb,
  powerMcpArb,
  skillArb,
  skillText,
  type SkillSample,
  type JsonKind,
  type KiroKind,
} from "../test-support/arbitraries/kiro-files.js";

const ctx = { exists: () => true };

const JSON_ARBS: Record<JsonKind, fc.Arbitrary<Record<string, unknown>>> = {
  hook: hookFileArb,
  agent: agentFileArb,
  "mcp-settings": mcpSettingsArb,
  plugin: pluginManifestArb,
  "power-mcp": powerMcpArb,
};

function run(v: Validators, kind: KiroKind, text: string, folder: string): Check {
  switch (kind) {
    case "hook":
      return v.hook(text);
    case "agent":
      return v.agent(text, ctx);
    case "mcp-settings":
      return v.mcpSettings(text);
    case "plugin":
      return v.plugin(text);
    case "power-mcp":
      return v.powerMcp(text);
    case "skill":
      return v.skill(text, folder);
  }
}

const KINDS: KiroKind[] = ["hook", "agent", "mcp-settings", "plugin", "power-mcp", "skill"];

type Sample = { kind: JsonKind; value: Record<string, unknown> } | { kind: "skill"; value: SkillSample };

const sampleArb: fc.Arbitrary<Sample> = fc.oneof(
  ...(Object.keys(JSON_ARBS) as JsonKind[]).map((kind) => JSON_ARBS[kind].map((value): Sample => ({ kind, value }))),
  skillArb.map((value): Sample => ({ kind: "skill", value })),
);

// Feature: kiro-integration, Property 8: Config validators
export const name = "Property 8: Config validators";

export function build(v: Validators) {
  return fc.property(
    sampleArb,
    fc.nat({ max: 1000 }),
    fc.nat({ max: 1000 }),
    fc.string({ maxLength: 60 }),
    (sample, faultIx, pick, junk) => {
      const kind: KiroKind = sample.kind;
      const folder = sample.kind === "skill" ? sample.value.folder : "unused";
      const text = sample.kind === "skill" ? skillText(sample.value) : jsonText(sample.value);

      // a valid file is ok
      const valid = run(v, kind, text, folder);
      if (!valid.ok) throw new Error(`valid ${kind} rejected: ${valid.error.path}: ${valid.error.message}`);

      // one fault: not ok, path names the faulted field, message non-empty
      const faults = FAULTS[kind];
      const fault = faults[faultIx % faults.length]!;
      const faulted =
        sample.kind === "skill"
          ? injectFault("skill", fault, sample.value, pick)
          : injectFault(sample.kind, fault, sample.value, pick);
      if (faulted === undefined) throw new Error(`fault ${fault} did not apply to ${kind}`);
      const r = run(v, kind, faulted.text, faulted.folder ?? folder);
      if (r.ok) throw new Error(`${kind} with fault ${fault} (${faulted.path}) was accepted`);
      if (r.error.path !== faulted.path) {
        throw new Error(`${kind} fault ${fault}: expected path "${faulted.path}", got "${r.error.path}" (${r.error.message})`);
      }
      if (r.error.message === "") throw new Error(`${kind} fault ${fault}: empty message`);

      // arbitrary text never throws and always returns a Check
      for (const k of KINDS) {
        const j = run(v, k, junk, "x");
        if (typeof j.ok !== "boolean") throw new Error(`${k} returned a non-Check for junk text`);
      }
      return true;
    },
  );
}

export const property8: NamedProperty<Validators> = { name, build };

describe("Property 8: Config validators", () => {
  it("holds for the real validators", () => {
    assertProperty(name, build(REAL_VALIDATORS));
  });

  it("every sabotage is caught", () => {
    assertAllSabotagesCaught(name, [property8], KIRO_P8_SABOTAGES);
  });
});
