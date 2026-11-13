import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { clientIp } from "./client-ip.js";
import { assertProperty } from "../../evidence/test-support/fc-runner.js";

const req = (xff: string | undefined, remoteAddress: string | undefined) => ({
  headers: (xff === undefined ? {} : { "x-forwarded-for": xff }) as Record<string, string>,
  remoteAddress,
});

describe("clientIp", () => {
  it("uses the last trimmed entry when trustProxy is true", () => {
    expect(clientIp(req("1.1.1.1, 2.2.2.2 ,  3.3.3.3 ", "9.9.9.9"), true)).toBe("3.3.3.3");
  });
  it("falls back to the socket address when the header is absent", () => {
    expect(clientIp(req(undefined, "9.9.9.9"), true)).toBe("9.9.9.9");
  });
  it("falls back to the socket address when the last entry is empty", () => {
    expect(clientIp(req("1.1.1.1,  ", "9.9.9.9"), true)).toBe("9.9.9.9");
    expect(clientIp(req("", "9.9.9.9"), true)).toBe("9.9.9.9");
  });
  it("ignores the header when trustProxy is false", () => {
    expect(clientIp(req("1.1.1.1", "9.9.9.9"), false)).toBe("9.9.9.9");
  });
  it('returns "unknown" when neither exists', () => {
    expect(clientIp(req(undefined, undefined), true)).toBe("unknown");
    expect(clientIp(req("1.1.1.1", undefined), false)).toBe("unknown");
  });

  it("property: trustProxy false ignores the header; true returns the trimmed last entry", () => {
    assertProperty(
      "client-ip header handling",
      fc.property(fc.array(fc.string(), { minLength: 1, maxLength: 5 }), (entries) => {
        const header = entries.map((e) => e.replaceAll(",", "")).join(",");
        const r = req(header, "sock");
        if (clientIp(r, false) !== "sock") throw new Error("header not ignored");
        const last = (entries[entries.length - 1] as string).replaceAll(",", "").trim();
        const expected = last === "" ? "sock" : last;
        if (clientIp(r, true) !== expected) throw new Error(`got ${clientIp(r, true)}, expected ${expected}`);
      }),
    );
  });
});
