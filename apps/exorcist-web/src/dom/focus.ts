// Focus helpers for the Detail_Panel: trap, inert, restore.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Focusable descendants in DOM order, excluding tabindex=-1 and hidden ones. */
export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getAttribute("tabindex") !== "-1" && !el.hasAttribute("hidden") && !el.closest("[hidden]"),
  );
}

/** Handles Tab / Shift+Tab inside `panel` by cycling. Returns true if it handled the event. */
export function trapTab(panel: HTMLElement, event: KeyboardEvent): boolean {
  if (event.key !== "Tab") return false;
  const items = focusableWithin(panel);
  if (items.length === 0) {
    event.preventDefault();
    return true;
  }
  const first = items[0] as HTMLElement;
  const last = items[items.length - 1] as HTMLElement;
  const active = panel.ownerDocument.activeElement;
  const idx = items.findIndex((el) => el === active);
  if (event.shiftKey) {
    if (idx <= 0) {
      event.preventDefault();
      last.focus();
      return true;
    }
  } else if (idx === -1 || idx === items.length - 1) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

/** Marks (or unmarks) an element as inert and hidden from assistive technology. */
export function setInertAround(target: HTMLElement, on: boolean): void {
  if (on) {
    target.setAttribute("inert", "");
    target.setAttribute("aria-hidden", "true");
  } else {
    target.removeAttribute("inert");
    target.removeAttribute("aria-hidden");
  }
}

/** Focuses the first candidate that is still connected. Returns it, or undefined. */
export function restoreFocus(candidates: ReadonlyArray<HTMLElement | null | undefined>): HTMLElement | undefined {
  for (const c of candidates) {
    if (c && c.isConnected) {
      c.focus();
      return c;
    }
  }
  return undefined;
}
