import { describe, expect, it } from "vitest";
import { depsDevPageUrl } from "./sources/depsdev.js";
import { npmDocUrl, npmSourceUrl } from "./sources/npm.js";
import { osvListUrl } from "./sources/osv.js";

// Requirement 2.4: sourceUrls use `<name>` as is; the fetched URL keeps the encoded form.
describe("user-facing source URLs", () => {
  it("keep scoped names readable", () => {
    expect(npmSourceUrl("@scope/pkg")).toBe("https://registry.npmjs.org/@scope/pkg");
    expect(osvListUrl("@scope/pkg")).toBe("https://osv.dev/list?q=@scope/pkg");
    expect(depsDevPageUrl("@scope/pkg")).toBe("https://deps.dev/npm/@scope/pkg");
    expect(npmSourceUrl("left-pad")).toBe("https://registry.npmjs.org/left-pad");
  });
  it("the fetched registry URL stays fully encoded", () => {
    expect(npmDocUrl("@scope/pkg")).toBe("https://registry.npmjs.org/%40scope%2Fpkg");
  });
  it("still produce valid absolute URLs for odd names", () => {
    expect(() => new URL(npmSourceUrl("a b?c#d"))).not.toThrow();
  });
});
