import { describe, it, expect } from "vitest";
import {
  validateAgentFile,
  validateHookFile,
  validateMcpSettings,
  validatePluginManifest,
  validatePowerMcp,
  validateSkill,
  normalizeRelative,
} from "./index.js";

const j = (v: unknown) => JSON.stringify(v);
const exists = { exists: () => true };

const hook = { version: "v1", hooks: [{ name: "n", trigger: "PostFileSave", matcher: "\\.ts$", action: { type: "command", command: "ls" }, timeout: 5 }] };
const agent = {
  name: "a",
  description: "d",
  prompt: "file://./prompts/a.md",
  tools: ["read"],
  resources: ["file://.kiro/steering/x.md"],
  mcpServers: { s: { command: "node" } },
  permissions: { rules: [{ capability: "fs_read", effect: "allow" }] },
};
const settings = { mcpServers: { exorcist: { command: "node", args: ["a"], env: { A: "b" }, disabled: false, autoApprove: ["x"] } } };
const plugin = {
  $schema: "s",
  name: "my-power",
  version: "1.2.3",
  description: "d",
  author: { name: "me" },
  keywords: ["k"],
};
const powerMcp = { $schema: "s", mcpServers: { s: { type: "stdio", command: "node", args: ["a"] } } };
const skill = "---\nname: my-skill\ndescription: does things\n---\nBody.\n";

const bad = (r: { ok: boolean; error?: { path: string; message: string } }) => r.error;

describe("valid samples", () => {
  it("are ok", () => {
    expect(validateHookFile(j(hook))).toEqual({ ok: true });
    expect(validateAgentFile(j(agent), exists)).toEqual({ ok: true });
    expect(validateMcpSettings(j(settings))).toEqual({ ok: true });
    expect(validatePluginManifest(j(plugin))).toEqual({ ok: true });
    expect(validatePowerMcp(j(powerMcp))).toEqual({ ok: true });
    expect(validateSkill(skill, "my-skill")).toEqual({ ok: true });
  });
});

describe("documented faults: exact path and message", () => {
  it("hook", () => {
    const h = (patch: object) => validateHookFile(j({ ...hook, hooks: [{ ...hook.hooks[0], ...patch }] }));
    expect(bad(h({ trigger: "Nope" }))).toEqual({ path: "hooks[0].trigger", message: 'unknown trigger "Nope"' });
    expect(bad(h({ matcher: "(" }))).toEqual({ path: "hooks[0].matcher", message: "does not compile as a regular expression" });
    expect(bad(h({ action: { type: "command" } }))).toEqual({ path: "hooks[0].action.command", message: "required field is missing" });
    expect(bad(h({ action: { type: "agent" } }))).toEqual({ path: "hooks[0].action.prompt", message: "required field is missing" });
    expect(bad(h({ extra: 1 }))).toEqual({ path: "hooks[0].extra", message: "unknown field" });
    expect(bad(validateHookFile(j({ ...hook, version: "v2" })))).toEqual({ path: "version", message: 'must be "v1"' });
  });

  it("agent", () => {
    expect(bad(validateAgentFile(j({ ...agent, allowedTools: [] }), exists))?.path).toBe("allowedTools");
    expect(bad(validateAgentFile(j({ ...agent, toolsSettings: {} }), exists))?.path).toBe("toolsSettings");
    expect(
      bad(validateAgentFile(j({ ...agent, permissions: { rules: [{ capability: "fs_read", effect: "maybe" }] } }), exists)),
    ).toEqual({ path: "permissions.rules[0].effect", message: 'must be "allow", "ask" or "deny"' });
    expect(bad(validateAgentFile(j({ ...agent, mcpServers: { s: {} } }), exists))).toEqual({
      path: "mcpServers.s.command",
      message: "required field is missing",
    });
  });

  it("agent file targets are checked through ctx.exists", () => {
    const seen: string[] = [];
    const ctx = { exists: (p: string) => (seen.push(p), false) };
    expect(bad(validateAgentFile(j(agent), ctx))?.path).toBe("prompt");
    expect(seen[0]).toBe(".kiro/agents/prompts/a.md");
    const onlyPrompt = { exists: (p: string) => p === ".kiro/agents/prompts/a.md" };
    expect(bad(validateAgentFile(j(agent), onlyPrompt))?.path).toBe("resources[0]");
  });

  it("mcp settings reject type", () => {
    const s = { mcpServers: { x: { command: "node", type: "stdio" } } };
    expect(bad(validateMcpSettings(j(s)))).toEqual({ path: "mcpServers.x.type", message: "unknown field" });
  });

  it("plugin", () => {
    expect(bad(validatePluginManifest(j({ ...plugin, name: "Bad_Name" })))).toEqual({ path: "name", message: "must be kebab-case" });
    expect(bad(validatePluginManifest(j({ ...plugin, version: "1.0" })))).toEqual({
      path: "version",
      message: "must be a semantic version like 1.2.3",
    });
  });

  it("power mcp", () => {
    expect(bad(validatePowerMcp(j({ ...powerMcp, mcpServers: { s: { type: "http", command: "x" } } })))).toEqual({
      path: "mcpServers.s.type",
      message: 'must be "stdio"',
    });
  });

  it("skill", () => {
    expect(bad(validateSkill(skill, "other"))).toEqual({ path: "name", message: 'must equal the folder name "other"' });
    expect(bad(validateSkill("---\nname: my-skill\n---\nBody\n", "my-skill"))?.path).toBe("description");
    expect(bad(validateSkill("---\nname: my-skill\ndescription: d\n---\n\n", "my-skill"))?.path).toBe("body");
    expect(bad(validateSkill("no frontmatter", "my-skill"))?.path).toBe("frontmatter");
  });
});

describe("totality", () => {
  const inputs = ["", "   ", "not json", "[]", "null", "5", '"x"', "{}", "[".repeat(5000), "{".repeat(5000), "\u0000"];
  it("never throws and always rejects non-objects", () => {
    for (const t of inputs) {
      for (const r of [
        validateHookFile(t),
        validateAgentFile(t, exists),
        validateMcpSettings(t),
        validatePluginManifest(t),
        validatePowerMcp(t),
        validateSkill(t, "x"),
      ]) {
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.message).not.toBe("");
      }
    }
  });

  it("tolerates non-string input", () => {
    for (const t of [undefined, null, 5, {}] as unknown as string[]) {
      expect(validateHookFile(t).ok).toBe(false);
      expect(validateSkill(t, "x").ok).toBe(false);
    }
  });
});

describe("normalizeRelative", () => {
  it("resolves dot segments", () => {
    expect(normalizeRelative(".kiro/agents/./prompts/../prompts/a.md")).toBe(".kiro/agents/prompts/a.md");
    expect(normalizeRelative("../x")).toBe("../x");
  });
});
