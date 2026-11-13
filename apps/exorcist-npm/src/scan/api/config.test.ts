import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { DEFAULT_SCAN_API_CONFIG, ScanApiConfigError, parsePortEnv, validateScanApiConfig } from "./config.js";
import type { ScanApiConfig } from "./config.js";
import { assertProperty } from "../../evidence/test-support/fc-runner.js";

const cfg = (patch: Partial<ScanApiConfig>): ScanApiConfig => ({ ...DEFAULT_SCAN_API_CONFIG, ...patch });

describe("DEFAULT_SCAN_API_CONFIG", () => {
  it("has the documented defaults", () => {
    const c = DEFAULT_SCAN_API_CONFIG;
    expect(c.port).toBe(24817);
    expect(c.scanRateLimit).toEqual({ limit: 10, windowSeconds: 60 });
    expect(c.demoRateLimit).toEqual({ limit: 120, windowSeconds: 60 });
    expect(c.timeoutSeconds).toBe(60);
    expect(c.trustProxy).toBe(false);
    expect(c.maxDependencies).toBe(300);
    expect(c.demoDir.endsWith("/demo/")).toBe(true);
    expect(() => validateScanApiConfig(c)).not.toThrow();
  });
});

describe("validateScanApiConfig", () => {
  const cases: Array<[string, Partial<ScanApiConfig>]> = [
    ["port", { port: 0 }],
    ["port", { port: 65536 }],
    ["port", { port: 80.5 }],
    ["scanRateLimit.limit", { scanRateLimit: { limit: 0, windowSeconds: 60 } }],
    ["scanRateLimit.windowSeconds", { scanRateLimit: { limit: 1, windowSeconds: Number.NaN } }],
    ["demoRateLimit.limit", { demoRateLimit: { limit: -1, windowSeconds: 60 } }],
    ["demoRateLimit.windowSeconds", { demoRateLimit: { limit: 1, windowSeconds: Infinity } }],
    ["timeoutSeconds", { timeoutSeconds: 0 }],
    ["maxDependencies", { maxDependencies: 1.5 }],
    ["maxDependencies", { maxDependencies: 0 }],
  ];
  it.each(cases)("names %s", (field, patch) => {
    expect(() => validateScanApiConfig(cfg(patch))).toThrow(ScanApiConfigError);
    expect(() => validateScanApiConfig(cfg(patch))).toThrow(field);
  });
});

describe("parsePortEnv", () => {
  it("defaults for undefined and empty", () => {
    expect(parsePortEnv(undefined)).toBe(24817);
    expect(parsePortEnv("")).toBe(24817);
  });
  it.each([" 80", "+80", "80.0", "8e1", "0", "65536", "123456", "-1", "abc"])("rejects %j", (raw) => {
    expect(() => parsePortEnv(raw)).toThrow(ScanApiConfigError);
    expect(() => parsePortEnv(raw)).toThrow("PORT");
  });
  it.each([["1", 1], ["80", 80], ["0080", 80], ["65535", 65535]] as const)("accepts %j", (raw, n) => {
    expect(parsePortEnv(raw)).toBe(n);
  });

  it("property: accepts exactly digit strings with value 1 to 65535", () => {
    assertProperty(
      "parsePortEnv",
      fc.property(
        fc.oneof(
          fc.string({ maxLength: 8 }).filter((s) => s !== ""),
          fc.stringOf(fc.constantFrom(..."0123456789".split("")), { minLength: 1, maxLength: 7 }),
          fc.integer({ min: 0, max: 70000 }).map(String),
        ),
        (raw) => {
          const shouldAccept = /^[0-9]{1,5}$/.test(raw) && Number(raw) >= 1 && Number(raw) <= 65535;
          let result: number | undefined;
          try {
            result = parsePortEnv(raw);
          } catch (e) {
            if (!(e instanceof ScanApiConfigError)) throw e;
          }
          if (shouldAccept !== (result !== undefined)) throw new Error(`${JSON.stringify(raw)}: accept=${shouldAccept}`);
          if (shouldAccept && result !== Number(raw)) throw new Error("wrong value");
        },
      ),
    );
  });
});
