/**
 * Turns a steering file into a Kiro skill file (Requirement 15.5). Pure and total.
 *
 * Output: a frontmatter block of exactly `name` and `description`, a blank line, then the steering body. The body is
 * the steering text without its leading `---` ... `---` block (only the first closing `---` line ends it, so later
 * `---` lines in the body stay). One leading blank line after the removed block is dropped. Line endings become LF.
 * A text with no (closed) frontmatter block keeps its whole text as the body.
 */
export function skillFromSteering(steering: string, meta: { name: string; description: string }): string {
  const lines = steering.replace(/\r\n/g, "\n").split("\n");
  let body = lines;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end !== -1) {
      body = lines.slice(end + 1);
      if (body[0] === "") body = body.slice(1);
    }
  }
  return `---\nname: ${meta.name}\ndescription: ${meta.description}\n---\n\n${body.join("\n")}`;
}
