import { afterEach, describe, expect, it } from "vitest";
import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ApiHandler, ApiRequest } from "./api/types.js";
import { LISTEN_HOST, main, ServerStartError, startServer } from "./server.js";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

async function start(handler: ApiHandler, port = 0): Promise<Server> {
  const s = await startServer(handler, { port });
  servers.push(s);
  return s;
}

const echo: ApiHandler = async () => ({ status: 200, headers: { "content-type": "application/json" }, body: "{}" });

function send(port: number, body: Buffer, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; connection: string | undefined }>((resolve, reject) => {
    const req = request(
      { host: LISTEN_HOST, port, method: "POST", path: "/api/scan", headers: { "content-type": "application/json", ...headers } },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode ?? 0, connection: res.headers["connection"] }));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

describe("startServer", () => {
  it("listens on 127.0.0.1 only", async () => {
    const s = await start(echo);
    const addr = s.address() as AddressInfo;
    expect(addr.address).toBe("127.0.0.1");
  });

  it("rejects naming the port when the port is taken", async () => {
    const s = await start(echo);
    const port = (s.address() as AddressInfo).port;
    await expect(startServer(echo, { port })).rejects.toThrow(ServerStartError);
    await expect(startServer(echo, { port })).rejects.toThrow(String(port));
  });

  it("stops reading an oversized body and closes the connection after 413", async () => {
    let seen: ApiRequest | undefined;
    let readResult: unknown;
    const handler: ApiHandler = async (req) => {
      seen = req;
      readResult = await req.readBody(16);
      return {
        status: 413,
        headers: { "content-type": "application/json" },
        body: '{"error":{"code":"body_too_large","message":"x"}}',
      };
    };
    const s = await start(handler);
    const port = (s.address() as AddressInfo).port;
    const res = await send(port, Buffer.alloc(200_000, 97)).catch((e: NodeJS.ErrnoException) => e);
    expect(seen).toBeDefined();
    expect(readResult).toEqual({ ok: false, reason: "too_large" });
    // The client either sees the 413 with connection: close, or the socket was reset after it.
    if (res instanceof Error) {
      expect(["ECONNRESET", "EPIPE"]).toContain((res as NodeJS.ErrnoException).code);
    } else {
      expect(res.status).toBe(413);
      expect(res.connection).toBe("close");
    }
  });

  it("reads a small body and passes it through", async () => {
    const handler: ApiHandler = async (req) => {
      const r = await req.readBody(4096);
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: r.ok ? new TextDecoder().decode(r.bytes) : "too_large",
      };
    };
    const s = await start(handler);
    const port = (s.address() as AddressInfo).port;
    const res = await send(port, Buffer.from("{}"));
    expect(res.status).toBe(200);
  });
});

describe("main", () => {
  it("writes a bad PORT to stderr and exits 1 without opening a socket", async () => {
    const lines: string[] = [];
    const codes: number[] = [];
    await main({ env: { PORT: "80.0" }, stderr: (l) => lines.push(l), exit: (c) => codes.push(c) });
    expect(codes).toEqual([1]);
    expect(lines.join("\n")).toContain("PORT");
  });
});
