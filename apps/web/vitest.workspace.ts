import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "unit",
      globals: true,
      environment: "node",
      include: [
        "__tests__/file-parsing.test.ts",
        "__tests__/services/CoordinateValidator.test.ts",
        "__tests__/services/GeoLocationDetector.test.ts",
        "__tests__/seed-validation.test.ts",
      ],
      setupFiles: ["__tests__/setup-no-db.ts"],
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "integration",
      include: ["__tests__/**/*.{test,spec}.{js,ts}"],
      exclude: [
        "**/node_modules/**",
        "__tests__/file-parsing.test.ts",
        "__tests__/services/CoordinateValidator.test.ts",
        "__tests__/services/GeoLocationDetector.test.ts",
        "__tests__/seed-validation.test.ts",
        "__tests__/components/**/*.{test,spec}.{js,ts,jsx,tsx}",
      ],
    },
  },
  {
    extends: "./vitest.config.components.ts",
    test: {
      name: "components",
    },
  },
]);
