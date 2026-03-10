/**
 * ESLint configuration for MDX files.
 *
 * Extends the base config and adds MDX-specific linting via eslint-plugin-mdx.
 * oxlint does not support MDX file parsing, so this plugin remains in ESLint.
 *
 * @module
 */
import * as mdx from "eslint-plugin-mdx";

// Re-export defaultIgnores for apps to use
export { defaultIgnores } from "./base.js";
import baseConfig from "./base.js";

/**
 * @type {import("eslint").Linter.Config}
 */
export default [
  ...baseConfig,
  mdx.flat,
  mdx.flatCodeBlocks,
  {
    files: ["**/*.mdx", "**/*.md"],
    rules: {
      // Disable rules that don't make sense for MDX files
      "jsdoc/require-file-overview": "off",
    },
  },
];
