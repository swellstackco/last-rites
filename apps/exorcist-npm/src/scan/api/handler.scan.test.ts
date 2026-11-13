import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type EvidenceConfig } from "../../evidence/config.js";
import { createFakeClock } from "../../evidence/test-support/fake-clock.js";
import { createFakeSleep } from "../../evidence/test-support/fake-sleep.js";
import { FakeHttp } from "../../evidence/test-support/fake-http.js";
import { serializeReport } from "../report.js";
import type { ScanError } from "../types.js";
import { DEFAULT_SCAN_API_CONFIG, ScanApiConfigError } from "./config.js";
import { createScanApi } from "./handler.js";
import {
  EMPTY_REPORT,
  bodyText,
  errorCode,
  makeHarness,
  manualWatchdog,
  postScan,
} from "../test-support/api-harness.js";

const body = JSON.stringify({ repo: "o/r" });

describe("POST /api/scan outcomes", () => {
  it("returns 200 with the Canonical_Json report", async () => {
    const h = makeHarness();
    const res = await h.handler(postScan(body));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(bodyText(res)).toBe(serializeReport(EMPTY_REPORT));
  });

  it("requires no account or token", async () => {
    const h = makeHarness();
    const res = await h.handler(postScan(body));
    expect(res.status).toBe(200);
  });

  const cases: Array<[ScanError["code"], number]> = [
    ["invalid_repo", 400],
    ["invalid_ref", 400],
    ["no_package_json", 404],
    ["malformed_package_json", 422],
    ["invalid_package_json_shape", 422],
    ["too_many_dependencies", 422],
    ["repo_fetch_failed", 502],
    ["scan_timeout", 504],
    ["internal_error", 500],
  ];
  it.each(cases)("maps %s to %i with the code in the body", async (code, status) => {
    const error: ScanError =
      code === "repo_fetch_failed"
        ? { code, message: "m", failureCategory: "network_error" }
        : ({ code, message: "m" } as ScanError);
    const h = makeHarness({ outcome: { ok: false, error } });
    const res = await h.handler(postScan(body));
    expect(res.status).toBe(status);
    expect(errorCode(res)).toBe(code);
  });

  it("answers 504 scan_timeout when the watchdog fires, aborts the signal and disposes", async () => {
    const wd = manualWatchdog();
    const h = makeHarness({ watchdog: wd.watchdog, outcome: () => new Promise(() => {}) });
    const pending = h.handler(postScan(body));
    await new Promise((r) => setImmediate(r));
    expect(h.pipelineCalls).toHaveLength(1);
    const signal = h.pipelineCalls[0]?.signal as { aborted: boolean };
    expect(signal.aborted).toBe(false);
    wd.fire();
    const res = await pending;
    expect(res.status).toBe(504);
    expect(errorCode(res)).toBe("scan_timeout");
    // Further work is stopped: the cooperative signal is aborted and the watchdog disposed.
    expect(signal.aborted).toBe(true);
    expect(wd.disposed).toBe(1);
  });

  it("answers 500 internal_error when the pipeline rejects", async () => {
    const h = makeHarness({
      outcome: async () => {
        throw new Error("boom");
      },
    });
    const res = await h.handler(postScan(body));
    expect(res.status).toBe(500);
    expect(errorCode(res)).toBe("internal_error");
  });
});

describe("createScanApi config", () => {
  it("rejects a bad config naming the field before anything is built", () => {
    const clock = createFakeClock();
    const http = new FakeHttp({ fixtures: [] });
    const make = () =>
      createScanApi({
        http,
        clock: clock.clock,
        sleep: createFakeSleep(clock).sleep,
        config: { ...DEFAULT_SCAN_API_CONFIG, timeoutSeconds: 0 },
        evidenceConfig: { ...DEFAULT_CONFIG, cacheRoot: "/nonexistent-never-used" } as EvidenceConfig,
      });
    expect(make).toThrow(ScanApiConfigError);
    expect(make).toThrow(/timeoutSeconds/);
    expect(http.requests).toHaveLength(0);
  });
});
