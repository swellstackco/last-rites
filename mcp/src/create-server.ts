import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import manifest from "../package.json" with { type: "json" };
import type { ExorcistDeps } from "./deps.js";
import { UNEXPECTED_MESSAGE } from "./errors.js";
import { errorResult } from "./result.js";
import { registerTools } from "./tools/index.js";

/**
 * The SDK turns every failure that happens before a handler runs (a schema rejection, an unknown tool) into
 * its own free-text error result. `createToolError` is the SDK's single point for that; replacing it on this
 * instance gives those failures the Tool_Error shape (Requirements 2.5, 9.2). The SDK's message is never forwarded.
 */
function useToolErrorShape(server: McpServer): void {
  (server as unknown as { createToolError: (message: string) => CallToolResult }).createToolError = (message) =>
    typeof message === "string" && message.includes("Input validation error")
      ? errorResult("invalid_input", "arguments do not match the tool's input schema")
      : errorResult("internal_error", UNEXPECTED_MESSAGE);
}

/** The `exorcist` MCP server over injected Deps. No I/O happens here (Requirements 2.1, 2.4). */
export function createExorcistServer(deps: ExorcistDeps): McpServer {
  const server = new McpServer({ name: "exorcist", version: manifest.version });
  useToolErrorShape(server);
  registerTools(server, deps);
  return server;
}
