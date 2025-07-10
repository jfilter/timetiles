import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "lib/**/*.{test,spec}.{js,ts}",
      "scripts/**/*.{test,spec}.{js,ts}",
      "__tests__/**/*.{test,spec}.{js,ts}",
    ],
    exclude: ["**/node_modules/**"],
    setupFiles: ["__tests__/setup.ts"],
    testTimeout: 20000,
    reporters: ["basic"],
    silent: true, // Default to silent output
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "scripts/**/*.ts"],
      exclude: ["lib/**/*.d.ts", "**/node_modules/**"],
      reporter: ["text", "lcov", "html"],
    },
    pool: "forks",
    poolOptions: {
      forks: {
        isolate: true,
      },
    },
    fileParallelism: true, // Re-enable parallel file execution
    maxWorkers: process.env.CI ? 4 : 8, // Restore parallel workers
    minWorkers: 1,
    sequence: {
      concurrent: true, // Allow concurrent test execution
    },
  },
  resolve: {
    alias: {
      "@payload-config": path.resolve(__dirname, "payload.config.ts"),
      "@": path.resolve(__dirname, "."),
      "@workspace/ui": path.resolve(__dirname, "../../packages/ui/src"),
    },
  },
});
