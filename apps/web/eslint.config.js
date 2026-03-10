/**
 * ESLint configuration for the web application.
 *
 * Minimal config — oxlint handles 436 rules via .oxlintrc.json.
 * ESLint only checks the 6 rules oxlint cannot implement.
 * Overrides here disable those 6 rules where they don't apply.
 *
 * @module
 */
import baseConfig, { defaultIgnores } from "@timetiles/eslint-config/next-js";

/** @type {import("eslint").Linter.Config} */
export default [
  defaultIgnores,
  ...baseConfig,
  // Override parserOptions to point to this project's tsconfig
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Migration files — disable jsdoc requirement
  {
    files: ["migrations/**/*.ts", "**/migrations/**/*.ts"],
    rules: {
      "jsdoc/require-file-overview": "off",
    },
  },
];
