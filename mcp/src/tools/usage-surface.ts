import { basename } from "node:path";
import { serializeProofReport } from "@graveyard-kit/skeleton/proof";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ExorcistDeps } from "../deps.js";
import { checkPackage, checkPath } from "../guards.js";
import { errorResult, textResult } from "../result.js";

export const USAGE_SURFACE_NAME = "usage_surface";
export const USAGE_SURFACE_TITLE = "Usage surface of a package in a checkout";
export const USAGE_SURFACE_DESCRIPTION =
  "List every import and call site of one npm package in a local checkout, as a proof report with no attempts. " +
  "Reads files under `path` only; makes no network requests and writes nothing. A checkout with no usage is a success with empty lists.";

export const USAGE_SURFACE_SHAPE = {
  path: z.string().describe("Directory of the checkout, resolved against the server's working directory"),
  package: z.string().describe("npm package name"),
};

export const USAGE_SURFACE_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;

const MAX_WARNINGS = 50;

export interface UsageSurfaceArgs {
  path: unknown;
  package: unknown;
}

export async function usageSurfaceImpl(deps: ExorcistDeps, args: UsageSurfaceArgs): Promise<CallToolResult> {
  const pkg = checkPackage(args.package);
  if (!pkg.ok) return errorResult(pkg.code, pkg.message);
  const p = await checkPath(deps.probe, deps.cwd, args.path);
  if (!p.ok) return errorResult(p.code, p.message);
  const usage = await deps.usageSurface({ root: p.abs, package: pkg.name });
  const text = serializeProofReport({
    repo: basename(p.abs),
    package: pkg.name,
    filesScanned: usage.filesScanned,
    callSites: usage.callSites,
    importSites: usage.importSites,
    attempts: [],
  });
  if (usage.warnings.length === 0) return textResult(text);
  const shown: string[] = usage.warnings.slice(0, MAX_WARNINGS);
  if (usage.warnings.length > MAX_WARNINGS) shown.push(`... and ${usage.warnings.length - MAX_WARNINGS} more`);
  return textResult(text, JSON.stringify({ warnings: shown }));
}
