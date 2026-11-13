// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { serializeReport } from "@graveyard-kit/exorcist-npm/report";
import { formatRoute } from "./app/router.js";
import { DEMO_REPOS } from "./model/demo-repos.js";
import { buildReport } from "./test-support/build-report.js";
import { mountPage } from "./test-support/dom-harness.js";
import type { Page } from "./test-support/dom-harness.js";
import type { FakeHandler } from "./test-support/fake-fetch.js";
import { ALIVE_SIGNALS, DYING_SIGNALS } from "./test-support/signals.js";

let page: Page | undefined;
afterEach(() => page?.destroy());

const pumpReport = serializeReport(buildReport([{ name: "sick", signals: DYING_SIGNALS }], { repo: "mafintosh/pump" }));
const jestReport = serializeReport(buildReport([{ name: "well", signals: ALIVE_SIGNALS }], { repo: "jestjs/jest" }));
const liveReport = serializeReport(buildReport([{ name: "well", signals: ALIVE_SIGNALS }], { repo: "owner/repo" }));

const rateLimited: FakeHandler = {
  status: 429,
  headers: { "retry-after": "42" },
  body: { error: { code: "rate_limited", message: "slow down" } },
};

function mount(fetchRoutes: Record<string, FakeHandler> = {}, route = ""): Page {
  page = mountPage({ route, fetchRoutes });
  return page;
}

const scanButton = (p: Page): HTMLElement =>
  p.document.querySelector<HTMLElement>("form.live-form button[type='submit']") as HTMLElement;
const repoField = (p: Page): HTMLInputElement => p.document.getElementById("live-repo") as HTMLInputElement;
const refField = (p: Page): HTMLInputElement => p.document.getElementById("live-ref") as HTMLInputElement;
const h1 = (p: Page): string => p.document.querySelector("h1")?.textContent ?? "";
const announce = (p: Page): HTMLElement => p.document.getElementById("announce") as HTMLElement;

function submitLive(p: Page, repo = "owner/repo", ref = ""): void {
  repoField(p).value = repo;
  refField(p).value = ref;
  const form = p.document.querySelector("form.live-form") as HTMLFormElement;
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

const buttonByText = (p: Page, text: string): HTMLElement | undefined =>
  p.byRole("button").find((b) => b.textContent === text);

describe("rate limit (DOM)", () => {
  it("a 429 shows the seconds, keeps the scan button disabled, leaves demos usable and re-enables at the end", async () => {
    const p = mount({
      "POST /api/scan": rateLimited,
      "GET /api/demo/pump": { body: pumpReport },
    });
    submitLive(p);
    await p.flush();

    // Error screen: seconds are shown, Retry is disabled.
    expect(h1(p)).toBe("Slow down: live scans are limited");
    expect(p.document.querySelector("[data-countdown='error']")?.textContent).toBe("You can scan again in 42 seconds");
    expect(announce(p).textContent).toBe("You can scan again in 42 seconds");
    expect(buttonByText(p, "Retry")?.getAttribute("aria-disabled")).toBe("true");

    // Back to the picker: the scan button stays aria-disabled (and in the tab order), the countdown is visible.
    (buttonByText(p, "Back to repos") as HTMLElement).click();
    expect(scanButton(p).getAttribute("aria-disabled")).toBe("true");
    expect(scanButton(p).hasAttribute("disabled")).toBe(false);
    expect(p.document.querySelector("[data-countdown='live']")?.textContent).toBe("You can scan again in 42 seconds");

    // A submit during the cooldown sends no request.
    const scans = p.fake.calls.filter((c) => c.method === "POST").length;
    submitLive(p);
    await p.flush();
    expect(p.fake.calls.filter((c) => c.method === "POST").length).toBe(scans);

    // A demo card still loads a demo.
    p.click(p.document.querySelector<HTMLElement>("[data-demo='pump']") as HTMLElement);
    await p.flush();
    expect(h1(p)).toBe("The Graveyard: mafintosh/pump");
    expect(p.fake.calls.some((c) => c.method === "GET" && c.url === "/api/demo/pump")).toBe(true);

    // Back on the picker the cooldown is still running.
    p.navigateTo("");
    expect(scanButton(p).getAttribute("aria-disabled")).toBe("true");

    // The status line is not rewritten each second; it is written once at the end.
    const observer = new MutationObserver(() => {});
    observer.observe(announce(p), { childList: true, characterData: true, subtree: true });
    observer.takeRecords();
    // The demo load took no fake time, so all 42 seconds are left.
    p.timers.advance(41_000);
    expect(observer.takeRecords()).toHaveLength(0);
    expect(scanButton(p).getAttribute("aria-disabled")).toBe("true");

    p.timers.advance(1_000);
    const atEnd = observer.takeRecords();
    expect(atEnd).toHaveLength(1);
    expect(announce(p).textContent).toBe("You can scan again now");
    p.timers.advance(60_000);
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();

    expect(scanButton(p).getAttribute("aria-disabled")).toBe("false");
    expect(p.document.querySelector("[data-countdown='live']")?.textContent).toBe("");
    expect(p.timers.pendingCount()).toBe(0);
    p.fake.assertNoUnexpected();
  });

  it("the cooldown counts down in whole seconds without rewriting the status line", async () => {
    const p = mount({ "POST /api/scan": rateLimited });
    submitLive(p);
    await p.flush();
    const observer = new MutationObserver(() => {});
    observer.observe(announce(p), { childList: true, characterData: true, subtree: true });
    p.timers.advance(10_000);
    expect(p.document.querySelector("[data-countdown='error']")?.textContent).toBe("You can scan again in 32 seconds");
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });
});

describe("error states (DOM)", () => {
  it("a network failure shows network_unreachable with Retry and Back to repos", async () => {
    const p = mount({
      "POST /api/scan": () => {
        throw new Error("offline");
      },
    });
    submitLive(p);
    await p.flush();
    expect(h1(p)).toBe("Can't reach the scan service");
    expect(buttonByText(p, "Retry")).toBeDefined();
    expect(buttonByText(p, "Back to repos")).toBeDefined();

    const before = p.fake.calls.length;
    (buttonByText(p, "Retry") as HTMLElement).click();
    await p.flush();
    expect(p.fake.calls.length).toBe(before + 1);
    expect(h1(p)).toBe("Can't reach the scan service");

    (buttonByText(p, "Back to repos") as HTMLElement).click();
    expect(p.controller.phase().tag).toBe("picker");
  });

  it("a garbage 200 shows bad_response and shows nothing from the body", async () => {
    const p = mount({ "POST /api/scan": { body: { hello: "<img src=x onerror=alert(1)>" } } });
    submitLive(p);
    await p.flush();
    expect(h1(p)).toBe("The result couldn't be read");
    expect(p.document.querySelector("img")).toBeNull();
    expect(p.document.body.textContent).not.toContain("onerror");
    expect(buttonByText(p, "Back to repos")).toBeDefined();
  });
});

describe("cancel and superseded requests (DOM)", () => {
  it("Cancel returns to the picker with the typed values kept, and a late response changes nothing", async () => {
    const p = mount();
    const held = p.fake.hold("POST /api/scan");
    submitLive(p, "owner/repo", "dev");
    await p.flush();
    expect(p.controller.phase().tag).toBe("loading");
    expect(h1(p)).toBe("Scanning owner/repo");

    (buttonByText(p, "Cancel") as HTMLElement).click();
    expect(p.controller.phase().tag).toBe("picker");
    expect(repoField(p).value).toBe("owner/repo");
    expect(refField(p).value).toBe("dev");

    held.resolve({ body: liveReport });
    await p.flush();
    expect(p.controller.phase().tag).toBe("picker");
    expect(repoField(p).value).toBe("owner/repo");
  });

  it("a slow response that resolves after a newer one does not change the page", async () => {
    const p = mountPage({ route: "#/demo/pump", start: false });
    page = p;
    const slow = p.fake.hold("GET /api/demo/pump");
    p.fake.on("GET /api/demo/jest", { body: jestReport });
    p.controller.start();
    await p.flush();
    expect(p.controller.phase().tag).toBe("loading");

    p.navigateTo("#/demo/jest");
    await p.flush();
    expect(h1(p)).toBe("The Graveyard: jestjs/jest");

    slow.resolve({ body: pumpReport });
    await p.flush();
    expect(h1(p)).toBe("The Graveyard: jestjs/jest");
    expect(p.hash()).toBe("#/demo/jest");
    expect(p.document.querySelector('[data-key="sick"]')).toBeNull();
    expect(p.controller.phase().tag).toBe("report");
  });
});

describe("live routes (DOM)", () => {
  it("a #/live?... load makes no request and shows the prefilled form with the message", async () => {
    const hash = formatRoute({ view: "live", repo: "owner/repo", ref: "dev" });
    const p = mount({}, hash);
    await p.flush();
    // No scan is started. The only requests are the picker's reads of the four demo snapshots (dead counts).
    const names = DEMO_REPOS.map((d) => d.name);
    expect(p.fake.calls.every((c) => c.method === "GET" && names.some((n) => c.url === `/api/demo/${n}` || c.url === `/demo/${n}.json`))).toBe(true);
    expect(p.fake.calls.some((c) => c.url.includes("/api/scan"))).toBe(false);
    expect(p.controller.phase().tag).toBe("picker");
    expect(repoField(p).value).toBe("owner/repo");
    expect(refField(p).value).toBe("dev");
    expect(p.document.body.textContent).toContain("Live scans are not re-run when a page is reloaded");
  });
});
