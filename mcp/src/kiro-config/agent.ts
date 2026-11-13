import {
  OK,
  type Check,
  arrayOf,
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

export const AGENT_CAPABILITIES = ["fs_read", "fs_write", "shell", "web_fetch", "mcp", "subagent"] as const;
export const RULE_EFFECTS = ["allow", "ask", "deny"] as const;

/** CLI 2.x fields that Kiro 3.x agents do not use; named so the message says why. */
const LEGACY_FIELDS = ["allowedTools", "toolsSettings", "toolAliases", "keyboardShortcut"] as const;

/** Directory of the agent files, workspace-relative; `prompt` paths are relative to it. */
export const AGENT_DIR = ".kiro/agents";

export interface AgentContext {
  /** True when the workspace-relative path exists. Injected so the validator stays pure. */
  exists(path: string): boolean;
}

/** Resolves `.` and `..` segments of a workspace-relative path without touching the file system. */
export function normalizeRelative(path: string): string {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === ".." && out.length > 0 && out[out.length - 1] !== "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

function validateRule(rule: unknown, path: string): Check {
  const shape = objectWith(rule, path, { required: ["capability", "effect"], optional: ["match", "exclude"] });
  if (!shape.ok) return shape;
  const r = rule as Record<string, unknown>;
  const capability = r["capability"];
  const effect = r["effect"];
  return firstFailure(
    typeof capability !== "string"
      ? fail(joinPath(path, "capability"), "must be a string")
      : (AGENT_CAPABILITIES as readonly string[]).includes(capability)
        ? OK
        : fail(joinPath(path, "capability"), `unknown capability "${capability}"`),
    typeof effect !== "string"
      ? fail(joinPath(path, "effect"), "must be a string")
      : (RULE_EFFECTS as readonly string[]).includes(effect)
        ? OK
        : fail(joinPath(path, "effect"), 'must be "allow", "ask" or "deny"'),
    stringArrayField(r, "match", path),
    stringArrayField(r, "exclude", path),
  );
}

function validatePermissions(value: unknown, path: string): Check {
  const shape = objectWith(value, path, { required: ["rules"] });
  if (!shape.ok) return shape;
  return arrayOf((value as Record<string, unknown>)["rules"], joinPath(path, "rules"), validateRule);
}

function validateServer(server: unknown, path: string): Check {
  const shape = objectWith(server, path, {
    required: ["command"],
    optional: ["args", "env", "disabled", "autoApprove", "disabledTools", "timeout"],
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

function validateServers(value: unknown, path: string): Check {
  if (!isPlainObject(value)) return fail(path, "must be an object");
  for (const name of Object.keys(value)) {
    const r = validateServer(value[name], joinPath(path, name));
    if (!r.ok) return r;
  }
  return OK;
}

function targetOfFileUrl(url: string, relativeTo: string): string {
  const raw = url.slice("file://".length);
  if (raw.startsWith("/")) return raw;
  return normalizeRelative(raw.startsWith("./") || raw.startsWith("../") ? `${relativeTo}/${raw}` : raw);
}

function validatePrompt(prompt: unknown, ctx: AgentContext): Check {
  if (typeof prompt !== "string") return fail("prompt", "must be a string");
  if (prompt.trim() === "") return fail("prompt", "must not be empty");
  if (!prompt.startsWith("file://")) return OK;
  return ctx.exists(targetOfFileUrl(prompt, AGENT_DIR)) ? OK : fail("prompt", `file not found: ${prompt}`);
}

function validateResources(value: unknown, ctx: AgentContext): Check {
  return arrayOf(value, "resources", (item, p) => {
    if (typeof item === "string") {
      if (!item.startsWith("file://") || item.includes("*")) return OK;
      return ctx.exists(targetOfFileUrl(item, "")) ? OK : fail(p, `file not found: ${item}`);
    }
    return isPlainObject(item) ? OK : fail(p, "must be a string or an object");
  });
}

/**
 * Validates the text of a `.kiro/agents/<name>.json` file (Kiro 3.x format). The CLI 2.x fields `allowedTools`,
 * `toolsSettings` and `toolAliases` are rejected. `file://` targets of `prompt` (relative to the agent file) and of
 * `resources` (workspace-relative) must exist according to `ctx`. Pure and total.
 */
export function validateAgentFile(text: string, ctx: AgentContext): Check {
  try {
    const parsed = parseJson(text);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const root = parsed.value;
    if (isPlainObject(root)) {
      for (const legacy of LEGACY_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(root, legacy)) {
          return fail(legacy, "unknown field (CLI 2.x field, use tools and permissions.rules)");
        }
      }
    }
    const shape = objectWith(root, "", {
      required: ["name", "description", "prompt"],
      optional: [
        "model",
        "tools",
        "excludedTools",
        "mcpServers",
        "permissions",
        "resources",
        "hooks",
        "includeMcpJson",
        "includePowers",
        "welcomeMessage",
      ],
    });
    if (!shape.ok) return shape;
    const a = root as Record<string, unknown>;
    const has = (k: string) => Object.prototype.hasOwnProperty.call(a, k);
    return firstFailure(
      stringField(a, "name", ""),
      stringField(a, "description", ""),
      validatePrompt(a["prompt"], ctx),
      stringField(a, "model", ""),
      stringArrayField(a, "tools", ""),
      stringArrayField(a, "excludedTools", ""),
      has("mcpServers") ? validateServers(a["mcpServers"], "mcpServers") : OK,
      has("permissions") ? validatePermissions(a["permissions"], "permissions") : OK,
      has("resources") ? validateResources(a["resources"], ctx) : OK,
      has("hooks") && !isPlainObject(a["hooks"]) ? fail("hooks", "must be an object") : OK,
      boolField(a, "includeMcpJson", ""),
      boolField(a, "includePowers", ""),
      stringField(a, "welcomeMessage", "", { allowEmpty: true }),
    );
  } catch {
    return fail("", "could not be validated");
  }
}
