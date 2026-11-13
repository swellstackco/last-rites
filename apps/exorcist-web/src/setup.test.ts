import { describe, expect, it } from "vitest";

describe("test environment (node)", () => {
  it("forbids real network access through global fetch", async () => {
    await expect(Promise.resolve().then(() => fetch("http://127.0.0.1:1/"))).rejects.toThrow(
      /Real network access is forbidden/,
    );
  });
});
