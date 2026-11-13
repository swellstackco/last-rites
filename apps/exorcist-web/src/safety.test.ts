// Static safety checks over the page source (Node, no DOM): no HTML injection sinks, no storage,
// a clean index.html, and every href going through SafeHref.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = dirname(fileURLToPath(import.meta.url));
const pkgDir = dirname(srcDir);

function walk(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Page sources: every .ts file under src except test files (which may list the forbidden names). */
const sources = walk(srcDir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((file) => ({ file: relative(srcDir, file), text: stripComments(readFileSync(file, "utf8")) }));

const SINKS: [string, RegExp][] = [
  ["innerHTML", /\binnerHTML\b/],
  ["outerHTML", /\bouterHTML\b/],
  ["insertAdjacentHTML", /\binsertAdjacentHTML\b/],
  ["document.write", /\bdocument\s*\.\s*write(ln)?\s*\(/],
  ["eval(", /\beval\s*\(/],
  ["new Function", /\bnew\s+Function\b/],
  ['setAttribute("on', /setAttribute\(\s*["'`]on/i],
  ["srcdoc", /\bsrcdoc\b/],
];

const STORAGE: [string, RegExp][] = [
  ["localStorage", /\blocalStorage\b/],
  ["sessionStorage", /\bsessionStorage\b/],
  ["indexedDB", /\bindexedDB\b/],
  ["document.cookie", /\bdocument\s*\.\s*cookie\b/],
];

describe("page source safety (static)", () => {
  it("finds the page source files", () => {
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.some((s) => s.file === join("dom", "h.ts"))).toBe(true);
    expect(sources.some((s) => s.file === "main.ts")).toBe(true);
  });

  it("uses no HTML injection sink, eval or inline event attribute", () => {
    const hits = sources.flatMap((s) => SINKS.filter(([, re]) => re.test(s.text)).map(([name]) => `${s.file}: ${name}`));
    expect(hits).toEqual([]);
  });

  it("uses no browser storage and no cookies", () => {
    const hits = sources.flatMap((s) => STORAGE.filter(([, re]) => re.test(s.text)).map(([name]) => `${s.file}: ${name}`));
    expect(hits).toEqual([]);
  });

  it("the detector itself works", () => {
    expect(SINKS.every(([, re]) => !re.test("const a = 1;"))).toBe(true);
    expect(/\binnerHTML\b/.test("el.innerHTML = x")).toBe(true);
    expect(SINKS.find(([n]) => n === 'setAttribute("on')?.[1].test('el.setAttribute("onclick", x)')).toBe(true);
  });

  it("assigns href and src only through SafeHref", () => {
    const direct: string[] = [];
    const unbranded: string[] = [];
    for (const s of sources) {
      if (s.file === join("dom", "h.ts") || s.file.startsWith("test-support")) continue;
      if (/\.\s*(href|src)\s*=[^=]/.test(s.text)) direct.push(`${s.file}: .href/.src assignment`);
      if (/setAttribute\(\s*["'`](href|src|xlink:href|action|formaction)["'`]/.test(s.text)) {
        direct.push(`${s.file}: setAttribute(href/src)`);
      }
      for (const m of s.text.matchAll(/\bhref\s*:\s*([^,}\n]+)/g)) {
        const value = (m[1] ?? "").trim();
        if (!/^(constantHref|safeHref)\(/.test(value) && value !== "href") unbranded.push(`${s.file}: href: ${value}`);
      }
      // Shorthand or variable `href` must come from safeHref().
      if (/\bhref\s*[,}]|href\s*:\s*href\b/.test(s.text) && !/const\s+href\s*=\s*safeHref\(/.test(s.text)) {
        unbranded.push(`${s.file}: shorthand href not from safeHref`);
      }
    }
    expect(direct).toEqual([]);
    expect(unbranded).toEqual([]);

    // h.ts only accepts a SafeHref for href, and only safeHref()/constantHref() produce one.
    const h = sources.find((s) => s.file === join("dom", "h.ts"))?.text ?? "";
    expect(h).toMatch(/href\?:\s*SafeHref/);
    const withoutProducers = h
      .replace(/export function safeHref\([\s\S]*?\n\}/, "")
      .replace(/export function constantHref\([\s\S]*?\n\}/, "");
    expect(withoutProducers).not.toMatch(/\bas\s+SafeHref\b/);
    expect(h).toMatch(/\bas\s+SafeHref\b/); // the producers exist
  });

  describe("index.html", () => {
    const html = readFileSync(join(pkgDir, "index.html"), "utf8");

    it("has no inline script body", () => {
      const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
      expect(scripts.length).toBeGreaterThan(0);
      for (const [, attrs, body] of scripts) {
        expect(attrs).toMatch(/\bsrc="\/src\//);
        expect((body ?? "").trim()).toBe("");
      }
    });

    it("has no style attribute, style element or inline event handler", () => {
      expect(html).not.toMatch(/\sstyle\s*=/i);
      expect(html).not.toMatch(/<style\b/i);
      expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    });

    it("references no remote resource", () => {
      const refs = [...html.matchAll(/\b(?:src|href|action|poster|data)\s*=\s*["']([^"']*)["']/gi)].map((m) => m[1] ?? "");
      for (const ref of refs) expect(ref).not.toMatch(/^(https?:)?\/\//i);
      expect(html).not.toMatch(/url\(\s*["']?(https?:)?\/\//i);
    });
  });
});
