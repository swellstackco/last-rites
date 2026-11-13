import { describe, expect, it } from "vitest";
import { enclosingOf } from "./classify-path.js";

describe("enclosingOf", () => {
  it.each([
    ["spec/a.js", "test"],
    ["src/test/x.ts", "test"],
    ["lib/__tests__/y.js", "test"],
    ["a.spec.js", "test"],
    ["b.test.tsx", "test"],
    ["__mocks__/z.js", "test"],
    ["src/contest/a.js", "src"],
    ["src/Controllers/DatabaseController.js", "src"],
    ["tests/a.js", "test"],
    ["src/spec.js", "src"],
  ])("%s is %s", (file, expected) => {
    expect(enclosingOf(file)).toBe(expected);
  });
});
