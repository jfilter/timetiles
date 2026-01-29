/**
 * Vitest configuration for UI package tests.
 *
 * @module
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
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
