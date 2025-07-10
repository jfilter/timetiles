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
    testTimeout: 10000,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "scripts/**/*.ts"],
      exclude: ["lib/**/*.d.ts", "**/node_modules/**"],
      reporter: ["text", "lcov", "html"],
    },
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false, // Enable parallel forks
        isolate: true, // Isolate each test file
      },
    },
    fileParallelism: true, // Enable parallel file execution
    maxWorkers: 4, // Limit concurrent workers to prevent resource conflicts
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
