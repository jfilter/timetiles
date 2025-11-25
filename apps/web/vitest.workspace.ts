/**
 * Vitest workspace configuration for monorepo test organization.
 *
 * Defines separate test configurations for unit, integration, and component tests
 * with appropriate environments and setup files for each test type.
 *
 * @module
 * @category Configuration
 */
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    extends: "./vitest.config.base.ts",
    test: {
      name: "unit",
      globals: true,
      environment: "node",
      include: ["tests/unit/**/*.test.ts"],
      setupFiles: ["tests/setup/unit/global-setup-minimal.ts"],
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "integration",
      include: ["tests/integration/**/*.test.ts"],
      // Must use "node" environment for integration tests to avoid jose/Uint8Array
      // instanceof mismatch issue with jsdom (see https://github.com/panva/jose/issues/671)
      environment: "node",
    },
  },
  {
    extends: "./vitest.config.components.ts",
    test: {
      name: "components",
      include: ["tests/unit/components/**/*.test.tsx"],
    },
  },
]);
