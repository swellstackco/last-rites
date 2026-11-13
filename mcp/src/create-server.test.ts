import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createExorcistServer } from "./create-server.js";
import { fakeDemoStore, makeDeps, memoryProbe } from "./test-support/fakes.js";
import { TOOL_NAMES } from "./tools/index.js";

const SAMPLE = readFileSync(new URL("./__fixtures__/demo/sample.json", import.meta.url), "utf8");

async function connect(deps = makeDeps()) {
  const server = createExorcistServer(deps);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, deps };
}

function firstText(r: unknown): string {
  const content = (r as { content: Array<{ type: string; text: string }> }).content;
  return content[0]!.text;
}

describe("createExorcistServer", () => {
  it("lists exactly the five tools with descriptions and the required annotations", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    const expected: Record<string, [boolean, boolean]> = {
      scan_repo: [true, true],
      death_report: [true, true],
      find_replacement: [true, true],
      usage_surface: [true, false],
      generate_pin_tests: [false, false],
    };
    for (const t of tools) {
      expect(t.description ?? "").not.toBe("");
      expect(t.annotations?.destructiveHint).toBe(false);
      expect([t.annotations?.readOnlyHint, t.annotations?.openWorldHint]).toEqual(expected[t.name]);
    }
    expect(client.getServerVersion()?.name).toBe("exorcist");
    await client.close();
  });

  it("answers a wrong argument type with invalid_input and calls no Dep", async () => {
    const { client, deps } = await connect();
    for (const [name, args] of [
      ["scan_repo", { repo: 5 }],
      ["death_report", { repo: "pump" }],
      ["usage_surface", { path: ".", package: 3 }],
      ["find_replacement", {}],
      ["generate_pin_tests", { path: ".", package: "intersect", runs: "many" }],
    ] as const) {
      const r = await client.callTool({ name, arguments: args });
      expect(r.isError, name).toBe(true);
      expect(JSON.parse(firstText(r)).error.code, name).toBe("invalid_input");
    }
    expect(deps.totalCalls()).toBe(0);
    await client.close();
  });

  it("answers each tool's valid call through the protocol", async () => {
    const store = fakeDemoStore({ pump: SAMPLE });
    const deps = makeDeps({
      demoStore: store,
      probe: memoryProbe({ "/work/proj/package.json": "{}" }),
    });
    const { client } = await connect(deps);

    const scan = await client.callTool({ name: "scan_repo", arguments: { repo: "pump" } });
    expect(scan.isError).not.toBe(true);
    expect(JSON.parse(firstText(scan))).toHaveProperty("dependencies");

    const death = await client.callTool({ name: "death_report", arguments: { repo: "pump", package: "left-pad" } });
    expect(JSON.parse(firstText(death)).error.code).toBe("package_not_found");

    const usage = await client.callTool({ name: "usage_surface", arguments: { path: "proj", package: "intersect" } });
    expect(usage.isError).not.toBe(true);
    expect(JSON.parse(firstText(usage)).package).toBe("intersect");

    const find = await client.callTool({ name: "find_replacement", arguments: { package: "left-pad" } });
    expect(JSON.parse(firstText(find)).error.code).toBe("evidence_unavailable");

    const pin = await client.callTool({ name: "generate_pin_tests", arguments: { path: "proj", package: "intersect" } });
    expect(typeof firstText(pin)).toBe("string");
    expect(store.asked).toContain("pump");
    await client.close();
  });
});
