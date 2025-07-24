import js from "@eslint/js"
import pluginNext from "@next/eslint-plugin-next"
import pluginQuery from "@tanstack/eslint-plugin-query"
import eslintConfigPrettier from "eslint-config-prettier"
import pluginJsxA11y from "eslint-plugin-jsx-a11y"
import pluginReact from "eslint-plugin-react"
import pluginReactHooks from "eslint-plugin-react-hooks"
import globals from "globals"
import tseslint from "typescript-eslint"

import baseConfig from "./base.js"

/**
 * A custom ESLint configuration for libraries that use Next.js.
 *
 * @type {import("eslint").Linter.Config}
 * */
export default [
  ...baseConfig,
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  {
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: {
        ...globals.serviceworker,
      },
    },
  },
  {
    plugins: {
      "@next/next": pluginNext,
    },
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
    },
  },
  {
    plugins: {
      "react-hooks": pluginReactHooks,
      "jsx-a11y": pluginJsxA11y,
      "@tanstack/query": pluginQuery,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
      // React scope no longer necessary with new JSX transform.
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      
      // Phase 3: React/Next.js Safety Rules
      "react-hooks/exhaustive-deps": "error",
      "@next/next/no-img-element": "error",
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-is-valid": "error",
      
      // Enhanced Accessibility Rules
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/lang": "error",
      "jsx-a11y/no-redundant-roles": "error",
      
      // React Query Rules (Performance & Best Practices)
      "@tanstack/query/exhaustive-deps": "error",
      "@tanstack/query/no-rest-destructuring": "error",
      "@tanstack/query/stable-query-client": "error",
      "@tanstack/query/no-unstable-deps": "error",
      "@tanstack/query/infinite-query-property-order": "error",
    },
  },
  // Override for Next.js files that require default exports
  {
    files: [
      "**/app/**/page.{ts,tsx}",
      "**/app/**/layout.{ts,tsx}",
      "**/app/**/loading.{ts,tsx}",
      "**/app/**/error.{ts,tsx}",
      "**/app/**/not-found.{ts,tsx}",
      "**/app/**/route.{ts,tsx}",
      "**/app/**/global-error.{ts,tsx}",
      "**/middleware.{ts,tsx}",
      "**/instrumentation.{ts,tsx}",
      "**/*.config.{js,ts,mjs}",
      "**/collections/*.{ts,tsx}",
    ],
    rules: {
      "import/no-default-export": "off",
    },
  },
]
