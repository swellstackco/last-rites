import { describe, expect, it } from "vitest";
import { hostOf, safeHttpUrl } from "./safe-url.js";

const HOSTILE = [
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
  "//evil.example/x",
  "/relative/path",
  "relative/path",
  "",
  " https://example.com",
  "\thttps://example.com",
  "\nhttps://example.com",
  "\u0000https://example.com",
  "https://example.com/a\tb",
  "https://example.com/a\nb",
  "https://example.com/a b",
  "https://user@example.com/",
  "https://user:pass@example.com/",
  "https://@example.com/",
  "https://",
  "https:///path",
  "https://example.com\\evil",
  "https://example.com/<script>",
  'https://example.com/"onmouseover=',
  "https://example.com/'x",
  "https://example.com/`x",
  "httpx://example.com",
  "http:/example.com",
  "https:example.com",
];

describe("safeHttpUrl", () => {
  it.each(HOSTILE)("rejects %j", (s) => {
    expect(safeHttpUrl(s)).toBeUndefined();
  });

  it.each([
    "http://example.com",
    "https://example.com",
    "HTTPS://Example.COM/Path",
    "HtTp://example.com/a?b=c#d",
    "https://github.com/o/r/issues?q=is%3Aopen",
    "https://example.com/path/@scope/name",
    "https://example.com?x=a@b",
    "https://example.com#frag@x",
    "https://example.com:8080/x",
  ])("returns %j unchanged", (s) => {
    expect(safeHttpUrl(s)).toBe(s);
  });

  it("returns undefined for non-strings", () => {
    for (const v of [undefined, null, 0, 1, true, {}, [], ["https://a.com"], Symbol("x"), () => 1]) {
      expect(safeHttpUrl(v)).toBeUndefined();
    }
  });

  it("enforces the 2048 character limit", () => {
    const prefix = "https://example.com/";
    const ok = prefix + "a".repeat(2048 - prefix.length);
    expect(ok.length).toBe(2048);
    expect(safeHttpUrl(ok)).toBe(ok);
    expect(safeHttpUrl(ok + "a")).toBeUndefined();
  });
});

describe("hostOf", () => {
  it("returns the host", () => {
    expect(hostOf("https://github.com/o/r")).toBe("github.com");
    expect(hostOf("http://example.com:8080/x")).toBe("example.com:8080");
    expect(hostOf("https://osv.dev?q=1")).toBe("osv.dev");
    expect(hostOf("HTTPS://Example.com#f")).toBe("Example.com");
  });
});
