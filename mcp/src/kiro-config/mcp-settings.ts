import {
  OK,
  type Check,
  boolField,
  fail,
  firstFailure,
  isPlainObject,
  joinPath,
  objectWith,
  parseJson,
  stringArrayField,
  stringField,
  stringMapField,
} from "./helpers.js";

function validateServer(server: unknown, path: string): Check {
  const shape = objectWith(server, path, {
    required: ["command"],
    optional: ["args", "env", "disabled", "autoApprove", "disabledTools"],
  });
  if (!shape.ok) return shape;
  const s = server as Record<string, unknown>;
  return firstFailure(
    stringField(s, "command", path),
    stringArrayField(s, "args", path),
    stringMapField(s, "env", path),
    boolField(s, "disabled", path),
    stringArrayField(s, "autoApprove", path),
    stringArrayField(s, "disabledTools", path),
  );
}

/** Validates the text of `.kiro/settings/mcp.json`. `type` is rejected as an unknown field. Pure and total. */
export function validateMcpSettings(text: string): Check {
  try {
    const parsed = parseJson(text);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const shape = objectWith(parsed.value, "", { required: ["mcpServers"] });
    if (!shape.ok) return shape;
    const servers = (parsed.value as Record<string, unknown>)["mcpServers"];
    if (!isPlainObject(servers)) return fail("mcpServers", "must be an object");
    for (const name of Object.keys(servers)) {
      const r = validateServer(servers[name], joinPath("mcpServers", name));
      if (!r.ok) return r;
    }
    return OK;
  } catch {
    return fail("", "could not be validated");
  }
}
