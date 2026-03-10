/**
 * This file contains the ESLint configuration for Vitest test files.
 *
 * It extends the base configuration and adds rules specifically for Vitest, ensuring
 * that tests are written in a consistent and correct manner.
 *
 * @module
 */
import vitestPlugin from "eslint-plugin-vitest";

import baseConfig from "./base.js";

/**
 * @type {import("eslint").Linter.Config}
 */
export default [
  ...baseConfig,
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    ...vitestPlugin.configs.recommended,
    rules: {
      ...vitestPlugin.configs.recommended.rules,
      // You can override any rules from the Vitest plugin here
    },
  },
];
