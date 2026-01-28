/**
 * This file contains the ESLint configuration for MDX files.
 *
 * It extends the base configuration and adds rules specifically for MDX, ensuring that
 * code blocks and other syntax within Markdown documents are linted correctly.
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
  // optional, if you want to see configuration comments
  mdx.flatCodeBlocks,
  {
    files: ["**/*.mdx", "**/*.md"],
    rules: {
      // Disable rules that don't make sense for MDX files
      "jsdoc/require-file-overview": "off",
      "jsdoc/require-jsdoc": "off",
      // Disable TypeScript rules that require type information for MDX files
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
];
