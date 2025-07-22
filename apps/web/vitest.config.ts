import { defineConfig } from "vitest/config";
import path from "path";
import baseConfig from "./vitest.config.base";

export default defineConfig({
  ...baseConfig,
  test: {
    globals: true,
    environment: "jsdom",
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
    ...(baseConfig.resolve || {}),
    alias: {
      ...((baseConfig.resolve && baseConfig.resolve.alias) || {}),
      "@payload-config": path.resolve(__dirname, "payload.config.ts"),
    },
  },
});
