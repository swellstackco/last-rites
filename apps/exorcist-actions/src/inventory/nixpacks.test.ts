import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createNodeSourceFs } from "@last-rites/exorcist-npm/programmatic";
import { inventoryWorkflows } from "./inventory.js";

const REPO = fileURLToPath(new URL("../__fixtures__/nixpacks/repo", import.meta.url));
const WORKFLOWS = ".github/workflows";

/** Independent, line-based counter: every `uses: <value>` line, value cut at `@`. No YAML parsing. */
function countByLines(files: Record<string, string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const text of Object.values(files)) {
    for (const line of text.split("\n")) {
      const m = /^\s*(?:-\s+)?uses:\s*([^\s#]+)/.exec(line);
      if (!m) continue;
      const name = m[1]!.slice(0, m[1]!.indexOf("@"));
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return counts;
}

describe("inventory of railwayapp/nixpacks at 144b4f9", () => {
  it("finds the recorded uses and counts every action like the line-based counter", async () => {
    const fs = createNodeSourceFs();
    const entries = (await fs.readDir(`${REPO}/${WORKFLOWS}`)) ?? [];
    expect(entries.filter((e) => e.kind === "file")).toHaveLength(7);
    const files: Record<string, string> = {};
    for (const e of entries) files[e.name] = await readFile(`${REPO}/${WORKFLOWS}/${e.name}`, "utf8");

    const r = await inventoryWorkflows(fs, REPO);
    expect(r.warnings).toEqual([]);
    expect(r.skipped).toEqual([]);
    expect(r.filesRead).toBe(7);

    const actual = new Map<string, number>();
    for (const u of r.uses) {
      const name = `${u.owner}/${u.repo}`;
      actual.set(name, (actual.get(name) ?? 0) + 1);
    }
    expect(actual.get("actions-rs/toolchain")).toBe(6);
    expect(actual.get("actions-rs/cargo")).toBe(7);
    const expected = countByLines(files);
    expect([...actual].sort()).toEqual([...expected].sort());
    expect(r.uses.length).toBe([...expected.values()].reduce((a, b) => a + b, 0));
  });

  it("reports the first actions-rs/toolchain use of ci.yml at its line and column", async () => {
    const r = await inventoryWorkflows(createNodeSourceFs(), REPO);
    const first = r.uses.find((u) => u.owner === "actions-rs" && u.repo === "toolchain" && u.file === `${WORKFLOWS}/ci.yml`);
    expect(first).toBeDefined();
    const text = await readFile(`${REPO}/${WORKFLOWS}/ci.yml`, "utf8");
    const lines = text.split("\n");
    const lineIndex = lines.findIndex((l) => l.includes("uses: actions-rs/toolchain@"));
    const column = lines[lineIndex]!.indexOf("actions-rs/toolchain@") + 1;
    expect(first).toMatchObject({ line: lineIndex + 1, column, ref: "v1", refKind: "mutable", site: "step" });
    expect(text.slice(first!.offset, first!.offset + first!.length)).toBe("actions-rs/toolchain@v1");
  });
});
