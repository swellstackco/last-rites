import type { Check } from "../../kiro-config/index.js";
import { REAL_VALIDATORS, type Validators } from "../validators.js";
import type { Sabotage } from "../sabotage-runner.js";

const OK: Check = { ok: true };

/** Wraps every validator: `fix` may turn the real result into a different one. */
function wrapAll(fix: (r: Check, text: string) => Check): Validators {
  const V = REAL_VALIDATORS;
  return {
    hook: (t) => fix(V.hook(t), t),
    agent: (t, c) => fix(V.agent(t, c), t),
    mcpSettings: (t) => fix(V.mcpSettings(t), t),
    plugin: (t) => fix(V.plugin(t), t),
    powerMcp: (t) => fix(V.powerMcp(t), t),
    skill: (t, f) => fix(V.skill(t, f), t),
  };
}

const messageOf = (r: Check): string => (r.ok ? "" : r.error.message);
const pathOf = (r: Check): string => (r.ok ? "" : r.error.path);

const isJson = (text: string): boolean => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

export const KIRO_P8_SABOTAGES: Sabotage<Validators>[] = [
  {
    name: "(a) accept an unknown trigger",
    impl: { ...REAL_VALIDATORS, hook: (t) => (messageOf(REAL_VALIDATORS.hook(t)).startsWith("unknown trigger") ? OK : REAL_VALIDATORS.hook(t)) },
  },
  {
    name: "(b) skip the matcher compile check",
    impl: { ...REAL_VALIDATORS, hook: (t) => (messageOf(REAL_VALIDATORS.hook(t)).includes("regular expression") ? OK : REAL_VALIDATORS.hook(t)) },
  },
  {
    name: "(c) accept an unknown field",
    impl: wrapAll((r) => (messageOf(r).startsWith("unknown field") ? OK : r)),
  },
  {
    name: "(d) report the wrong path",
    impl: wrapAll((r) => (r.ok ? r : { ok: false, error: { path: `${r.error.path}.wrong`, message: r.error.message } })),
  },
  {
    name: "(e) throw on non-JSON text",
    impl: {
      ...REAL_VALIDATORS,
      hook: (t) => (isJson(t) ? REAL_VALIDATORS.hook(t) : fail()),
      agent: (t, c) => (isJson(t) ? REAL_VALIDATORS.agent(t, c) : fail()),
      mcpSettings: (t) => (isJson(t) ? REAL_VALIDATORS.mcpSettings(t) : fail()),
      plugin: (t) => (isJson(t) ? REAL_VALIDATORS.plugin(t) : fail()),
      powerMcp: (t) => (isJson(t) ? REAL_VALIDATORS.powerMcp(t) : fail()),
    },
  },
  {
    name: "(f) accept an agent action with no prompt",
    impl: { ...REAL_VALIDATORS, hook: (t) => (pathOf(REAL_VALIDATORS.hook(t)).endsWith(".action.prompt") ? OK : REAL_VALIDATORS.hook(t)) },
  },
  {
    name: "(g) accept a plugin version 1.0",
    impl: { ...REAL_VALIDATORS, plugin: (t) => (pathOf(REAL_VALIDATORS.plugin(t)) === "version" && messageOf(REAL_VALIDATORS.plugin(t)).startsWith("must be a semantic") ? OK : REAL_VALIDATORS.plugin(t)) },
  },
  {
    name: "(h) accept a rule with an unknown effect",
    impl: { ...REAL_VALIDATORS, agent: (t, c) => (pathOf(REAL_VALIDATORS.agent(t, c)).endsWith(".effect") ? OK : REAL_VALIDATORS.agent(t, c)) },
  },
  {
    name: "(i) accept a skill whose name differs from its folder",
    impl: { ...REAL_VALIDATORS, skill: (t, f) => (pathOf(REAL_VALIDATORS.skill(t, f)) === "name" && messageOf(REAL_VALIDATORS.skill(t, f)).startsWith("must equal the folder") ? OK : REAL_VALIDATORS.skill(t, f)) },
  },
];

function fail(): never {
  throw new SyntaxError("Unexpected token in JSON");
}
