/**
 * Vitest configuration file.
 *
 * Configures Vitest for unit and integration testing with jsdom environment,
 * path aliases, and test timeouts. Automatically optimizes settings based on
 * which tests are being run.
 *
 * @module
 */
import path from "path";
import { defineConfig } from "vitest/config";

import baseConfig from "./vitest.config.base";

// Detect test type based on command arguments or include patterns
// Note: When filtering by test name (-t), argv may not contain the path,
// so we default to "node" environment which is safer for integration tests
// that use Payload/jose (avoids Uint8Array instanceof mismatch with jsdom)
const isUnitTest = process.argv.some((arg) => arg.includes("tests/unit"));
const isComponentTest = process.argv.some((arg) => arg.includes("tests/unit/components"));

export default defineConfig({
  ...baseConfig,
  // Cache directory for Vite/Vitest - speeds up subsequent runs
  cacheDir: "node_modules/.vite",
  test: {
    globals: true,
    // Default to "node" for safety with Payload/jose; only use jsdom for component tests
    environment: isComponentTest ? "jsdom" : "node",
    exclude: ["**/node_modules/**"],
    setupFiles: ["tests/setup/integration/global-setup.ts"],
    testTimeout: isUnitTest ? 10000 : 30000, // Shorter timeout for unit tests
    hookTimeout: isUnitTest ? 10000 : 30000,
    reporters: ["verbose"],
    silent: false,
    // Reduce console output noise
    logHeapUsage: false,
    coverage: {
      provider: "v8",
      reportOnFailure: true, // Generate coverage even when tests fail
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
    pool: "forks",
    poolOptions: {
      forks: {
        isolate: !isUnitTest, // Disable isolation for unit tests, keep for integration
        execArgv: ["--no-warnings"], // Suppress Node.js warnings
      },
    },
    fileParallelism: true,
    maxWorkers: process.env.CI ? 4 : undefined,
    sequence: {
      concurrent: true,
    },
    // Server-side dependency optimization for better caching
    server: {
      deps: {
        // Inline test utilities and helpers for faster processing
        inline: [/tests\/utils/, /tests\/helpers/, /@payload-config/],
        // Fallback to CJS for better compatibility
        fallbackCJS: true,
      },
    },
    // Dependency optimization for faster imports and caching
    deps: {
      optimizer: {
        web: {
          enabled: true,
          include: [
            "@tanstack/react-query",
            "papaparse",
            // Add packages that are actually installed
          ],
        },
      },
    },
    // Watch configuration for better caching during watch mode
    watch: false,
  },
  resolve: {
    ...(baseConfig.resolve ?? {}),
    alias: {
      ...(baseConfig.resolve?.alias ?? {}),
      "@payload-config": path.resolve(__dirname, "payload.config.ts"),
    },
  },
});
