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
      setupFiles: ["tests/setup/unit.ts"],
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "integration",
      include: ["tests/integration/**/*.test.ts"],
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
