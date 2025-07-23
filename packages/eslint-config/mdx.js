import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import onlyWarn from "eslint-plugin-only-warn"
import prettierPlugin from "eslint-plugin-prettier"
import reactPlugin from "eslint-plugin-react"
import * as mdxPlugin from "eslint-plugin-mdx"

/**
 * ESLint configuration for MDX files.
 * Catches common MDX parsing issues like unescaped angle brackets.
 *
 * @type {import("eslint").Linter.Config}
 */
export default [
  js.configs.recommended,
  eslintConfigPrettier,
  {
    files: ["**/*.mdx"],
    plugins: {
      react: reactPlugin,
      mdx: mdxPlugin,
      prettier: prettierPlugin,
    },
    languageOptions: {
      parser: mdxPlugin.parser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      // Catch unescaped angle brackets like <50, >30, etc.
      "react/no-unescaped-entities": ["error", {
        "forbid": ["<", ">", "{", "}", "'", "\""]
      }],
      
      // Ensure proper JSX syntax
      "react/jsx-curly-brace-presence": "error",
      "react/jsx-no-undef": "error",
      
      // Prettier formatting
      "prettier/prettier": "error",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    plugins: {
      onlyWarn,
    },
  },
]