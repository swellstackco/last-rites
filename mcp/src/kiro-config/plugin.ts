import {
  OK,
  type Check,
  arrayOf,
  fail,
  firstFailure,
  isKebab,
  isSemver,
  joinPath,
  objectWith,
  parseJson,
  stringField,
  stringItem,
} from "./helpers.js";

export const PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

/** Validates the text of the Power's `plugin.json`. Pure and total. */
export function validatePluginManifest(text: string): Check {
  try {
    const parsed = parseJson(text);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const shape = objectWith(parsed.value, "", {
      required: ["$schema", "name", "version", "description", "author", "keywords"],
      optional: ["homepage", "repository", "license"],
    });
    if (!shape.ok) return shape;
    const p = parsed.value as Record<string, unknown>;
    const name = p["name"];
    const version = p["version"];
    const author = p["author"];
    const authorCheck = objectWith(author, "author", { required: ["name"], optional: ["email", "url"] });
    return firstFailure(
      stringField(p, "$schema", ""),
      stringField(p, "name", ""),
      typeof name === "string" && !isKebab(name) ? fail("name", "must be kebab-case") : OK,
      stringField(p, "version", ""),
      typeof version === "string" && !isSemver(version) ? fail("version", "must be a semantic version like 1.2.3") : OK,
      stringField(p, "description", ""),
      authorCheck,
      authorCheck.ok
        ? firstFailure(
            stringField(author as Record<string, unknown>, "name", "author"),
            stringField(author as Record<string, unknown>, "email", "author"),
            stringField(author as Record<string, unknown>, "url", "author"),
          )
        : OK,
      arrayOf(p["keywords"], joinPath("", "keywords"), stringItem),
      stringField(p, "homepage", ""),
      stringField(p, "repository", ""),
      stringField(p, "license", ""),
    );
  } catch {
    return fail("", "could not be validated");
  }
}
