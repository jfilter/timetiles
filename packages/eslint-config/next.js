import js from "@eslint/js"
import pluginNext from "@next/eslint-plugin-next"
import pluginQuery from "@tanstack/eslint-plugin-query"
import eslintConfigPrettier from "eslint-config-prettier"
import pluginJsxA11y from "eslint-plugin-jsx-a11y"
import pluginReact from "eslint-plugin-react"
import pluginReactHooks from "eslint-plugin-react-hooks"
import pluginReactPerf from "eslint-plugin-react-perf"
import pluginReactCompiler from "eslint-plugin-react-compiler"
// NOTE: eslint-plugin-tailwindcss is not included due to Tailwind CSS v4 incompatibility
// Both the stable and beta versions fail to detect Tailwind v4 configuration
// The plugin expects traditional tailwind.config.js but v4 uses CSS-based config
// Alternatives: prettier-plugin-tailwindcss (already installed) handles class ordering
import reactCompilerPlugin from "@eslint-react/eslint-plugin";
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
  // @eslint-react recommended config
  {
    ...reactCompilerPlugin.configs.recommended,
    plugins: {
      ...reactCompilerPlugin.configs.recommended.plugins,
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
      "react-perf": pluginReactPerf,
      "react-compiler": pluginReactCompiler,
      // Tailwind CSS linting disabled - see import comment above
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
      // React scope no longer necessary with new JSX transform.
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      
      // React Rules to match SonarCloud
      "react/no-array-index-key": "error",
      "react/jsx-no-constructed-context-values": "error",
      "react/jsx-no-useless-fragment": "error",
      "react/no-unstable-nested-components": "error",
      "react/self-closing-comp": "error",
      "react/jsx-boolean-value": ["error", "never"],
      "react/jsx-fragments": ["error", "syntax"],
      "react/no-unused-state": "error",
      "react/prefer-stateless-function": "error",
      "react/jsx-props-no-spreading": "off", // Too restrictive for modern React patterns
      
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
      "jsx-a11y/label-has-associated-control": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/interactive-supports-focus": "error",
      "jsx-a11y/no-noninteractive-element-interactions": "error",
      
      // React Query Rules (Performance & Best Practices)
      "@tanstack/query/exhaustive-deps": "error",
      "@tanstack/query/no-rest-destructuring": "error",
      "@tanstack/query/stable-query-client": "error",
      "@tanstack/query/no-unstable-deps": "error",
      "@tanstack/query/infinite-query-property-order": "error",

      // React Performance Rules (configured for practical development)
      "react-perf/jsx-no-new-object-as-prop": "warn", // Warn instead of error for objects
      "react-perf/jsx-no-new-array-as-prop": "warn", // Warn instead of error for arrays
      "react-perf/jsx-no-new-function-as-prop": "warn", // Warn for functions (very common pattern)
      "react-perf/jsx-no-jsx-as-prop": "error", // Keep error for JSX (more problematic)

      // Tailwind CSS Rules: Currently disabled due to v4 incompatibility
      // prettier-plugin-tailwindcss handles class ordering in the meantime
      // TODO: Re-enable when eslint-plugin-tailwindcss supports Tailwind v4

      // React Compiler Rules (React 19) - Applied via recommended config above
      "react-compiler/react-compiler": "error",

      // Enhanced Next.js Rules
      "@next/next/no-before-interactive-script-outside-document": "error",
      "@next/next/no-css-tags": "error",
      "@next/next/no-head-element": "error",
      "@next/next/no-html-link-for-pages": "error",
      "@next/next/no-script-component-in-head": "error",
      "@next/next/no-styled-jsx-in-document": "error",
      "@next/next/no-sync-scripts": "error",
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
      // Allow regular function declarations in API routes and config files for clarity
      "prefer-arrow-functions/prefer-arrow-functions": "off",
    },
  },
];
