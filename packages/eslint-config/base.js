import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import boundariesPlugin from "eslint-plugin-boundaries";
import importPlugin from "eslint-plugin-import";
import preferArrowFunctions from "eslint-plugin-prefer-arrow-functions";
import prettierPlugin from "eslint-plugin-prettier";
import promisePlugin from "eslint-plugin-promise";
import regexpPlugin from "eslint-plugin-regexp";
import securityPlugin from "eslint-plugin-security";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import sonarPlugin from "eslint-plugin-sonarjs";
import turboPlugin from "eslint-plugin-turbo";
import unicornPlugin from "eslint-plugin-unicorn";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

/**
 * A shared ESLint configuration for the repository.
 *
 * @type {import("eslint").Linter.Config}
 * */
export default [
  js.configs.recommended,
  eslintConfigPrettier,
  sonarPlugin.configs.recommended,
  ...tseslint.configs.recommended,
  // Apply type-aware rules only to TypeScript files
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Type-aware rules that require TypeScript project information
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/return-await": "error",
      // Tone down the overly strict type-aware rules that are causing noise
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-redundant-type-constituents": "warn",

      // Phase 2: TypeScript Enhancements
      "@typescript-eslint/strict-boolean-expressions": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "interface",
          format: ["PascalCase"],
          custom: {
            regex: "^I[A-Z]",
            match: false,
          },
        },
      ],

      // 2024 TypeScript Enhancements
      "@typescript-eslint/no-base-to-string": "error",
      "@typescript-eslint/no-meaningless-void-operator": "error",
      "@typescript-eslint/no-mixed-enums": "error",
      "@typescript-eslint/no-unnecessary-template-expression": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/prefer-find": "error",
      "@typescript-eslint/prefer-promise-reject-errors": "error",

      // Additional SonarCloud alignment
      "@typescript-eslint/prefer-regexp-exec": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/no-duplicate-type-constituents": "error",
      "@typescript-eslint/no-useless-empty-export": "error",
    },
  },
  // Config files and other JS files without type checking
  {
    files: ["**/*.js", "**/*.mjs", "**/*.config.*"],
    languageOptions: {
      parserOptions: {
        allowDefaultProject: true,
      },
    },
  },
  {
    plugins: {
      turbo: turboPlugin,
      prettier: prettierPlugin,
      import: importPlugin,
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
      boundaries: boundariesPlugin,
      unicorn: unicornPlugin,
      security: securityPlugin,
      promise: promisePlugin,
      regexp: regexpPlugin,
      "prefer-arrow-functions": preferArrowFunctions,
    },
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "apps/*" },
        { type: "app-web", pattern: "apps/web/**/*" },
        { type: "app-docs", pattern: "apps/docs/**/*" },
        { type: "package", pattern: "packages/*/**/*" },
        { type: "web-api", pattern: "apps/web/app/api/**/*" },
        { type: "web-components", pattern: "apps/web/components/**/*" },
        { type: "web-lib", pattern: "apps/web/lib/**/*" },
        { type: "web-pages", pattern: "apps/web/app/**/page.tsx" },
        { type: "root", pattern: ["*.js", "*.ts", "*.json", "scripts/**/*"] },
      ],
    },
    rules: {
      // Prettier (affects all code formatting)
      "prettier/prettier": "error",

      // ESLint Core
      "no-async-promise-executor": "error",
      "no-case-declarations": "error",
      "no-console": "error",
      "prefer-const": "error",
      "require-atomic-updates": "error",
      "max-params": ["error", 7],
      complexity: ["error", 15],
      "max-nested-callbacks": ["error", 4],
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-unused-expressions": "error",

      // TypeScript
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": "error",

      // Security
      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "error",
      "security/detect-disable-mustache-escape": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-possible-timing-attacks": "warn",
      "security/detect-pseudoRandomBytes": "error",
      "security/detect-unsafe-regex": "error",

      // Promise
      "promise/always-return": "error",
      "promise/catch-or-return": "error",
      "promise/no-new-statics": "error",
      "promise/no-return-in-finally": "error",
      "promise/no-return-wrap": "error",
      "promise/param-names": "error",
      "promise/prefer-await-to-then": "warn",
      "promise/valid-params": "error",

      // RegExp
      "regexp/no-empty-capturing-group": "error",
      "regexp/no-potentially-useless-backreference": "error",
      "regexp/no-super-linear-backtracking": "error",
      "regexp/no-useless-escape": "error",
      "regexp/optimal-quantifier-concatenation": "error",
      "regexp/prefer-regexp-exec": "error",

      // SonarJS
      "sonarjs/cognitive-complexity": ["error", 15],
      "sonarjs/max-lines": ["error", { maximum: 500 }],
      "sonarjs/max-lines-per-function": ["error", { maximum: 50 }],
      "sonarjs/no-collapsible-if": "error",
      "sonarjs/no-duplicate-string": ["error", { threshold: 3 }],
      "sonarjs/no-element-overwrite": "error",
      "sonarjs/no-empty-collection": "error",
      "sonarjs/no-extra-arguments": "error",
      "sonarjs/no-gratuitous-expressions": "error",
      "sonarjs/no-nested-switch": "error",
      "sonarjs/no-useless-catch": "error",
      "sonarjs/prefer-immediate-return": "error",
      "sonarjs/prefer-object-literal": "error",
      "sonarjs/todo-tag": "off",

      // Import & Sorting
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" },
      ],
      "import/no-cycle": "error",
      "import/no-default-export": "warn",
      "import/no-namespace": "warn",
      "import/no-self-import": "error",
      // Disable import/order in favor of simple-import-sort
      "import/order": "off",

      // Boundaries (Monorepo Architecture)
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            // Apps can use packages but not other apps
            {
              from: ["app-web", "app-docs"],
              allow: ["package", "package-ui", "package-config"],
            },
            // Packages can only use other packages
            {
              from: "package",
              allow: ["package"],
            },
            // Web app internal boundaries
            {
              from: "web-components",
              allow: ["web-lib", "package"],
            },
            {
              from: "web-pages",
              allow: ["web-components", "web-lib", "package"],
            },
            {
              from: "web-api",
              allow: ["web-lib", "package"],
            },
            // Root can access everything
            {
              from: "root",
              allow: "*",
            },
          ],
        },
      ],
      "boundaries/external": [
        "error",
        {
          default: "allow",
          rules: [],
        },
      ],

      // Unicorn
      "unicorn/filename-case": [
        "error",
        {
          case: "kebabCase",
          ignore: [
            "^page\\.tsx?$",
            "^layout\\.tsx?$",
            "^loading\\.tsx?$",
            "^error\\.tsx?$",
            "^not-found\\.tsx?$",
            "^route\\.ts$",
            "^middleware\\.ts$",
            "^instrumentation\\.ts$",
            "^\\[[\\w-]+\\]\\.tsx?$",
            "^\\[\\[\\.\\.\\.\\w+\\]\\]\\.tsx?$",
            "\\.config\\.(js|ts|mjs)$",
            "\\.d\\.ts$",
            "\\.test\\.tsx?$",
            // Note: .spec. files are not allowed - use .test. instead
            "^README\\.md$",
            "^CLAUDE\\.md$",
            "^\\d{8}_.*\\.ts$",
          ],
        },
      ],
      "unicorn/no-instanceof-array": "error",
      "unicorn/prefer-export-from": ["error", { ignoreUsedVariables: true }],
      "unicorn/prefer-includes": "error",
      "unicorn/prefer-string-starts-ends-with": "error",
      "unicorn/throw-new-error": "error",

      // Function declaration consistency
      "prefer-arrow-functions/prefer-arrow-functions": [
        "error",
        {
          classPropertiesAllowed: false,
          disallowPrototype: false,
          returnStyle: "unchanged",
          singleReturnOnly: false,
        },
      ],

      // Project-specific
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["../**/apps/*"], message: "Don't import across app boundaries" },
            { group: ["*/index", "*/index.js", "*/index.ts", "*/index.tsx"], message: "Avoid barrel imports" },
            { group: ["./index", "./index.js", "./index.ts", "./index.tsx"], message: "Avoid local index imports" },
            {
              group: ["../../*", "../../../*", "../../../../*", "../../../../../*"],
              message: "Use @/ path alias instead of deep relative imports (../../)",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.object.object.name='Object'][callee.object.property.name='prototype'][callee.property.name='hasOwnProperty']",
          message: "Use Object.hasOwn() instead of Object.prototype.hasOwnProperty.call()"
        }
      ],
      "turbo/no-undeclared-env-vars": "error",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", ".next/**", "coverage/**"],
  },
];
