import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FONTS_DIR = new URL("../public/fonts/", import.meta.url);
const README = readFileSync(new URL("README.md", FONTS_DIR), "utf8");
const FONT_CSS = readFileSync(new URL("./styles/fonts.css", import.meta.url), "utf8");

const woff2Files = readdirSync(FONTS_DIR).filter((f) => f.endsWith(".woff2")).sort();

describe("font files", () => {
  it("has the seven expected woff2 files, each starting with the wOF2 signature", () => {
    expect(woff2Files).toEqual([
      "barlow-condensed-latin-600-normal.woff2",
      "barlow-condensed-latin-700-normal.woff2",
      "ibm-plex-mono-latin-400-normal.woff2",
      "ibm-plex-mono-latin-600-normal.woff2",
      "ibm-plex-sans-latin-400-normal.woff2",
      "ibm-plex-sans-latin-600-normal.woff2",
      "special-elite-latin-400-normal.woff2",
    ]);
    for (const f of woff2Files) {
      const bytes = readFileSync(new URL(f, FONTS_DIR));
      expect(bytes.subarray(0, 4).toString("latin1"), f).toBe("wOF2");
    }
  });

  it("README lists exactly the woff2 files present, with matching SHA-256", () => {
    const rows = [...README.matchAll(/^\| `([^`]+\.woff2)` \|.*\| `([0-9a-f]{64})` \|$/gm)];
    expect(rows.map((r) => r[1]).sort()).toEqual(woff2Files);
    for (const [, file, sha] of rows) {
      const actual = createHash("sha256").update(readFileSync(new URL(file!, FONTS_DIR))).digest("hex");
      expect(actual, file).toBe(sha);
    }
  });

  it("README states which license applies to which family", () => {
    expect(README).toMatch(/Special Elite is Apache-2\.0/);
    expect(README).toMatch(/SIL OFL 1\.1/);
  });

  it("has the four license files, non-empty and naming the right license", () => {
    const expected: Array<[string, RegExp]> = [
      ["OFL-Barlow-Condensed.txt", /SIL OPEN FONT LICENSE/],
      ["OFL-IBM-Plex-Sans.txt", /SIL OPEN FONT LICENSE/],
      ["OFL-IBM-Plex-Mono.txt", /SIL OPEN FONT LICENSE/],
      ["Apache-2.0-Special-Elite.txt", /Apache License/],
    ];
    for (const [file, pattern] of expected) {
      const url = new URL(`licenses/${file}`, FONTS_DIR);
      expect(existsSync(url), file).toBe(true);
      const text = readFileSync(url, "utf8");
      expect(text.length, file).toBeGreaterThan(0);
      expect(text, file).toMatch(pattern);
    }
    expect(readFileSync(new URL("licenses/OFL-Barlow-Condensed.txt", FONTS_DIR), "utf8")).toContain(
      "The Barlow Project Authors",
    );
    expect(readFileSync(new URL("licenses/OFL-IBM-Plex-Sans.txt", FONTS_DIR), "utf8")).toContain("IBM Corp.");
    expect(readFileSync(new URL("licenses/OFL-IBM-Plex-Mono.txt", FONTS_DIR), "utf8")).toContain("IBM Corp.");
    expect(readFileSync(new URL("licenses/Apache-2.0-Special-Elite.txt", FONTS_DIR), "utf8")).toContain(
      "Copyright (c) 2010 by Brian J. Bonislawsky DBA Astigmatic (AOETI)",
    );
  });

  it("keeps the woff2 total at or below 300 KB", () => {
    const total = woff2Files.reduce((n, f) => n + statSync(new URL(f, FONTS_DIR)).size, 0);
    expect(total).toBeLessThanOrEqual(300 * 1024);
  });
});

describe("fonts.css", () => {
  const urls = [...FONT_CSS.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1]!.trim().replace(/^["']|["']$/g, ""));
  const blocks = [...FONT_CSS.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1]!);

  it("has seven @font-face rules", () => {
    expect(blocks).toHaveLength(7);
    expect(urls).toHaveLength(7);
  });

  it("points every url() at an existing file under /fonts/", () => {
    for (const u of urls) {
      expect(u, u).toMatch(/^\/fonts\/[a-z0-9-]+\.woff2$/);
      expect(existsSync(new URL(u.slice(1), new URL("../public/", import.meta.url))), u).toBe(true);
    }
  });

  it("uses font-display: swap, a woff2 format and a Latin unicode-range in every rule", () => {
    for (const b of blocks) {
      expect(b).toMatch(/font-display:\s*swap\s*;/);
      expect(b).toMatch(/format\("woff2"\)/);
      expect(b).toMatch(/unicode-range:\s*U\+0000-00FF/);
    }
  });

  it("loads nothing remote and imports nothing", () => {
    expect(FONT_CSS).not.toMatch(/https?:/);
    expect(FONT_CSS).not.toMatch(/url\(\s*["']?\/\//);
    expect(FONT_CSS).not.toMatch(/@import/);
  });

  it("declares exactly the four family names", () => {
    const families = new Set([...FONT_CSS.matchAll(/font-family:\s*"([^"]+)"/g)].map((m) => m[1]));
    expect([...families].sort()).toEqual(["Barlow Condensed", "IBM Plex Mono", "IBM Plex Sans", "Special Elite"]);
  });

  it("is imported first by main.ts", () => {
    const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
    const firstImport = /^import\s+"([^"]+\.css)";/m.exec(main);
    expect(firstImport?.[1]).toBe("./styles/fonts.css");
  });
});
