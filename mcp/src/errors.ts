// Error codes of the Exorcist_Mcp tools (Requirement 9.2). Messages are built only from fixed text and validated values.

export const ERROR_CODES = [
  "invalid_input",
  "invalid_repo",
  "invalid_ref",
  "invalid_package",
  "invalid_path",
  "path_not_found",
  "not_a_directory",
  "invalid_candidate",
  "invalid_runs",
  "invalid_out",
  "demo_not_found",
  "demo_invalid",
  "scan_failed",
  "package_not_found",
  "package_skipped",
  "evidence_unavailable",
  "usage_error",
  "proof_failed",
  "internal_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ToolErrorValue {
  ok: false;
  code: ErrorCode;
  message: string;
}

export function toolError(code: ErrorCode, message: string): ToolErrorValue {
  return { ok: false, code, message };
}

/** The fixed text of every unexpected exception (Requirement 9.3). */
export const UNEXPECTED_MESSAGE = "unexpected error";
