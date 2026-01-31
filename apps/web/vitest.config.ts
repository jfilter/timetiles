/**
 * Vitest configuration file.
 *
 * Configures Vitest for unit, integration, and component testing.
 * Uses vitest 4 projects API (replaces deprecated vitest.workspace.ts).
 *
 * @module
 */
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";

import baseConfig from "./vitest.config.base";

export default defineConfig({
  ...baseConfig,
  // Cache directory for Vite/Vitest - speeds up subsequent runs
  cacheDir: "node_modules/.vite",
  test: {
    // Global settings shared across all projects
    globals: true,
    pool: "forks",
    execArgv: ["--no-warnings"], // Suppress Node.js warnings
    maxWorkers: 4,
    fileParallelism: true,
    sequence: {
      concurrent: true,
    },
    coverage: {
      provider: "v8",
      reportOnFailure: true, // Generate coverage even when tests fail
      thresholds: {
        lines: 48,
        functions: 46,
        branches: 42,
        statements: 47,
      },
      include: [
        "lib/**/*.ts",
        "lib/**/*.tsx",
        "app/**/*.ts",
        "app/**/*.tsx",
        "components/**/*.ts",
        "components/**/*.tsx",
      ],
      exclude: [
        "lib/**/*.d.ts",
        "**/node_modules/**",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/tests/**",
        "app/(payload)/**/*",
        "migrations/**",
      ],
      reporter: ["text", "lcov", "html", "json-summary"],
      reportsDirectory: "./coverage",
    },
    watch: false,
    // Test projects (replaces vitest.workspace.ts)
    projects: [
      {
        extends: "./vitest.config.base.ts",
        test: {
          name: "unit",
          globals: true,
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          exclude: ["tests/unit/services/cache/**/*.test.ts"],
          setupFiles: ["tests/setup/unit/global-setup-minimal.ts"],
          testTimeout: 10000,
          hookTimeout: 10000,
          isolate: false,
        },
      },
      {
        extends: "./vitest.config.base.ts",
        test: {
          name: "unit-isolated",
          globals: true,
          environment: "node",
          include: ["tests/unit/services/cache/**/*.test.ts"],
          setupFiles: ["tests/setup/unit/global-setup-minimal.ts"],
          testTimeout: 10000,
          hookTimeout: 10000,
          isolate: true,
        },
      },
      {
        extends: "./vitest.config.base.ts",
        plugins: [react()],
        test: {
          name: "components",
          globals: true,
          environment: "jsdom",
          include: ["tests/unit/components/**/*.test.tsx"],
          setupFiles: ["tests/setup/unit/global-setup.ts"],
          testTimeout: 10000,
        },
      },
      {
        extends: "./vitest.config.base.ts",
        test: {
          name: "integration",
          globals: true,
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          // Global setup runs ONCE before all workers (creates template database)
          globalSetup: ["tests/setup/integration/vitest-global-setup.ts"],
          // Setup files run per-worker (clones template to worker database)
          setupFiles: ["tests/setup/integration/global-setup.ts"],
          testTimeout: 30000,
          // Integration test hooks need time for database setup
          hookTimeout: 45000,
          // Server-side dependency optimization for better caching
          server: {
            deps: {
              inline: [/tests\/utils/, /tests\/helpers/, /@payload-config/],
              fallbackCJS: true,
            },
          },
          deps: {
            optimizer: {
              web: {
                enabled: true,
                include: ["@tanstack/react-query", "papaparse"],
              },
            },
          },
        },
        resolve: {
          alias: {
            "@payload-config": path.resolve(__dirname, "payload.config.ts"),
          },
        },
      },
    ],
  },
  resolve: {
    ...(baseConfig.resolve ?? {}),
    alias: {
      ...(baseConfig.resolve?.alias ?? {}),
      "@payload-config": path.resolve(__dirname, "payload.config.ts"),
    },
  },
});
