// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { serializeReport } from "@graveyard-kit/exorcist-npm/report";
import { buildReport } from "./test-support/build-report.js";
import { mountPage } from "./test-support/dom-harness.js";
import type { Page } from "./test-support/dom-harness.js";
import type { FakeHandler } from "./test-support/fake-fetch.js";
import { ALIVE_SIGNALS, DYING_SIGNALS } from "./test-support/signals.js";

let page: Page | undefined;
afterEach(() => {
  page?.destroy();
  vi.restoreAllMocks();
});

const dead = { ...DYING_SIGNALS, deprecated: { kind: "known" as const, value: true }, repoArchived: { kind: "known" as const, value: true } };
const ailing = {
  ...DYING_SIGNALS,
  monthsSinceLastCommit: { kind: "known" as const, value: 0 },
  openVulnsNoFix: { kind: "known" as const, value: 0 },
};

const report = buildReport([
  { name: "gone", signals: dead },
  { name: "sick", signals: DYING_SIGNALS },
  { name: "meh", signals: ailing },
  { name: "well", signals: ALIVE_SIGNALS },
  { name: "@scope/pkg", signals: dead },
]);

const NOT_FOUND = { status: 404, body: "not found" };

function mount(route: string, routes: Record<string, FakeHandler> = {}): Page {
  page = mountPage({
    route,
    fetchRoutes: {
      "GET /api/demo/pump": { body: serializeReport(report) },
      "GET /demo/proofs/pump/gone.json": NOT_FOUND,
      "GET /demo/proofs/pump/sick.json": NOT_FOUND,
      ...routes,
    },
  });
  return page;
}

const proofCalls = (p: Page): string[] =>
  p.fake.calls.filter((c) => c.url.includes("/demo/proofs/")).map((c) => `${c.method} ${c.url}`);

async function open(p: Page, key: string): Promise<void> {
  if (!p.document.querySelector(`[data-key="${key}"]`)) {
    p.click(p.document.querySelector<HTMLElement>("[aria-controls='alive-list']") as HTMLElement);
  }
  p.click(p.document.querySelector<HTMLElement>(`[data-key="${key}"]`) as HTMLElement);
  await p.flush();
}

describe("proof requests (controller)", () => {
  it("one request per opened dead or dying package", async () => {
    const p = mount("#/demo/pump");
    await p.flush();
    expect(proofCalls(p)).toEqual([]);
    await open(p, "gone");
    expect(proofCalls(p)).toEqual(["GET /demo/proofs/pump/gone.json"]);
    p.press("Escape");
    await open(p, "sick");
    expect(proofCalls(p)).toEqual(["GET /demo/proofs/pump/gone.json", "GET /demo/proofs/pump/sick.json"]);
    p.fake.assertNoUnexpected();
  });

  it("none for ailing or alive packages", async () => {
    const p = mount("#/demo/pump");
    await p.flush();
    await open(p, "meh");
    p.press("Escape");
    await open(p, "well");
    expect(proofCalls(p)).toEqual([]);
  });

  it("none for a scoped name", async () => {
    const p = mount("#/demo/pump");
    await p.flush();
    await open(p, "@scope/pkg");
    expect(p.dialogRoot.querySelector('[role="dialog"]')?.textContent).toContain("@scope/pkg");
    expect(p.dialogRoot.querySelector("section.proof")?.textContent).toContain("Exorcism coming");
    expect(proofCalls(p)).toEqual([]);
  });

  it("none for a live scan", async () => {
    const p = mount("", {});
    p.fake.on("POST /api/scan", { body: serializeReport(buildReport([{ name: "gone", signals: dead }], { repo: "owner/repo" })) });
    (p.document.getElementById("live-repo") as HTMLInputElement).value = "owner/repo";
    (p.document.querySelector("form.live-form") as HTMLFormElement).dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await p.flush();
    await open(p, "gone");
    expect(p.dialogRoot.querySelector("section.proof")?.textContent).toContain("Exorcism coming");
    expect(proofCalls(p)).toEqual([]);
  });

  it("a second open of the same package makes no new request", async () => {
    const p = mount("#/demo/pump");
    await p.flush();
    await open(p, "gone");
    p.press("Escape");
    await open(p, "gone");
    p.press("Escape");
    await open(p, "gone");
    expect(proofCalls(p)).toEqual(["GET /demo/proofs/pump/gone.json"]);
  });

  it("a second open while the first request is pending makes no new request", async () => {
    const p = mount("#/demo/pump");
    p.fake.hold("GET /demo/proofs/pump/gone.json");
    await p.flush();
    await open(p, "gone");
    p.press("Escape");
    await open(p, "gone");
    expect(proofCalls(p)).toEqual(["GET /demo/proofs/pump/gone.json"]);
  });

  it("a route change aborts a pending request, and a later open asks again", async () => {
    const p = mount("#/demo/pump");
    p.fake.hold("GET /demo/proofs/pump/gone.json");
    await p.flush();
    await open(p, "gone");
    expect(proofCalls(p)).toHaveLength(1);

    const abort = vi.spyOn(AbortController.prototype, "abort");
    p.navigateTo("#/");
    await p.flush();
    expect(abort).toHaveBeenCalled();

    p.fake.on("GET /demo/proofs/pump/gone.json", NOT_FOUND);
    p.navigateTo("#/demo/pump?pkg=gone");
    await p.flush();
    expect(proofCalls(p)).toEqual(["GET /demo/proofs/pump/gone.json", "GET /demo/proofs/pump/gone.json"]);
    expect(p.dialogRoot.querySelector("section.proof")?.textContent).toContain("Exorcism coming");
  });
});
