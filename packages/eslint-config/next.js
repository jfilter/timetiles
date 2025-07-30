/**
 * This file contains the ESLint configuration for Next.js applications.
 *
 * It extends the base configuration and incorporates the recommended rules from
 * `@next/eslint-plugin-next` to ensure that Next.js best practices are followed.
 * 
 * @module
 */
import nextPlugin from "@next/eslint-plugin-next";

import baseConfig from "./base.js";

/**
 * @type {import("eslint").Linter.Config}
 */
export default [
  ...baseConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      // You can override any rules from the Next.js plugin here
    },
  },
];
