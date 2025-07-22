import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "unit",
      globals: true,
      environment: "node",
      include: ["__tests__/**/*.unit.test.ts"],
      setupFiles: ["__tests__/setup-no-db.ts"],
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "integration",
      include: ["__tests__/**/*.integration.test.ts"],
    },
  },
  {
    extends: "./vitest.config.components.ts",
    test: {
      name: "components",
      include: ["__tests__/**/*.component.test.tsx"],
    },
  },
]);
