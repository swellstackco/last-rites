// DOM harness: mounts the whole page in jsdom with a fake fetch, fake timers and a fake clock.
// No network, no real timers armed by the page, no Node built-ins (tests read their own fixtures).
import { createApiClient } from "../api/client.js";
import { createController } from "../app/controller.js";
import { DEMO_REPOS } from "../model/demo-repos.js";
import type { Controller } from "../app/controller.js";
import { createFakeFetch } from "./fake-fetch.js";
import type { FakeFetch, FakeHandler } from "./fake-fetch.js";
import { createFakeTimers } from "./fake-timers.js";
import type { FakeTimers } from "./fake-timers.js";

export interface MountOptions {
  /** The location hash to start at, for example "#/demo/parse-server?pkg=ldapjs". Default "". */
  route?: string;
  /** Routes for the fake fetch, keyed "METHOD /path". */
  fetchRoutes?: Record<string, FakeHandler>;
  /** Fake clock start in ms. Default 0. */
  now?: number;
  /** Start the controller right away. Default true. */
  start?: boolean;
}

export interface Page {
  controller: Controller;
  fake: FakeFetch;
  timers: FakeTimers;
  document: Document;
  appRoot: HTMLElement;
  dialogRoot: HTMLElement;
  /** Current hash and the history stack (oldest first). */
  hash(): string;
  history(): readonly string[];
  /** Every element that received focus, in order. */
  focusLog: HTMLElement[];
  active(): Element | null;
  tab(): void;
  shiftTab(): void;
  press(key: string): void;
  click(el: Element): void;
  /** Elements by role (explicit or implicit) and optional accessible-name substring. */
  byRole(role: string, name?: string): HTMLElement[];
  /** Lets the page's promises settle (fake fetch, Response.text, controller). */
  flush(): Promise<void>;
  /** Sets the hash from outside, like the user editing the address bar, and notifies the page. */
  navigateTo(hash: string): void;
  destroy(): void;
}

const IMPLICIT: Record<string, string> = {
  button: 'button, [role="button"]',
  link: "a[href]",
  heading: "h1, h2, h3, h4, h5, h6",
  table: "table",
  list: "ul, ol",
  listitem: "li",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]';

function accessibleName(el: Element): string {
  return el.getAttribute("aria-label") ?? el.textContent ?? "";
}

function isTabbable(el: HTMLElement): boolean {
  const tabindex = el.getAttribute("tabindex");
  if (tabindex !== null && Number(tabindex) < 0) return false;
  if (el.closest("[hidden]")) return false;
  if (el.closest("[inert]")) return false;
  return true;
}

export function mountPage(options: MountOptions = {}): Page {
  const doc = document;
  doc.body.replaceChildren();
  doc.title = "";
  const appRoot = doc.createElement("div");
  appRoot.id = "app-root";
  const dialogRoot = doc.createElement("div");
  dialogRoot.id = "dialog-root";
  doc.body.append(appRoot, dialogRoot);

  const demoNames = new Set(DEMO_REPOS.map((d) => d.name));
  const fake = createFakeFetch(options.fetchRoutes ?? {}, (call) => {
    if (call.method !== "GET") return undefined;
    // Opening any package now requests its proof: an unregistered proof route is "no report" (404), not a failure.
    if (call.url.includes("/demo/proofs/")) return { status: 404, body: "not found" };
    // The picker reads the four demo snapshots for their dead counts: unregistered, they are not available (404).
    const demo = /^\/(?:api\/demo\/([^/]+)|demo\/([^/]+)\.json)$/.exec(call.url);
    const name = demo?.[1] ?? demo?.[2];
    return name !== undefined && demoNames.has(name) ? { status: 404, body: "not found" } : undefined;
  });
  const timers = createFakeTimers();
  const startAt = options.now ?? 0;
  const clock = { now: () => startAt + timers.now() };

  let hash = options.route ?? "";
  const stack: string[] = [hash];
  let controller!: Controller;

  const api = createApiClient({
    fetch: fake.fetch,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });

  controller = createController({
    api,
    io: {
      getHash: () => hash,
      setHash: (next) => {
        hash = next;
        stack.push(next);
      },
      replaceHash: (next) => {
        hash = next;
        stack[stack.length - 1] = next;
      },
      back: () => {
        if (stack.length > 1) {
          stack.pop();
          hash = stack[stack.length - 1] as string;
          controller.onHashChange();
        }
      },
    },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    clock,
    appRoot,
    dialogRoot,
    document: doc,
    logError: () => {},
  });

  const focusLog: HTMLElement[] = [];
  const onFocusIn = (event: Event): void => {
    if (event.target instanceof HTMLElement) focusLog.push(event.target);
  };
  doc.addEventListener("focusin", onFocusIn);

  const tabbables = (): HTMLElement[] =>
    Array.from(doc.body.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isTabbable);

  const defaultTab = (backwards: boolean): void => {
    const items = tabbables();
    if (items.length === 0) return;
    const idx = items.findIndex((el) => el === doc.activeElement);
    let next: number;
    if (idx === -1) {
      // Focus is on a non-tabbable element (such as a heading with tabindex -1) or the body:
      // continue from its position in the document.
      const from = doc.activeElement;
      if (from && from !== doc.body) {
        const after = items.findIndex((el) => Boolean(from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
        if (backwards) next = (after === -1 ? items.length : after) - 1;
        else next = after === -1 ? 0 : after;
      } else {
        next = backwards ? items.length - 1 : 0;
      }
    } else {
      next = backwards ? idx - 1 : idx + 1;
    }
    const target = items[(next + items.length) % items.length];
    target?.focus();
  };

  const press = (key: string, shiftKey = false): void => {
    const target = (doc.activeElement as HTMLElement | null) ?? doc.body;
    const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
    const proceed = target.dispatchEvent(event);
    if (!proceed) return;
    if (key === "Tab") {
      defaultTab(shiftKey);
      return;
    }
    // Default actions of native controls that jsdom does not perform.
    const nativeActivatable = target.tagName === "BUTTON" || target.tagName === "A" || target.tagName === "SUMMARY";
    if (!nativeActivatable) return;
    if (key === "Enter") target.click();
    else if (key === " ") {
      target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
      target.click();
    }
  };

  const page: Page = {
    controller,
    fake,
    timers,
    document: doc,
    appRoot,
    dialogRoot,
    hash: () => hash,
    history: () => stack,
    focusLog,
    active: () => doc.activeElement,
    tab: () => press("Tab"),
    shiftTab: () => press("Tab", true),
    press: (key) => press(key),
    click: (el) => (el as HTMLElement).click(),
    byRole(role, name) {
      const selector = `${IMPLICIT[role] ?? ""}${IMPLICIT[role] ? ", " : ""}[role="${role}"]`;
      return Array.from(doc.body.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => !el.closest("[hidden]") && (name === undefined || accessibleName(el).includes(name)),
      );
    },
    async flush() {
      for (let i = 0; i < 8; i++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    },
    navigateTo(next) {
      hash = next;
      stack.push(next);
      controller.onHashChange();
    },
    destroy() {
      doc.removeEventListener("focusin", onFocusIn);
      controller.destroy();
      doc.body.replaceChildren();
    },
  };

  if (options.start !== false) controller.start();
  return page;
}
