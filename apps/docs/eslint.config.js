/**
 * ESLint configuration for the docs application.
 *
 * Minimal config — oxlint handles 436 rules via .oxlintrc.json.
 * ESLint only checks the 6 rules oxlint cannot implement, plus MDX linting.
 *
 * @module
 */
import mdxConfig, { defaultIgnores } from "@timetiles/eslint-config/mdx";

/** @type {import("eslint").Linter.Config[]} */
export default [
  // Global ignores from shared config + app-specific ignores
  defaultIgnores,
  {
    // Auto-generated API documentation (global ignores in flat config)
    ignores: [
      "content/reference/api/**/*.md",
      "content/reference/api/**/*.mdx",
      "content/reference/api/**/_meta.js",
      // Keep manual files (negation)
      "!content/reference/api/index.mdx",
    ],
  },
  // Apply MDX config to all MDX/MD files (except those ignored above)
  ...mdxConfig,
  // Override for MDX files to handle JSX imports
  {
    files: ["**/*.mdx"],
    rules: {
      "jsdoc/require-file-overview": "off", // MDX files don't need JSDoc
    },
  },
  // Override for _meta.js files - simple config files don't need JSDoc
  {
    files: ["**/_meta.js"],
    rules: {
      "jsdoc/require-file-overview": "off",
    },
  },
  // Scripts — disable jsdoc requirement for non-module scripts
  {
    files: ["scripts/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
