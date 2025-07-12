import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: [
      "lib/**/*.{test,spec}.{js,ts,jsx,tsx}",
      "scripts/**/*.{test,spec}.{js,ts,jsx,tsx}",
      "__tests__/**/*.{test,spec}.{js,ts,jsx,tsx}",
      "__tests__/**/*.test.tsx",
    ],
    exclude: ["**/node_modules/**"],
    setupFiles: ["__tests__/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ["basic"],
    silent: true,
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
    fileParallelism: true,
    maxWorkers: process.env.CI ? 4 : undefined,
    sequence: {
      concurrent: true,
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
