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
import { formatFiredLine, parseFiredLine } from "../hooks/fired-line.js";
import { formatStopSummary } from "../hooks/stop-summary.js";
import { deadNames, newDeadPackages } from "../hooks/new-dead.js";
import { candidateTarget } from "../hooks/candidate-target.js";
import { checkOut, checkRuns, classifyRepoArgument, guardedScan, isNpmName } from "../guards.js";

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

/** The seam of Property 12: the hook output formatters. */
export interface HookFormat {
  formatStopSummary: typeof formatStopSummary;
  formatFiredLine: typeof formatFiredLine;
  parseFiredLine: typeof parseFiredLine;
}

export const REAL_HOOK_FORMAT: HookFormat = { formatStopSummary, formatFiredLine, parseFiredLine };

/** The seam of Property 10: the dead-package helpers. */
export interface NewDead {
  deadNames: typeof deadNames;
  newDeadPackages: typeof newDeadPackages;
}

export const REAL_NEW_DEAD: NewDead = { deadNames, newDeadPackages };

/** The seam of Property 11: the candidate path mapping. */
export interface CandidateMap {
  candidateTarget: typeof candidateTarget;
}

export const REAL_CANDIDATE_MAP: CandidateMap = { candidateTarget };

/** The seam of Property 1: the argument guards and the scan guard sequence. */
export interface Guards {
  classifyRepoArgument: typeof classifyRepoArgument;
  isNpmName: typeof isNpmName;
  checkRuns: typeof checkRuns;
  checkOut: typeof checkOut;
  guardedScan: typeof guardedScan;
}

export const REAL_GUARDS: Guards = { classifyRepoArgument, isNpmName, checkRuns, checkOut, guardedScan };
