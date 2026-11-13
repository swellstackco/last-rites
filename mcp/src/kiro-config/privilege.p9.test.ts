import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { assertProperty } from "../test-support/fc-runner.js";
import { assertAllSabotagesCaught, type NamedProperty } from "../test-support/sabotage-runner.js";
import { REAL_PRIVILEGE, type PrivilegeChecks } from "../test-support/validators.js";
import { KIRO_P9_SABOTAGES } from "../test-support/sabotage/kiro-p9.js";

type Agent = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const load = (f: string): Agent =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/agents/${f}`, import.meta.url), "utf8")) as Agent;
const CORONER = load("coroner-base.json");
const EXORCIST = load("exorcist-base.json");

interface Grant {
  id: string;
  /** Substrings that must all appear in one single reason. */
  expect: string[];
  apply(agent: Agent, at: number): Agent;
}

const addTool = (sel: string): Grant => ({
  id: `tool ${sel}`,
  expect: [sel],
  apply: (a, at) => {
    const tools = [...a["tools"]];
    tools.splice(at % (tools.length + 1), 0, sel);
    return { ...a, tools };
  },
});

const addRule = (capability: string, effect: string, match?: string[]): Grant => ({
  id: `${effect} ${capability} ${match?.join(",") ?? ""}`,
  expect: [effect, capability, ...(match ?? [])],
  apply: (a, at) => {
    const rules = [...a["permissions"].rules];
    rules.splice(at % (rules.length + 1), 0, match ? { capability, effect, match } : { capability, effect });
    return { ...a, permissions: { rules } };
  },
});

const GRANTS: Grant[] = [
  ...["write", "shell", "*", "@builtin", "@mcp", "web", "subagent", "@exorcist", "@exorcist/generate_pin_tests", "@exorcist/*"].map(addTool),
  ...["fs_write", "shell", "web_fetch", "subagent"].flatMap((c) => [addRule(c, "allow"), addRule(c, "ask")]),
  addRule("mcp", "allow", ["exorcist/*"]),
  addRule("mcp", "allow", ["exorcist/generate_pin_tests"]),
  addRule("mcp", "ask", ["exorcist/*"]),
  {
    id: "remove deny rules",
    expect: ["no deny for"],
    apply: (a) => ({ ...a, permissions: { rules: a["permissions"].rules.filter((r: Agent) => r["effect"] !== "deny") } }),
  },
];

const BENIGN: ((a: Agent, at: number) => Agent)[] = [
  (a) => ({ ...a, description: `${a["description"]} more` }),
  (a, at) => {
    const rules = [...a["permissions"].rules];
    rules.splice(at % (rules.length + 1), 0, { capability: "fs_read", effect: "allow" });
    return { ...a, permissions: { rules } };
  },
  (a, at) => {
    const rules = [...a["permissions"].rules];
    rules.splice(at % (rules.length + 1), 0, { capability: "web_fetch", effect: "deny", match: ["*"] });
    return { ...a, permissions: { rules } };
  },
];

export const name = "Property 9: Agent privilege";

export function build(impl: PrivilegeChecks) {
  return fc.property(
    fc.constantFrom(...GRANTS),
    fc.nat({ max: 50 }),
    fc.nat({ max: 50 }),
    fc.nat({ max: BENIGN.length - 1 }),
    fc.nat({ max: 20 }),
    (grant, at, benignAt, benignIx, pushAt) => {
      // read-only base, with and without benign changes: no capability
      const benign = BENIGN[benignIx]!(CORONER, benignAt);
      if (impl.writeCapabilities(CORONER).length !== 0) throw new Error("real-shaped coroner base has write capabilities");
      if (impl.writeCapabilities(benign).length !== 0) throw new Error(`benign change flagged: ${impl.writeCapabilities(benign).join("; ")}`);

      // one injected grant: named in a reason
      const granted = grant.apply(CORONER, at);
      const reasons = impl.writeCapabilities(granted);
      if (!reasons.some((r) => grant.expect.every((e) => r.includes(e)))) {
        throw new Error(`grant "${grant.id}" not named; reasons: ${JSON.stringify(reasons)}`);
      }

      // push: the deny is inserted at a random position; it works exactly when it precedes the git * allow
      if (impl.pushCapabilities(EXORCIST)) throw new Error("exorcist base can push");
      const rules: Agent[] = EXORCIST["permissions"].rules;
      const deny = rules.find((r) => r["effect"] === "deny")!;
      const rest = rules.filter((r) => r !== deny);
      const allowIndex = rest.findIndex((r) => r["capability"] === "shell" && r["effect"] === "allow");
      const insertAt = pushAt % (rest.length + 1);
      const moved = [...rest];
      moved.splice(insertAt, 0, deny);
      const variant = { ...EXORCIST, permissions: { rules: moved } };
      const expected = insertAt > allowIndex;
      if (impl.pushCapabilities(variant) !== expected) {
        throw new Error(`push deny at ${insertAt}, allow at ${allowIndex}: expected ${expected}`);
      }
      if (impl.pushCapabilities({ ...EXORCIST, permissions: { rules: rest } }) !== true) throw new Error("agent without a push deny cannot push?");
      return true;
    },
  );
}

export const property9: NamedProperty<PrivilegeChecks> = { name, build };

describe("Property 9: Agent privilege", () => {
  it("holds for the real checkers", () => {
    assertProperty(name, build(REAL_PRIVILEGE));
  });

  it("every sabotage is caught", () => {
    expect(KIRO_P9_SABOTAGES.length).toBeGreaterThan(0);
    assertAllSabotagesCaught(name, [property9], KIRO_P9_SABOTAGES);
  });
});
