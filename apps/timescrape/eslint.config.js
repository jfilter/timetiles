/**
 * ESLint configuration for the timescrape runner.
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
  // Build-config files and tests are not part of the package's (src-only)
  // tsconfig, so the type-aware project service cannot resolve them. oxlint
  // still lints these; ESLint focuses on the typed src tree.
  { ignores: ["dist/**", "examples/**", "*.config.ts", "tests/**"] },
];
