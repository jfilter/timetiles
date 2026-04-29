/**
 * Vitest configuration file.
 *
 * Configures Vitest for unit, integration, and component testing.
 * Uses vitest 4 projects API (replaces deprecated vitest.workspace.ts).
 *
 * @module
 */
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

import baseConfig from "./vitest.config.base";

// Worker count — configurable via TEST_WORKERS env var (default: 3)
// Each integration worker spins up Payload CMS + DB clone (~1 GB each),
// so keep this low to avoid OOM. Use `make test-ai WORKERS=2` to reduce.
const maxWorkers = Number(process.env.TEST_WORKERS) || 3;

export default defineConfig({
  ...baseConfig,
  // Cache directory for Vite/Vitest - speeds up subsequent runs
  cacheDir: "node_modules/.vite",
  test: {
    // Global settings shared across all projects
    globals: true,
    pool: "forks",
    teardownTimeout: 5000, // Allow workers time to close pg connections before force-kill
    execArgv: ["--no-warnings"], // Suppress Node.js warnings
    maxWorkers,
    fileParallelism: true,
    sequence: { concurrent: true },
    coverage: {
      provider: "v8",
      reportOnFailure: true, // Generate coverage even when tests fail
      thresholds: { lines: 48, functions: 46, branches: 42, statements: 47 },
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
          exclude: [
            "tests/unit/services/cache/**/*.test.ts",
            "tests/unit/jobs/cache-cleanup-job.test.ts",
            "tests/unit/jobs/quota-reset-job.test.ts",
            "tests/unit/jobs/event-creation-helpers.test.ts",
            "tests/unit/jobs/execute-account-deletion-job.test.ts",
            "tests/unit/jobs/schedule-manager-*.test.ts",
            "tests/unit/jobs/duplicate-strategy.test.ts",
            "tests/unit/jobs/schema-detection-job.test.ts",
            "tests/unit/jobs/geocode-batch-job.test.ts",
            "tests/unit/jobs/analyze-duplicates-job.test.ts",
            "tests/unit/jobs/create-schema-version-job.test.ts",
            "tests/unit/jobs/dataset-detection-job.test.ts",
            "tests/unit/jobs/validate-schema-job.test.ts",
            "tests/unit/jobs/paginated-fetch.test.ts",
            "tests/unit/api/**/*.test.ts",
            "tests/unit/security/safe-fetch.test.ts",
            "tests/unit/collections/scheduled-ingests-timezone.test.ts",
            "tests/unit/collections/ingest-jobs-hooks.test.ts",
            "tests/unit/database/operations.test.ts",
          ],
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
          include: [
            "tests/unit/services/cache/**/*.test.ts",
            "tests/unit/jobs/cache-cleanup-job.test.ts",
            "tests/unit/jobs/quota-reset-job.test.ts",
            "tests/unit/jobs/event-creation-helpers.test.ts",
            "tests/unit/jobs/execute-account-deletion-job.test.ts",
            "tests/unit/jobs/schedule-manager-*.test.ts",
            "tests/unit/jobs/duplicate-strategy.test.ts",
            "tests/unit/jobs/schema-detection-job.test.ts",
            "tests/unit/jobs/geocode-batch-job.test.ts",
            "tests/unit/jobs/analyze-duplicates-job.test.ts",
            "tests/unit/jobs/create-schema-version-job.test.ts",
            "tests/unit/jobs/dataset-detection-job.test.ts",
            "tests/unit/jobs/validate-schema-job.test.ts",
            "tests/unit/jobs/paginated-fetch.test.ts",
            "tests/unit/api/**/*.test.ts",
            "tests/unit/security/safe-fetch.test.ts",
            "tests/unit/collections/scheduled-ingests-timezone.test.ts",
            "tests/unit/collections/ingest-jobs-hooks.test.ts",
            "tests/unit/database/operations.test.ts",
          ],
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
          name: "integration-isolated",
          globals: true,
          environment: "node",
          include: ["tests/integration/services/data-package-activation.test.ts"],
          isolate: true,
          // Global setup runs ONCE before all workers (creates template database)
          globalSetup: ["tests/setup/integration/vitest-global-setup.ts"],
          // Setup files run per-worker (clones template to worker database)
          setupFiles: ["tests/setup/integration/global-setup.ts"],
          retry: 2,
          testTimeout: 30000,
          hookTimeout: 45000,
          server: { deps: { inline: [/tests\/utils/, /tests\/helpers/, /@payload-config/], fallbackCJS: true } },
          deps: { optimizer: { web: { enabled: true, include: ["@tanstack/react-query", "papaparse"] } } },
        },
        resolve: { alias: { "@payload-config": path.resolve(__dirname, "payload.config.ts") } },
      },
      {
        extends: "./vitest.config.base.ts",
        test: {
          name: "integration",
          globals: true,
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          exclude: ["tests/integration/services/data-package-activation.test.ts"],
          isolate: false,
          // Global setup runs ONCE before all workers (creates template database)
          globalSetup: ["tests/setup/integration/vitest-global-setup.ts"],
          // Setup files run per-worker (clones template to worker database)
          setupFiles: ["tests/setup/integration/global-setup.ts"],
          retry: 2,
          testTimeout: 30000,
          // Integration test hooks need time for database setup
          hookTimeout: 45000,
          // Server-side dependency optimization for better caching
          server: { deps: { inline: [/tests\/utils/, /tests\/helpers/, /@payload-config/], fallbackCJS: true } },
          deps: { optimizer: { web: { enabled: true, include: ["@tanstack/react-query", "papaparse"] } } },
        },
        resolve: { alias: { "@payload-config": path.resolve(__dirname, "payload.config.ts") } },
      },
    ],
  },
  resolve: {
    ...baseConfig.resolve,
    alias: { ...baseConfig.resolve?.alias, "@payload-config": path.resolve(__dirname, "payload.config.ts") },
  },
});
