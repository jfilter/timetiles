import path from "path";
import { defineConfig } from "vitest/config";

import baseConfig from "./vitest.config.base";

export default defineConfig({
  ...baseConfig,
  test: {
    globals: true,
    environment: "jsdom",
    exclude: ["**/node_modules/**"],
    setupFiles: ["tests/setup/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    reporters: ["basic"],
    silent: true,
    // Reduce console output noise
    logHeapUsage: false,
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
    ...(baseConfig.resolve ?? {}),
    alias: {
      ...(baseConfig.resolve?.alias ?? {}),
      "@payload-config": path.resolve(__dirname, "payload.config.ts"),
    },
  },
});
