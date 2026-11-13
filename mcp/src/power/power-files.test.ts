/** Format and drift tests for the committed Power files (Requirements 15.1 to 15.7). No network. */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { POWER_SERVER_REL } from "../build/build.js";
import { validatePluginManifest, validatePowerMcp, validateSkill } from "../kiro-config/index.js";
import { skillFromSteering } from "./skill-from-steering.js";
import { SKILLS } from "./skills.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

describe("power files", () => {
  it("plugin.json passes its validator and is named exorcist", () => {
    const text = read("power/plugin.json");
    expect(validatePluginManifest(text)).toEqual({ ok: true });
    expect((JSON.parse(text) as { name: string }).name).toBe("exorcist");
  });

  it("mcp.json passes its validator and points at the path the build copies to", () => {
    const text = read("power/mcp.json");
    expect(validatePowerMcp(text)).toEqual({ ok: true });
    const s = (JSON.parse(text) as { mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }> }).mcpServers["exorcist"]!;
    expect(s.command).toBe("node");
    expect(s.args[0]).toBe(POWER_SERVER_REL);
    expect(Object.keys(s.env ?? {})).toEqual([]);
  });

  for (const skill of SKILLS) {
    it(`skill ${skill.name} is valid and equals the generated text of its steering file (drift guard)`, () => {
      const text = read(`power/skills/${skill.name}/SKILL.md`);
      expect(validateSkill(text, skill.name)).toEqual({ ok: true });
      expect(text).toBe(skillFromSteering(read(skill.steering), skill));
    });
  }

  it("README has the install commands, the tool name and the configuration variables", () => {
    const text = read("power/README.md");
    for (const needle of ["kiro-cli powers install", "Add Custom Power", "generate_pin_tests", "GITHUB_TOKEN", "EXORCIST_CACHE_DIR", "package-lock.json"]) {
      expect(text).toContain(needle);
    }
  });

  it("has no POWER.md and only the listed files (server/ ignored)", () => {
    expect(existsSync(join(ROOT, "power/POWER.md"))).toBe(false);
    expect(readdirSync(join(ROOT, "power")).filter((n) => n !== "server" && n !== "node_modules").sort()).toEqual([
      "README.md",
      "mcp.json",
      "package.json",
      "plugin.json",
      "skills",
    ]);
    expect(readdirSync(join(ROOT, "power/skills")).sort()).toEqual(["migration-rules", "proof-rules"]);
  });
});
