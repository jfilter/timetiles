import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "unit",
      globals: true,
      environment: "node",
      include: ["tests/unit/**/*.test.ts"],
      setupFiles: ["tests/setup/setup-no-db.ts"],
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
