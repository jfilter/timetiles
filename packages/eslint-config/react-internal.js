/**
 * ESLint configuration for internal React packages.
 *
 * Extends base config and adds only react/no-deprecated (not implemented in oxlint).
 * All other React rules (hooks, compiler, perf, @eslint-react) are handled by oxlint.
 *
 * @module
 */
import react from "eslint-plugin-react";

import baseConfig from "./base.js";

/**
 * @type {import("eslint").Linter.Config}
 */
export default [
  ...baseConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      react: react,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // react/no-deprecated — not implemented in oxlint
      "react/no-deprecated": "error",
    },
  },
];
