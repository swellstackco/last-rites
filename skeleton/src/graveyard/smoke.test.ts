import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));

function sources(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "test-support") continue;
      out.push(...sources(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && entry !== "testing.ts") {
      out.push(full);
    }
  }
  return out;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const FORBIDDEN: [string, RegExp][] = [
  ["document", /\bdocument\b/],
  ["window", /\bwindow\b/],
  ["URL(", /\bURL\(/],
  ["Date", /\bDate\b/],
  ["Math.random", /\bMath\.random\b/],
  ["process", /\bprocess\b/],
  ["fetch", /\bfetch\b/],
  ["import from apps", /from\s+["'][^"']*\bapps\b/],
];

describe("graveyard view model is pure", () => {
  const files = sources(dir);

  it("finds the source files", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const [label, re] of FORBIDDEN) {
    it(`uses no ${label}`, () => {
      const offenders = files.filter((f) => re.test(stripComments(readFileSync(f, "utf8"))));
      expect(offenders).toEqual([]);
    });
  }
});
