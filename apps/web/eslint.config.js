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
import { globalIgnores } from "eslint/config";

/** @type {import("eslint").Linter.Config} */
export default [
  // Global ignores from shared config + app-specific ignores
  defaultIgnores,
  globalIgnores([
    "**/playwright-report/**",
    "**/test-results/**",
    "**/uploads/**",
    "**/*.min.js",
    "**/*.bundle.js",
    "**/app/(payload)/**",
    "next-env.d.ts",
  ]),
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
  // Generated files — disable jsdoc requirement
  {
    files: ["**/payload-types.ts", "**/payload-generated-schema.ts", "**/*-generated.ts"],
    rules: {
      "jsdoc/require-file-overview": "off",
    },
  },
];
