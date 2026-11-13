import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "./build/build.js";
import { TOOL_NAMES } from "./tools/index.js";

// Builds the real bundle into a temporary directory outside the repository and talks to it over stdio.
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TREES = fileURLToPath(new URL("./__fixtures__/trees/", import.meta.url));

let tmp = "";
let bundle = "";

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "exorcist-stdio-"));
  bundle = join(tmp, "server.mjs");
  await buildServer({ outFile: bundle, demoOut: join(tmp, "demo"), root: ROOT });
}, 60_000);

afterAll(() => {
  if (tmp !== "") rmSync(tmp, { recursive: true, force: true });
});

interface Session {
  call(method: string, params?: unknown): Promise<any>;
  stdoutLines: string[];
  stderr(): string;
  close(): Promise<number | null>;
}

function start(): Session {
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [bundle], {
    env: {}, // empty environment: no token, no cache dir
    cwd: tmp,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdoutLines: string[] = [];
  let errText = "";
  let buffer = "";
  const waiting = new Map<number, (m: any) => void>();
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let i: number;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (line === "") continue;
      stdoutLines.push(line);
      try {
        const msg = JSON.parse(line);
        if (typeof msg.id === "number") waiting.get(msg.id)?.(msg);
      } catch {
        // recorded in stdoutLines; the tests assert every line parses
      }
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (c: string) => (errText += c));
  let nextId = 1;
  const send = (obj: unknown): void => void child.stdin.write(JSON.stringify(obj) + "\n");
  const session: Session = {
    stdoutLines,
    stderr: () => errText,
    call(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no answer to ${method}; stderr: ${errText.slice(0, 500)}`)), 40_000);
        waiting.set(id, (m) => {
          clearTimeout(timer);
          resolve(m);
        });
        send({ jsonrpc: "2.0", id, method, params });
      });
    },
    close() {
      return new Promise((resolve) => {
        child.once("exit", (code) => resolve(code));
        child.stdin.end();
        setTimeout(() => child.kill(), 10_000).unref();
      });
    },
  };
  return Object.assign(session, {
    init: async () => {
      await session.call("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "stdio-test", version: "0.0.0" },
      });
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
    },
  });
}

async function started(): Promise<Session> {
  const s = start();
  await (s as unknown as { init(): Promise<void> }).init();
  return s;
}

const textOf = (m: any): string => m.result.content[0].text as string;

describe("the bundled server over stdio", () => {
  it("lists the five tools, answers a demo scan and a usage surface, and writes only JSON-RPC to stdout", async () => {
    const s = await started();
    try {
      const list = await s.call("tools/list");
      expect(list.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([...TOOL_NAMES].sort());

      const scan = await s.call("tools/call", { name: "scan_repo", arguments: { repo: "pump" } });
      expect(scan.result.isError).not.toBe(true);
      expect(JSON.parse(textOf(scan))).toHaveProperty("dependencies");

      const usage = await s.call("tools/call", {
        name: "usage_surface",
        arguments: { path: join(TREES, "intersect-like"), package: "intersect" },
      });
      expect(usage.result.isError).not.toBe(true);
      const report = JSON.parse(textOf(usage));
      expect(report.package).toBe("intersect");
      expect(report.callSites.length).toBeGreaterThan(0);

      const bad = await s.call("tools/call", { name: "scan_repo", arguments: { repo: 5 } });
      expect(JSON.parse(textOf(bad)).error.code).toBe("invalid_input");

      for (const line of s.stdoutLines) {
        expect(JSON.parse(line).jsonrpc).toBe("2.0");
      }
    } finally {
      await s.close();
    }
  }, 60_000);
});
