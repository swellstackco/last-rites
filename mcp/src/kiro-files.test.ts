/** Format tests for the real Kiro files this change adds (Requirements 11.1 to 11.3). No network. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUNDLE_REL } from "./build/build.js";
import { validateMcpSettings } from "./kiro-config/index.js";

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
