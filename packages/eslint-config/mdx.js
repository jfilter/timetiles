import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import onlyWarn from "eslint-plugin-only-warn"
import * as mdx from "eslint-plugin-mdx"

/**
 * ESLint configuration for MDX files.
 * Uses eslint-plugin-mdx to properly parse and lint MDX files.
 *
 * @type {import("eslint").Linter.Config}
 */
export default [
  {
    ignores: [
      "**/.next/**",
      "**/out/**", 
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
    ],
  },
  js.configs.recommended,
  {
    ...mdx.flat,
    processor: mdx.createRemarkProcessor({
      lintCodeBlocks: true,
    }),
  },
  {
    ...mdx.flatCodeBlocks,
    rules: {
      ...mdx.flatCodeBlocks.rules,
      // Override code block specific rules
      "no-var": "error",
      "prefer-const": "error",
      "no-console": "warn",
    },
  },
  eslintConfigPrettier,
  {
    plugins: {
      onlyWarn,
    },
  },
]