/** Format tests for the real Kiro files this change adds (Requirements 11.1 to 11.3). No network. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUNDLE_REL } from "./build/build.js";
import { pushCapabilities, validateAgentFile, validateMcpSettings, writeCapabilities } from "./kiro-config/index.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

describe("workspace MCP settings", () => {
  const text = read(".kiro/settings/mcp.json");
  const server = (JSON.parse(text) as { mcpServers: Record<string, any> }).mcpServers["exorcist"]; // eslint-disable-line @typescript-eslint/no-explicit-any

  it("passes validateMcpSettings", () => {
    expect(validateMcpSettings(text)).toEqual({ ok: true });
  });

  it("points at the built bundle and is enabled", () => {
    expect(server.command).toBe("node");
    expect(server.args[0]).toBe(BUNDLE_REL);
    expect(server.disabled).toBe(false);
  });

  it("auto-approves exactly the four read tools, never generate_pin_tests", () => {
    expect([...server.autoApprove].sort()).toEqual(["death_report", "find_replacement", "scan_repo", "usage_surface"]);
    expect(server.autoApprove).not.toContain("generate_pin_tests");
  });

  it("holds no secret-looking value", () => {
    expect(server.env.GITHUB_TOKEN).toBe("${GITHUB_TOKEN}");
    expect(text).not.toMatch(/[A-Za-z0-9_-]{30,}/);
    expect(text).not.toMatch(/gh[pousr]_|github_pat_/);
  });
});

describe("custom agents", () => {
  const ctx = { exists: (p: string): boolean => existsSync(join(ROOT, p)) };
  type Agent = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const coronerText = read(".kiro/agents/coroner.json");
  const exorcistText = read(".kiro/agents/exorcist.json");
  const coroner = JSON.parse(coronerText) as Agent;
  const exorcist = JSON.parse(exorcistText) as Agent;
  const settingsServer = (JSON.parse(read(".kiro/settings/mcp.json")) as Agent)["mcpServers"]["exorcist"];

  it("both pass validateAgentFile with a real exists", () => {
    expect(validateAgentFile(coronerText, ctx)).toEqual({ ok: true });
    expect(validateAgentFile(exorcistText, ctx)).toEqual({ ok: true });
  });

  it("the coroner has no write capability and exactly the Requirement 14.2 tools", () => {
    expect(writeCapabilities(coroner)).toEqual([]);
    expect(coroner["tools"]).toEqual(["read", "@exorcist/scan_repo", "@exorcist/death_report", "@exorcist/usage_surface", "@exorcist/find_replacement"]);
    expect(coroner["includeMcpJson"]).toBe(false);
  });

  it("the exorcist cannot push, writes only to the two roots, and reaches generate_pin_tests", () => {
    expect(pushCapabilities(exorcist)).toBe(false);
    const writes = exorcist["permissions"].rules.filter((r: Agent) => r["capability"] === "fs_write" && r["effect"] === "allow");
    expect(writes).toHaveLength(1);
    expect(writes[0].match).toEqual(["demo/proofs/candidates/**", `../${"lastrites"}-work/**`]);
    expect(exorcist["tools"]).toContain("@exorcist");
    expect(exorcist["includeMcpJson"]).toBe(false);
    expect(writeCapabilities(exorcist).some((r) => r.includes("@exorcist"))).toBe(true);
  });

  it("deny rules for shell precede its allow rules", () => {
    const shell = exorcist["permissions"].rules.filter((r: Agent) => r["capability"] === "shell");
    const firstAllow = shell.findIndex((r: Agent) => r["effect"] === "allow");
    const lastDeny = shell.map((r: Agent) => r["effect"]).lastIndexOf("deny");
    expect(lastDeny).toBeLessThan(firstAllow);
    expect(shell[0].match).toEqual(["git push*", "git remote*", "git config*"]);
  });

  it("inline servers deep-equal the workspace settings entry", () => {
    expect(coroner["mcpServers"]["exorcist"]).toEqual(settingsServer);
    expect(exorcist["mcpServers"]["exorcist"]).toEqual(settingsServer);
  });

  it("uses no CLI 2.x legacy field", () => {
    for (const a of [coroner, exorcist]) {
      for (const k of ["allowedTools", "toolsSettings", "toolAliases"]) expect(a).not.toHaveProperty(k);
    }
  });

  it("prompts exist, are non-empty and the coroner prompt grants no edits", () => {
    const c = read(".kiro/agents/prompts/coroner.md");
    const e = read(".kiro/agents/prompts/exorcist.md");
    expect(c.trim().length).toBeGreaterThan(0);
    expect(e.trim().length).toBeGreaterThan(0);
    expect(existsSync(join(ROOT, ".kiro/agents/.gitkeep"))).toBe(true);
    // Every sentence mentioning edit or write must be one of the fixed negative phrases.
    const allowed = ["You never edit a file.", "You are read only."];
    const sentences = c.split(/(?<=\.)\s+|\n/).filter((s) => /\b(edit|write)\b/i.test(s));
    for (const s of sentences) expect(allowed.some((a) => s.includes(a)), s).toBe(true);
    expect(e).toContain("generate_pin_tests");
    expect(e).toContain("BEFORE");
  });
});
