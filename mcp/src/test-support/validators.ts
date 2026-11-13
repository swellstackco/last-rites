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
import { skillFromSteering } from "../power/skill-from-steering.js";
import { formatFiredLine, parseFiredLine } from "../hooks/fired-line.js";
import { formatStopSummary } from "../hooks/stop-summary.js";
import { deadNames, newDeadPackages } from "../hooks/new-dead.js";
import { candidateTarget } from "../hooks/candidate-target.js";
import { scanRepoImpl } from "../tools/scan-repo.js";
import { deathReportImpl } from "../tools/death-report.js";
import { usageSurfaceImpl } from "../tools/usage-surface.js";
import { findReplacementImpl } from "../tools/find-replacement.js";
import { generatePinTestsImpl } from "../tools/generate-pin-tests.js";
import { safely } from "../result.js";
import { obtainScanReport } from "../scan-source.js";
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

/** The seam of Property 7: demo routing in the scan source. */
export interface ScanSource {
  obtainScanReport: typeof obtainScanReport;
}

export const REAL_SCAN_SOURCE: ScanSource = { obtainScanReport };

/** The seam of Properties 2 to 6: the five tool implementations. */
export interface Tools {
  scanRepo: typeof scanRepoImpl;
  deathReport: typeof deathReportImpl;
  usageSurface: typeof usageSurfaceImpl;
  findReplacement: typeof findReplacementImpl;
  generatePinTests: typeof generatePinTestsImpl;
}

export const REAL_TOOLS: Tools = {
  scanRepo: scanRepoImpl,
  deathReport: deathReportImpl,
  usageSurface: usageSurfaceImpl,
  findReplacement: findReplacementImpl,
  generatePinTests: generatePinTestsImpl,
};

/** The seam of Property 4: the handler wrapper together with the five tool implementations (what `registerTools` composes). */
export interface TotalTools {
  safely: typeof safely;
  tools: Tools;
}

export const REAL_TOTAL: TotalTools = { safely, tools: REAL_TOOLS };

/** The seam of Property 13: skill generation from a steering file. */
export interface SkillGen {
  skillFromSteering: typeof skillFromSteering;
}

export const REAL_SKILL_GEN: SkillGen = { skillFromSteering };
