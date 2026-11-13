import {
  validateAgentFile,
  validateHookFile,
  validateMcpSettings,
  validatePluginManifest,
  validatePowerMcp,
  validateSkill,
  writeCapabilities,
  pushCapabilities,
  type AgentContext,
  type Check,
} from "../kiro-config/index.js";

/** The seam of Property 8: the six Config_Validators. */
export interface Validators {
  hook(text: string): Check;
  agent(text: string, ctx: AgentContext): Check;
  mcpSettings(text: string): Check;
  plugin(text: string): Check;
  powerMcp(text: string): Check;
  skill(text: string, folderName: string): Check;
}

export const REAL_VALIDATORS: Validators = {
  hook: validateHookFile,
  agent: validateAgentFile,
  mcpSettings: validateMcpSettings,
  plugin: validatePluginManifest,
  powerMcp: validatePowerMcp,
  skill: validateSkill,
};

/** The seam of Property 9: the two privilege checkers. */
export interface PrivilegeChecks {
  writeCapabilities(agent: unknown): string[];
  pushCapabilities(agent: unknown): boolean;
}

export const REAL_PRIVILEGE: PrivilegeChecks = { writeCapabilities, pushCapabilities };
