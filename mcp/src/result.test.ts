import { describe, it, expect } from "vitest";
import { ERROR_CODES } from "./errors.js";
import { errorResult, safely, textResult } from "./result.js";

describe("textResult", () => {
  it("has one text item per argument, in order, and no isError", () => {
    const r = textResult("a", "b");
    expect(r.isError).toBeUndefined();
    expect(r.content).toEqual([
      { type: "text", text: "a" },
      { type: "text", text: "b" },
    ]);
  });
});

describe("errorResult", () => {
  it("is isError with exactly one item of the documented JSON shape", () => {
    const r = errorResult("invalid_repo", "bad repo");
    expect(r.isError).toBe(true);
    expect(r.content).toHaveLength(1);
    const first = r.content[0] as { type: string; text: string };
    expect(first.type).toBe("text");
    expect(JSON.parse(first.text)).toEqual({ error: { code: "invalid_repo", message: "bad repo" } });
  });

  it("never writes an empty message", () => {
    const first = errorResult("scan_failed", "").content[0] as { text: string };
    expect(JSON.parse(first.text).error.message).not.toBe("");
  });

  it("knows every code of the design", () => {
    expect(ERROR_CODES).toHaveLength(19);
    expect(new Set(ERROR_CODES).size).toBe(19);
  });
});

describe("safely", () => {
  const body = (r: { content: unknown[] }) => JSON.parse((r.content[0] as { text: string }).text);

  it("passes a result through", async () => {
    const ok = textResult("x");
    expect(await safely(async () => ok)).toBe(ok);
  });

  it("turns a throw, a rejection and a thrown non-Error into internal_error", async () => {
    const cases: Array<() => Promise<never>> = [
      () => {
        throw new Error("secret /home/ben/token ghp_123");
      },
      () => Promise.reject(new Error("secret ghp_123")),
      () => {
        throw "ghp_123 string";
      },
      () => Promise.reject({ stack: "at secret" }),
    ];
    for (const c of cases) {
      const r = await safely(c);
      expect(r.isError).toBe(true);
      expect(body(r)).toEqual({ error: { code: "internal_error", message: "unexpected error" } });
      expect(JSON.stringify(r)).not.toContain("ghp_123");
      expect(JSON.stringify(r)).not.toContain("secret");
    }
  });

  it("treats a non-result return value as internal_error", async () => {
    const r = await safely((async () => undefined) as never);
    expect(body(r).error.code).toBe("internal_error");
  });
});
