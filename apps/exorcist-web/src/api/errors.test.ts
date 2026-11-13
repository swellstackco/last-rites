import { describe, expect, it } from "vitest";
import { describeError, KNOWN_ERROR_CODES, parseRetryAfter, type KnownErrorCode } from "./errors.js";

const body = (code: string, message = "server says no") => ({ error: { code, message } });

const STATUS: Record<KnownErrorCode, number> = {
  invalid_repo: 400,
  invalid_ref: 400,
  invalid_input: 400,
  no_package_json: 404,
  malformed_package_json: 422,
  invalid_package_json_shape: 422,
  too_many_dependencies: 422,
  repo_fetch_failed: 502,
  scan_timeout: 504,
  internal_error: 500,
  rate_limited: 429,
  unsupported_media_type: 415,
  body_too_large: 413,
  invalid_demo_name: 400,
  demo_not_found: 404,
  not_found: 404,
  method_not_allowed: 405,
};

const RETRYABLE: Record<KnownErrorCode, boolean> = {
  invalid_repo: false,
  invalid_ref: false,
  invalid_input: false,
  no_package_json: false,
  malformed_package_json: false,
  invalid_package_json_shape: false,
  too_many_dependencies: false,
  repo_fetch_failed: true,
  scan_timeout: true,
  internal_error: true,
  rate_limited: true,
  unsupported_media_type: true,
  body_too_large: true,
  invalid_demo_name: false,
  demo_not_found: false,
  not_found: true,
  method_not_allowed: true,
};

describe("describeError: documented codes", () => {
  it.each(KNOWN_ERROR_CODES)("%s", (code) => {
    const e = describeError({ status: STATUS[code], body: body(code), retryAfterHeader: "5" });
    expect(e.code).toBe(code);
    expect(e.title.length).toBeGreaterThan(0);
    expect(e.detail.length).toBeGreaterThan(0);
    expect(e.retryable).toBe(RETRYABLE[code]);
    expect(e.serverMessage).toBe("server says no");
    expect(e.retryAfterSeconds !== undefined).toBe(code === "rate_limited");
  });

  it("gives distinct titles to the codes that need distinct ones", () => {
    const titles = ["invalid_repo", "invalid_ref", "no_package_json", "scan_timeout", "rate_limited"].map(
      (c) => describeError({ status: 400, body: body(c) }).title,
    );
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("describeError: retry-after", () => {
  it.each([
    ["42", 42],
    ["0", 60],
    ["-5", 60],
    ["abc", 60],
    ["99999", 3600],
    ["1.5", 60],
    [null, 60],
    [undefined, 60],
  ])("header %j gives %j", (header, expected) => {
    const e = describeError({ status: 429, body: body("rate_limited"), retryAfterHeader: header as string | null });
    expect(e.retryAfterSeconds).toBe(expected);
    expect(e.detail).toContain(`${expected} seconds`);
  });

  it("a 429 with no readable body is still rate_limited", () => {
    const e = describeError({ status: 429, body: null, retryAfterHeader: "7" });
    expect(e.code).toBe("rate_limited");
    expect(e.retryAfterSeconds).toBe(7);
  });

  it("parseRetryAfter handles non-strings", () => {
    expect(parseRetryAfter(5)).toBe(60);
  });
});

describe("describeError: odd bodies", () => {
  it.each([
    ["null", null],
    ["array", [1, 2]],
    ["1 MB string", "x".repeat(1_000_000)],
    ["number", 7],
    ["error not object", { error: "nope" }],
    ["error code number", { error: { code: 5, message: 6 } }],
  ])("%s on a 500 gives bad_response", (_n, b) => {
    const e = describeError({ status: 500, body: b });
    expect(e.code).toBe("bad_response");
    expect(e.title).not.toBe("");
    expect(e.detail).not.toBe("");
    expect(e.serverMessage).toBeUndefined();
  });

  it("unknown code gives unknown_error with the status", () => {
    const e = describeError({ status: 418, body: body("teapot") });
    expect(e.code).toBe("unknown_error");
    expect(e.detail).toContain("418");
  });

  it("prototype-ish codes are not documented codes", () => {
    for (const c of ["__proto__", "constructor", "toString"]) {
      expect(describeError({ status: 400, body: body(c) }).code).toBe("unknown_error");
    }
  });

  it("cuts the server message to 300 characters", () => {
    const e = describeError({ status: 500, body: body("internal_error", "m".repeat(5000)) });
    expect(e.serverMessage).toHaveLength(300);
  });

  it("does not throw on a hostile getter body", () => {
    const hostile = {
      get error(): unknown {
        throw new Error("boom");
      },
    };
    const e = describeError({ status: 500, body: hostile });
    expect(e.title).not.toBe("");
    expect(e.detail).not.toBe("");
  });
});

describe("describeError: kinds", () => {
  it("network", () => {
    const e = describeError({ kind: "network" });
    expect(e).toMatchObject({ code: "network_unreachable", retryable: true });
  });

  it("timeout names the seconds", () => {
    const e = describeError({ kind: "timeout", timeoutMs: 75_000 });
    expect(e).toMatchObject({ code: "client_timeout", retryable: true });
    expect(e.detail).toContain("75 seconds");
  });

  it("parse carries the category and path message", () => {
    const e = describeError({ status: 200, kind: "parse", parse: { category: "missing_field", message: "summary.total" } });
    expect(e.code).toBe("bad_response");
    expect(e.parseDetail).toBe("missing_field: summary.total");
  });

  it("a 200 without a parse result is still bad_response", () => {
    expect(describeError({ status: 200, body: "{}" }).code).toBe("bad_response");
  });
});
