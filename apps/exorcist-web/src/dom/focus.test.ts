// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { focusableWithin, restoreFocus, setInertAround, trapTab } from "./focus.js";

function tab(shift = false): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, cancelable: true, bubbles: true });
}

let panel: HTMLElement;
let a: HTMLButtonElement;
let b: HTMLButtonElement;
let c: HTMLButtonElement;

beforeEach(() => {
  document.body.innerHTML = `<div id="panel"><button id="a">a</button><button id="skip" tabindex="-1">s</button><button id="b">b</button><button id="c">c</button></div>`;
  panel = document.getElementById("panel") as HTMLElement;
  a = document.getElementById("a") as HTMLButtonElement;
  b = document.getElementById("b") as HTMLButtonElement;
  c = document.getElementById("c") as HTMLButtonElement;
});

describe("focus", () => {
  it("ignores tabindex=-1", () => {
    expect(focusableWithin(panel).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("wraps from last to first", () => {
    c.focus();
    const ev = tab();
    expect(trapTab(panel, ev)).toBe(true);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(a);
  });

  it("wraps from first to last on Shift+Tab", () => {
    a.focus();
    const ev = tab(true);
    expect(trapTab(panel, ev)).toBe(true);
    expect(document.activeElement).toBe(c);
  });

  it("leaves middle moves to the browser", () => {
    b.focus();
    expect(trapTab(panel, tab())).toBe(false);
  });

  it("ignores removed nodes", () => {
    c.remove();
    b.focus();
    const ev = tab();
    expect(trapTab(panel, ev)).toBe(true);
    expect(document.activeElement).toBe(a);
  });

  it("sets and clears inert", () => {
    setInertAround(panel, true);
    expect(panel.hasAttribute("inert")).toBe(true);
    expect(panel.getAttribute("aria-hidden")).toBe("true");
    setInertAround(panel, false);
    expect(panel.hasAttribute("inert")).toBe(false);
    expect(panel.hasAttribute("aria-hidden")).toBe(false);
  });

  it("restoreFocus skips disconnected candidates", () => {
    const gone = document.createElement("button");
    expect(restoreFocus([gone, null, b])).toBe(b);
    expect(document.activeElement).toBe(b);
    expect(restoreFocus([gone])).toBeUndefined();
  });
});
