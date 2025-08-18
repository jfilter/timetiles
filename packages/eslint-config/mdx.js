/**
 * This file contains the ESLint configuration for MDX files.
 *
 * It extends the base configuration and adds rules specifically for MDX, ensuring that
 * code blocks and other syntax within Markdown documents are linted correctly.
 *
 * @module
 */
import * as mdx from "eslint-plugin-mdx";

import baseConfig from "./base.js";

/**
 * @type {import("eslint").Linter.Config}
 */
export default [
  ...baseConfig,
  {
    ...mdx.flat,
    // optional, if you want to see configuration comments
    ...mdx.flatCodeBlocks,
  },
];
