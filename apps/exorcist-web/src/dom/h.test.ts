// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { constantHref, h, safeHref } from "./h.js";

describe("h", () => {
  it("never parses text as HTML", () => {
    const name = "<img src=x onerror=alert(1)>";
    const el = h("div", null, name);
    expect(el.textContent).toBe(name);
    expect(el.querySelector("img")).toBeNull();
    expect(el.children.length).toBe(0);
  });

  it("sets href only from a SafeHref", () => {
    const ok = safeHref("https://example.com/a");
    expect(ok).toBeDefined();
    const a = h("a", { href: ok }, "x");
    expect(a.getAttribute("href")).toBe("https://example.com/a");
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(() => constantHref("javascript:alert(1)")).toThrow();
    expect(constantHref("#main").length).toBeGreaterThan(0);
  });

  it("rejects unsupported props at type level and at runtime", () => {
    // @ts-expect-error innerHTML is not in the vocabulary
    expect(() => h("div", { innerHTML: "<b>x</b>" })).toThrow(/unsupported/);
    // @ts-expect-error a plain string is not a SafeHref
    h("a", { href: "javascript:alert(1)" });
  });

  it("supports aria, data, boolean attributes and nested children", () => {
    const el = h("button", { "aria-expanded": false, "data-key": "grave-1", disabled: true, class: ["btn", "chip"] }, ["a", null, h("span", null, "b")]);
    expect(el.getAttribute("aria-expanded")).toBe("false");
    expect(el.getAttribute("data-key")).toBe("grave-1");
    expect(el.hasAttribute("disabled")).toBe(true);
    expect(el.className).toBe("btn chip");
    expect(el.textContent).toBe("ab");
  });
});
