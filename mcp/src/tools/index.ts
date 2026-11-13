import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ExorcistDeps } from "../deps.js";
import { safely } from "../result.js";
import * as death from "./death-report.js";
import * as find from "./find-replacement.js";
import * as pin from "./generate-pin-tests.js";
import * as scan from "./scan-repo.js";
import * as usage from "./usage-surface.js";

export const TOOL_NAMES = [
  scan.SCAN_REPO_NAME,
  death.DEATH_REPORT_NAME,
  usage.USAGE_SURFACE_NAME,
  find.FIND_REPLACEMENT_NAME,
  pin.GENERATE_PIN_TESTS_NAME,
] as const;

/** Registers the five tools; every handler is `safely`-wrapped (Requirements 2.1, 2.2, 9.4). */
export function registerTools(server: McpServer, deps: ExorcistDeps): void {
  server.registerTool(
    scan.SCAN_REPO_NAME,
    { title: scan.SCAN_REPO_TITLE, description: scan.SCAN_REPO_DESCRIPTION, inputSchema: scan.SCAN_REPO_SHAPE, annotations: scan.SCAN_REPO_ANNOTATIONS },
    (args) => safely(() => scan.scanRepoImpl(deps, args)),
  );
  server.registerTool(
    death.DEATH_REPORT_NAME,
    { title: death.DEATH_REPORT_TITLE, description: death.DEATH_REPORT_DESCRIPTION, inputSchema: death.DEATH_REPORT_SHAPE, annotations: death.DEATH_REPORT_ANNOTATIONS },
    (args) => safely(() => death.deathReportImpl(deps, args)),
  );
  server.registerTool(
    usage.USAGE_SURFACE_NAME,
    { title: usage.USAGE_SURFACE_TITLE, description: usage.USAGE_SURFACE_DESCRIPTION, inputSchema: usage.USAGE_SURFACE_SHAPE, annotations: usage.USAGE_SURFACE_ANNOTATIONS },
    (args) => safely(() => usage.usageSurfaceImpl(deps, args)),
  );
  server.registerTool(
    find.FIND_REPLACEMENT_NAME,
    { title: find.FIND_REPLACEMENT_TITLE, description: find.FIND_REPLACEMENT_DESCRIPTION, inputSchema: find.FIND_REPLACEMENT_SHAPE, annotations: find.FIND_REPLACEMENT_ANNOTATIONS },
    (args) => safely(() => find.findReplacementImpl(deps, args)),
  );
  server.registerTool(
    pin.GENERATE_PIN_TESTS_NAME,
    { title: pin.GENERATE_PIN_TESTS_TITLE, description: pin.GENERATE_PIN_TESTS_DESCRIPTION, inputSchema: pin.GENERATE_PIN_TESTS_SHAPE, annotations: pin.GENERATE_PIN_TESTS_ANNOTATIONS },
    (args) => safely(() => pin.generatePinTestsImpl(deps, args)),
  );
}
