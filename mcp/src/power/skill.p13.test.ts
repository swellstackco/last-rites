import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { assertProperty } from "../test-support/fc-runner.js";
import { assertAllSabotagesCaught, type NamedProperty } from "../test-support/sabotage-runner.js";
import { REAL_SKILL_GEN, type SkillGen } from "../test-support/validators.js";
import { KIRO_P13_SABOTAGES } from "../test-support/sabotage/kiro-p13.js";
import { validateSkill } from "../kiro-config/index.js";

const nameArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}[a-z0-9]$/);
const descArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 .,'-]{0,60}[A-Za-z0-9.]$/);
const fmLine = fc.constantFrom("inclusion: fileMatch", 'fileMatchPattern: ["apps/**"]', "name: other", "description: other", "inclusion: always", "  - item");
const frontmatter = fc.array(fmLine, { maxLength: 4 });
const firstLine = fc.stringMatching(/^[a-z][a-z .]{0,30}$/);
const otherLine = fc.oneof(
  { weight: 2, arbitrary: fc.constant("---") },
  { weight: 1, arbitrary: fc.constant("") },
  { weight: 4, arbitrary: fc.stringMatching(/^[ -~]{0,60}$/) },
);
const longLine = fc.string({ minLength: 4001, maxLength: 4100, unit: fc.constantFrom("a", "b", " ") });
const bodyLines = fc
  .tuple(firstLine, fc.array(otherLine, { maxLength: 150 }), fc.option(longLine, { nil: undefined, freq: 5 }))
  .map(([first, rest, long]) => [first, ...rest, ...(long === undefined ? [] : [long])]);
const eol = fc.constantFrom("\n", "\r\n");

export const name = "Property 13: Skill generation";

export function build(impl: SkillGen) {
  return fc.property(nameArb, descArb, frontmatter, fc.boolean(), fc.boolean(), bodyLines, eol, (n, d, fm, hasFm, blank, body, nl) => {
    const meta = { name: n, description: d };
    const lines = hasFm ? ["---", ...fm, "---", ...(blank ? [""] : []), ...body] : body;
    // A text without frontmatter must not look like it has one (the first body line starts with a letter, so it does not).
    const steering = lines.join(nl);
    const out = impl.skillFromSteering(steering, meta);

    const head = `---\nname: ${n}\ndescription: ${d}\n---\n\n`;
    if (!out.startsWith(head)) throw new Error(`output does not start with the exact frontmatter: ${JSON.stringify(out.slice(0, 120))}`);
    const expectedBody = body.join("\n");
    if (out.slice(head.length) !== expectedBody) throw new Error("text after the frontmatter is not the steering body");
    if (out.includes("\r")) throw new Error("output contains CR");
    const v = validateSkill(out, n);
    if (!v.ok) throw new Error(`output fails validateSkill: ${v.error.path}: ${v.error.message}`);
    const twice = impl.skillFromSteering(out, meta);
    if (twice !== out) throw new Error("not idempotent on its own output");
    return true;
  });
}

export const property13: NamedProperty<SkillGen> = { name, build };

describe("Property 13: Skill generation", () => {
  it("holds for the real generator", () => {
    assertProperty(name, build(REAL_SKILL_GEN));
  });

  it("every sabotage is caught", () => {
    expect(KIRO_P13_SABOTAGES.length).toBeGreaterThan(0);
    assertAllSabotagesCaught(name, [property13], KIRO_P13_SABOTAGES);
  });
});

describe("skillFromSteering: examples", () => {
  const meta = { name: "x-rules", description: "Use when testing." };
  it("removes the frontmatter and one blank line", () => {
    expect(REAL_SKILL_GEN.skillFromSteering("---\ninclusion: always\n---\n\n# T\n---\nmore\n", meta)).toBe(
      "---\nname: x-rules\ndescription: Use when testing.\n---\n\n# T\n---\nmore\n",
    );
  });
  it("keeps the whole text without frontmatter and handles CRLF", () => {
    expect(REAL_SKILL_GEN.skillFromSteering("# T\r\nbody", meta)).toBe("---\nname: x-rules\ndescription: Use when testing.\n---\n\n# T\nbody");
  });
});
