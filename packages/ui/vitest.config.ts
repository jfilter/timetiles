/**
 * Vitest configuration for UI package tests.
 *
 * @module
 */
import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@timetiles/ui": path.resolve(import.meta.dirname, "src") } },
  test: {
    globals: true,
    environment: "node",
    pool: "forks",
    execArgv: ["--no-warnings"], // Suppress Node.js warnings
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/**", "dist/**", "**/*.config.*", "**/*.d.ts", "**/index.ts"],
    },
  },
});
