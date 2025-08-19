/**
 * Vitest configuration for React component testing.
 *
 * Configures the test environment for React components with jsdom,
 * proper React plugin setup, and component-specific test utilities.
 *
 * @module
 * @category Configuration
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import baseConfig from "./vitest.config.base";

export default defineConfig({
  ...baseConfig,
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/unit/components/**/*.test.tsx"],
    setupFiles: ["tests/setup/components.ts"],
    testTimeout: 10000,
    pool: "forks",
  },
});
