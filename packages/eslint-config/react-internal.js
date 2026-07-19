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
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactCompiler from "eslint-plugin-react-compiler";
import reactHooks from "eslint-plugin-react-hooks";

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
      "jsx-a11y": jsxA11y,
    },
    settings: { react: { version: "detect" } },
    rules: {
      // React Compiler rules
      "react-compiler/react-compiler": "error",

      // React Hooks rules
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",

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

      // @eslint-react rules for modern React patterns (v5)
      // v5 dropped `no-useless-forward-ref` (which flagged only forwardRef that ignored the ref)
      // in favour of `no-forward-ref`, which flags EVERY use: React 19 passes ref as a normal prop,
      // so forwardRef is obsolete. That is a stricter check than the one it replaced and ~44 files
      // still use forwardRef, so it is a "warn" here — dropping to React-19 refs is a separate
      // codebase migration, not part of a dependency bump.
      "@eslint-react/no-forward-ref": "warn",
      "@eslint-react/no-access-state-in-setstate": "error",
      "@eslint-react/no-array-index-key": "warn",
      "@eslint-react/no-children-count": "warn",
      "@eslint-react/no-children-for-each": "warn",
      "@eslint-react/no-children-map": "warn",
      "@eslint-react/no-children-only": "warn",
      "@eslint-react/no-children-to-array": "warn",
      "@eslint-react/no-clone-element": "warn",
      "@eslint-react/jsx-no-comment-textnodes": "error",
      "@eslint-react/no-component-will-mount": "error",
      "@eslint-react/no-component-will-receive-props": "error",
      "@eslint-react/no-component-will-update": "error",
      "@eslint-react/no-create-ref": "warn",
      "@eslint-react/no-direct-mutation-state": "error",
      "@eslint-react/no-implicit-key": "error",
      "@eslint-react/no-missing-key": "error",
      "@eslint-react/no-nested-component-definitions": "error",
      // Dropped by @eslint-react v5 as a legacy class-component concern; kept via the
      // equivalent eslint-plugin-react rule so the check is not silently lost.
      "react/no-redundant-should-component-update": "error",
      "@eslint-react/no-set-state-in-component-did-mount": "warn",
      "@eslint-react/no-set-state-in-component-did-update": "warn",
      "@eslint-react/no-set-state-in-component-will-update": "error",
      // Same: v5 dropped it (React 19 removed string refs outright); kept via eslint-plugin-react.
      "react/no-string-refs": "error",
      "@eslint-react/no-unsafe-component-will-mount": "error",
      "@eslint-react/no-unsafe-component-will-receive-props": "error",
      "@eslint-react/no-unsafe-component-will-update": "error",
      "@eslint-react/no-unused-class-component-members": "warn",
    },
  },
  {
    // Disable performance and strict rules in test files
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
    rules: {
      "react/display-name": "off",
      "react-hooks/exhaustive-deps": "off",
      "@eslint-react/no-array-index-key": "off",
      "@eslint-react/no-nested-component-definitions": "off",
    },
  },
];
