import { describe, it, expect } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { makeDeps } from "../test-support/fakes.js";
import { findReplacementImpl } from "./find-replacement.js";

const URL1 = "https://raw.githubusercontent.com/e18e/module-replacements/main/manifests/native.json";
const text = (r: CallToolResult) => (r.content[0] as { text: string }).text;

describe("find_replacement", () => {
  it("returns the replacement entry with keys in order", async () => {
    const d = makeDeps({
      e18e: async () => ({
        ok: true,
        value: { known: true, replacement: { type: "native", replacement: "Array.prototype.at", replacements: ["Array.prototype.at"] }, sourceUrl: URL1 },
      }),
    });
    const r = await findReplacementImpl(d, { package: "array-at" });
    expect(text(r)).toBe(
      JSON.stringify({ package: "array-at", replacement: { type: "native", replacement: "Array.prototype.at", replacements: ["Array.prototype.at"] }, sourceUrl: URL1 }),
    );
    expect(Object.keys(JSON.parse(text(r)))).toEqual(["package", "replacement", "sourceUrl"]);
  });

  it("keeps an empty replacements list", async () => {
    const d = makeDeps({
      e18e: async () => ({ ok: true, value: { known: true, replacement: { type: "none", replacements: [] }, sourceUrl: URL1 } }),
    });
    expect(JSON.parse(text(await findReplacementImpl(d, { package: "x" }))).replacement).toEqual({ type: "none", replacements: [] });
  });

  it("returns none when every list was retrieved and none matches", async () => {
    const d = makeDeps({ e18e: async () => ({ ok: true, value: { known: false, sourceUrl: "https://example.test/dir" } }) });
    expect(text(await findReplacementImpl(d, { package: "x" }))).toBe(
      JSON.stringify({ package: "x", replacement: "none", sourceUrl: "https://example.test/dir" }),
    );
  });

  it("a failure is evidence_unavailable, never none", async () => {
    for (const category of ["network_error", "timeout", "rate_limited", "malformed_response"] as const) {
      const d = makeDeps({ e18e: async () => ({ ok: false, reason: { source: "e18e", category } }) });
      const r = await findReplacementImpl(d, { package: "x" });
      expect(r.isError).toBe(true);
      expect(JSON.parse(text(r)).error.code).toBe("evidence_unavailable");
      expect(text(r)).not.toContain("none");
    }
  });

  it("rejects a bad name before calling the source", async () => {
    const d = makeDeps();
    const r = await findReplacementImpl(d, { package: "Bad" });
    expect(JSON.parse(text(r)).error.code).toBe("invalid_package");
    expect(d.counts.e18e.calls).toEqual([]);
  });
});
