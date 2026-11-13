import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["skeleton/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "mcp/src/**/*.test.ts"],
    setupFiles: ["apps/exorcist-npm/src/evidence/test-support/no-network.setup.ts"],
  },
});
