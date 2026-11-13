import { REAL_PRIVILEGE, type PrivilegeChecks } from "../validators.js";
import type { Sabotage } from "../sabotage-runner.js";

const R = REAL_PRIVILEGE;

function filtered(drop: (reason: string) => boolean): PrivilegeChecks {
  return { ...R, writeCapabilities: (a) => R.writeCapabilities(a).filter((r) => !drop(r)) };
}

function hasDenyAnywhere(agent: unknown): boolean {
  const rules = (agent as { permissions?: { rules?: { effect?: string; capability?: string }[] } })?.permissions?.rules ?? [];
  return rules.some((r) => r.effect === "deny" && r.capability === "shell");
}

export const KIRO_P9_SABOTAGES: Sabotage<PrivilegeChecks>[] = [
  { name: "(a) ignore an @exorcist selector without a tool name", impl: filtered((r) => r === "tools: @exorcist") },
  { name: "(b) ignore ask rules", impl: filtered((r) => r.startsWith("rule: ask")) },
  { name: "(c) ignore the shell capability", impl: filtered((r) => r.includes("shell")) },
  { name: "(d) treat exorcist/* as a single tool", impl: filtered((r) => r.includes("exorcist/*")) },
  {
    name: "(e) accept a push deny rule placed after the git * allow",
    impl: { ...R, pushCapabilities: (a) => (hasDenyAnywhere(a) ? false : R.pushCapabilities(a)) },
  },
  { name: "(f) only inspect tools, not permissions", impl: filtered((r) => r.startsWith("rule:")) },
];
