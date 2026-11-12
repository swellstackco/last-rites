import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["skeleton/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
  },
});
