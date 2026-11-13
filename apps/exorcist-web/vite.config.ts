import { readdirSync, readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

/** Same pattern as the Demo_Repo names (src/model/demo-repos.ts). */
export const DEMO_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const API_TARGET = "http://127.0.0.1:27431";

/** Build-only CSP. frame-ancestors is ignored in a meta tag; set it in the nginx header. */
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; " +
  "base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

/** True only for a safe demo name; never touches the filesystem. */
export function isDemoName(name: string): boolean {
  return DEMO_NAME_PATTERN.test(name);
}

/** Extracts the demo name from a request path like `/demo/<name>.json`, or undefined. */
export function demoNameFromPath(path: string): string | undefined {
  const m = /^\/demo\/([^/]*)\.json$/.exec(path.split("?")[0] ?? "");
  const name = m?.[1];
  return name !== undefined && isDemoName(name) ? name : undefined;
}

const DEMO_DIR = new URL("../../demo/", import.meta.url);

/** Serves /demo/<name>.json in dev and emits every demo/*.json into the build. */
export function demoSnapshots(): Plugin {
  return {
    name: "demo-snapshots",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = demoNameFromPath(req.url ?? "");
        if (name === undefined) return next();
        try {
          const body = readFileSync(new URL(`${name}.json`, DEMO_DIR));
          res.setHeader("content-type", "application/json");
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.end();
        }
      });
    },
    generateBundle() {
      for (const file of readdirSync(DEMO_DIR)) {
        const m = /^(.*)\.json$/.exec(file);
        const name = m?.[1];
        if (name === undefined || !isDemoName(name)) continue;
        this.emitFile({
          type: "asset",
          fileName: `demo/${name}.json`,
          source: readFileSync(new URL(file, DEMO_DIR)),
        });
      }
    },
  };
}

/** Injects the CSP meta in production builds only (dev HMR needs inline scripts). */
export function cspMeta(): Plugin {
  return {
    name: "csp-meta",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [demoSnapshots(), cspMeta()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: API_TARGET, changeOrigin: false } },
  },
  build: { target: "es2022", sourcemap: false },
});
