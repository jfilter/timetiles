/**
 * ESLint configuration for the @timetiles/scraper SDK.
 *
 * Extends the shared base config (no React). oxlint handles the fast/native
 * rules; ESLint adds the specialized plugins (sonarjs, security, boundaries).
 *
 * @module
 */
import baseConfig, { defaultIgnores } from "@timetiles/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  defaultIgnores,
  ...baseConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
  },
  // Build-config files are not part of the package tsconfig, so the type-aware
  // project service cannot resolve them — skip them (oxlint still checks them).
  { ignores: ["dist/**", "*.config.ts"] },
];
