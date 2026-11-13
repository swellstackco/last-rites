import {
  OK,
  type Check,
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

export const POWER_MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";

function validateServer(server: unknown, path: string): Check {
  const shape = objectWith(server, path, { required: ["type", "command"], optional: ["args", "env"] });
  if (!shape.ok) return shape;
  const s = server as Record<string, unknown>;
  return firstFailure(
    stringField(s, "type", path),
    s["type"] === "stdio" ? OK : fail(joinPath(path, "type"), 'must be "stdio"'),
    stringField(s, "command", path),
    stringArrayField(s, "args", path),
    stringMapField(s, "env", path),
  );
}

/** Validates the text of the Power's `mcp.json`. Pure and total. */
export function validatePowerMcp(text: string): Check {
  try {
    const parsed = parseJson(text);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const shape = objectWith(parsed.value, "", { required: ["$schema", "mcpServers"] });
    if (!shape.ok) return shape;
    const root = parsed.value as Record<string, unknown>;
    const schema = stringField(root, "$schema", "");
    if (!schema.ok) return schema;
    const servers = root["mcpServers"];
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
