import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { skillFromSteering } from "./skill-from-steering.js";
import { SKILLS } from "./skills.js";

// Script entry of `npm run power:sync -w @graveyard-kit/exorcist-mcp`: steering files -> power/skills/<name>/SKILL.md.
const root = fileURLToPath(new URL("../../../", import.meta.url));
for (const skill of SKILLS) {
  const out = join(root, "power", "skills", skill.name, "SKILL.md");
  const text = skillFromSteering(await readFile(join(root, skill.steering), "utf8"), skill);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, text);
  console.log(`wrote power/skills/${skill.name}/SKILL.md (${text.length} characters)`);
}
