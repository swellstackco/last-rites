import {
  OK,
  type Check,
  arrayOf,
  boolField,
  fail,
  firstFailure,
  isPlainObject,
  joinPath,
  numberField,
  objectWith,
  parseJson,
  stringField,
} from "./helpers.js";

export const HOOK_TRIGGERS = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "Stop",
  "PreToolUse",
  "PostToolUse",
  "PostFileCreate",
  "PostFileSave",
  "PostFileDelete",
  "PreTaskExec",
  "PostTaskExec",
  "PreCompact",
  "PostCompact",
] as const;

function validateAction(action: unknown, path: string): Check {
  if (!isPlainObject(action)) return fail(path, "must be an object");
  if (!Object.prototype.hasOwnProperty.call(action, "type")) return fail(joinPath(path, "type"), "required field is missing");
  const type = action["type"];
  if (type === "command") {
    const shape = objectWith(action, path, { required: ["type", "command"] });
    if (!shape.ok) return shape;
    return stringField(action, "command", path);
  }
  if (type === "agent") {
    const shape = objectWith(action, path, { required: ["type", "prompt"] });
    if (!shape.ok) return shape;
    return stringField(action, "prompt", path);
  }
  return fail(joinPath(path, "type"), 'must be "command" or "agent"');
}

function validateOneHook(hook: unknown, path: string): Check {
  const shape = objectWith(hook, path, {
    required: ["name", "trigger", "action"],
    optional: ["description", "matcher", "timeout", "enabled", "confirm"],
  });
  if (!shape.ok) return shape;
  const h = hook as Record<string, unknown>;
  const trigger = h["trigger"];
  const triggerCheck: Check =
    typeof trigger !== "string"
      ? fail(joinPath(path, "trigger"), "must be a string")
      : (HOOK_TRIGGERS as readonly string[]).includes(trigger)
        ? OK
        : fail(joinPath(path, "trigger"), `unknown trigger "${trigger}"`);
  const matcherCheck: Check = (() => {
    const s = stringField(h, "matcher", path);
    if (!s.ok || !Object.prototype.hasOwnProperty.call(h, "matcher")) return s;
    try {
      new RegExp(h["matcher"] as string);
      return OK;
    } catch {
      return fail(joinPath(path, "matcher"), "does not compile as a regular expression");
    }
  })();
  return firstFailure(
    stringField(h, "name", path),
    triggerCheck,
    stringField(h, "description", path),
    matcherCheck,
    numberField(h, "timeout", path),
    boolField(h, "enabled", path),
    boolField(h, "confirm", path),
    validateAction(h["action"], joinPath(path, "action")),
  );
}

/** Validates the text of a `.kiro/hooks/<id>.json` file (JSON v1). Pure and total. */
export function validateHookFile(text: string): Check {
  try {
    const parsed = parseJson(text);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const root = parsed.value;
    const shape = objectWith(root, "", { required: ["version", "hooks"] });
    if (!shape.ok) return shape;
    const r = root as Record<string, unknown>;
    if (r["version"] !== "v1") return fail("version", 'must be "v1"');
    if (Array.isArray(r["hooks"]) && r["hooks"].length === 0) return fail("hooks", "must contain at least one hook");
    return arrayOf(r["hooks"], "hooks", validateOneHook);
  } catch {
    return fail("", "could not be validated");
  }
}
