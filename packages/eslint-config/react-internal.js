/**
 * This file contains the ESLint configuration for internal React packages.
 *
 * It extends the base configuration and adds React-specific rules, including those
 * from the React Compiler and performance-related plugins. This configuration is
 * intended for internal UI packages and components within the monorepo.
 *
 * @module
 */
import eslintReact from "@eslint-react/eslint-plugin";
import react from "eslint-plugin-react";
import reactCompiler from "eslint-plugin-react-compiler";
import reactHooks from "eslint-plugin-react-hooks";
import reactPerf from "eslint-plugin-react-perf";

import baseConfig from "./base.js";

/**
 * @type {import("eslint").Linter.Config}
 */
export default [
  ...baseConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      react: react,
      "react-hooks": reactHooks,
      "@eslint-react": eslintReact,
      "react-compiler": reactCompiler,
      "react-perf": reactPerf,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // React Compiler rules
      "react-compiler/react-compiler": "error",

      // React Hooks rules
      "react-hooks/rules-of-hooks": "error",
      // Set to warn as React Compiler may optimize dependencies differently
      "react-hooks/exhaustive-deps": "warn",

      // Core React rules (minimal set, most handled by @eslint-react)
      "react/jsx-uses-react": "off", // Not needed with React 17+ JSX transform
      "react/react-in-jsx-scope": "off", // Not needed with React 17+ JSX transform
      "react/prop-types": "off", // TypeScript handles this
      "react/jsx-uses-vars": "error", // Still needed for variable usage detection
      "react/display-name": "warn", // Warn as React Compiler may handle this
      // Additional React rules not covered by @eslint-react
      "react/jsx-boolean-value": ["error", "never"],
      "react/jsx-curly-brace-presence": ["error", { props: "never", children: "never" }],
      "react/jsx-fragments": ["error", "syntax"],
      "react/jsx-pascal-case": "error",
      "react/self-closing-comp": "error",
      "react/void-dom-elements-no-children": "error",
      "react/jsx-no-target-blank": "error",
      "react/jsx-no-duplicate-props": "error",
      "react/jsx-no-undef": "error",
      "react/no-danger-with-children": "error",
      "react/no-deprecated": "error",
      "react/no-find-dom-node": "error",
      "react/no-is-mounted": "error",
      "react/no-render-return-value": "error",
      "react/no-unknown-property": "error",
      "react/no-unsafe": "warn",
      "react/require-render-return": "error",
      "react/no-unescaped-entities": "error",
      "react/no-children-prop": "error",

      // React performance rules
      "react-perf/jsx-no-new-object-as-prop": "error",
      "react-perf/jsx-no-new-array-as-prop": "error",
      "react-perf/jsx-no-new-function-as-prop": "error",

      // @eslint-react rules for modern React patterns
      "@eslint-react/no-unstable-default-props": "warn",
      "@eslint-react/no-leaked-conditional-rendering": "warn",
      "@eslint-react/ensure-forward-ref-using-ref": "error",
      "@eslint-react/no-access-state-in-setstate": "error",
      "@eslint-react/no-array-index-key": "warn",
      "@eslint-react/no-children-count": "warn",
      "@eslint-react/no-children-for-each": "warn",
      "@eslint-react/no-children-map": "warn",
      "@eslint-react/no-children-only": "warn",
      "@eslint-react/no-children-to-array": "warn",
      "@eslint-react/no-clone-element": "warn",
      "@eslint-react/no-comment-textnodes": "error",
      "@eslint-react/no-component-will-mount": "error",
      "@eslint-react/no-component-will-receive-props": "error",
      "@eslint-react/no-component-will-update": "error",
      "@eslint-react/no-create-ref": "warn",
      "@eslint-react/no-direct-mutation-state": "error",
      "@eslint-react/no-duplicate-key": "error",
      "@eslint-react/no-implicit-key": "error",
      "@eslint-react/no-missing-key": "error",
      "@eslint-react/no-nested-components": "error",
      "@eslint-react/no-redundant-should-component-update": "error",
      "@eslint-react/no-set-state-in-component-did-mount": "warn",
      "@eslint-react/no-set-state-in-component-did-update": "warn",
      "@eslint-react/no-set-state-in-component-will-update": "error",
      "@eslint-react/no-string-refs": "error",
      "@eslint-react/no-unsafe-component-will-mount": "error",
      "@eslint-react/no-unsafe-component-will-receive-props": "error",
      "@eslint-react/no-unsafe-component-will-update": "error",
      "@eslint-react/no-unused-class-component-members": "warn",
      "@eslint-react/no-unused-state": "warn",
      "@eslint-react/no-useless-fragment": "warn",
      "@eslint-react/prefer-destructuring-assignment": "warn",
      "@eslint-react/prefer-shorthand-boolean": "warn",
      "@eslint-react/prefer-shorthand-fragment": "warn",
    },
  },
  {
    // Disable performance and strict rules in test files
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
    rules: {
      "react-perf/jsx-no-new-object-as-prop": "off",
      "react-perf/jsx-no-new-array-as-prop": "off",
      "react-perf/jsx-no-new-function-as-prop": "off",
      "react/display-name": "off",
      "react-hooks/exhaustive-deps": "off",
      "@eslint-react/no-unstable-default-props": "off",
      "@eslint-react/no-array-index-key": "off",
      "@eslint-react/no-nested-components": "off",
    },
  },
];
