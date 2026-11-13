import { OK, type Check, fail } from "./helpers.js";

/**
 * Validates a `skills/<folderName>/SKILL.md` file: frontmatter with exactly `name` and `description` (both non-empty
 * single-line values), `name` equal to the folder name, and a non-empty body. Pure and total.
 */
export function validateSkill(text: string, folderName: string): Check {
  try {
    if (typeof text !== "string") return fail("", "file content is not text");
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    if (lines[0] !== "---") return fail("frontmatter", "file must start with a --- frontmatter block");
    const end = lines.indexOf("---", 1);
    if (end === -1) return fail("frontmatter", "frontmatter block is not closed with ---");
    const fields = new Map<string, string>();
    for (const line of lines.slice(1, end)) {
      if (line.trim() === "") continue;
      const m = /^([A-Za-z_-]+):[ \t]*(.*)$/.exec(line);
      if (!m) return fail("frontmatter", `line is not "key: value": ${line.slice(0, 60)}`);
      const key = m[1] as string;
      if (key !== "name" && key !== "description") return fail(key, "unknown field");
      if (fields.has(key)) return fail(key, "field appears twice");
      fields.set(key, (m[2] as string).trim());
    }
    for (const key of ["name", "description"]) {
      const v = fields.get(key);
      if (v === undefined) return fail(key, "required field is missing");
      if (v === "") return fail(key, "must not be empty");
    }
    if (fields.get("name") !== folderName) return fail("name", `must equal the folder name "${folderName}"`);
    if (lines.slice(end + 1).join("\n").trim() === "") return fail("body", "body must not be empty");
    return OK;
  } catch {
    return fail("", "could not be validated");
  }
}
