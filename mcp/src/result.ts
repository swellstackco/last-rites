import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type ErrorCode, UNEXPECTED_MESSAGE } from "./errors.js";

/** A successful Tool_Result: one text item per argument; the first is the canonical output. */
export function textResult(...texts: string[]): CallToolResult {
  return { content: texts.map((text) => ({ type: "text" as const, text })) };
}

/** A Tool_Error: `isError` true and one text item `{"error":{"code","message"}}`. */
export function errorResult(code: ErrorCode, message: string): CallToolResult {
  const safeMessage = message === "" ? UNEXPECTED_MESSAGE : message;
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: { code, message: safeMessage } }) }],
  };
}

/**
 * Runs one handler and never lets anything escape. A throw, a rejection or a non-object result
 * becomes `internal_error` / `unexpected error`; the thrown value is never forwarded (it could hold a path or a token).
 */
export async function safely(handler: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    const result = await handler();
    if (typeof result !== "object" || result === null || !Array.isArray(result.content)) {
      return errorResult("internal_error", UNEXPECTED_MESSAGE);
    }
    return result;
  } catch {
    return errorResult("internal_error", UNEXPECTED_MESSAGE);
  }
}
