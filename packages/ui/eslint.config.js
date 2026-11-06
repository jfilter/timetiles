/**
 * ESLint configuration for UI package.
 *
 * @module
 */

import config, { oxlintBridge } from "@timetiles/eslint-config/react-internal";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    ignores: [
      "**/*.js",
      "**/*.d.ts",
      "**/*.d.ts.map",
      "dist/**",
      "node_modules/**",
      ".turbo/**",
      "coverage/**",
      ".storybook/**",
    ],
  },
  // Must stay last, see oxlintBridge.
  ...oxlintBridge,
];
