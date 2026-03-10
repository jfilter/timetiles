/**
 * Minimal ESLint configuration for rules oxlint cannot implement.
 *
 * oxlint (with JS plugins) now handles 436 rules via .oxlintrc.json.
 * This ESLint config only enforces the 6 rules that have no oxlint equivalent:
 *   1. jsdoc/require-file-overview — requires @module tag on every file
 *   2. jsdoc/check-tag-names — validates @module and @category tags
 *   3. jsdoc/empty-tags — @module tag must be empty (TypeDoc)
 *   4. @typescript-eslint/naming-convention — interface PascalCase, no I prefix
 *   5. no-restricted-syntax — blocks Object.prototype.hasOwnProperty.call()
 *   6. require-atomic-updates — race condition detection
 *   7. unicorn/prefer-export-from — re-export pattern
 *
 * See ADR 0015 for the full migration rationale.
 *
 * @module
 */
import jsdocPlugin from "eslint-plugin-jsdoc";
import unicornPlugin from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

/**
 * Default global ignores for the monorepo.
 * Apps should include this as the FIRST item in their config array.
 *
 * @example
 * import baseConfig, { defaultIgnores } from "@timetiles/eslint-config/base";
 * export default [defaultIgnores, ...baseConfig];
 */
export const defaultIgnores = {
  ignores: [
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "**/coverage/**",
    "**/.turbo/**",
    "**/payload-types.ts",
    "**/.eslintcache",
    "**/*.d.ts", // TypeScript declaration files (auto-generated, should not be linted)
    "**/*.d.ts.map", // Source maps for declaration files
    "**/.worktrees/**", // Git worktrees
    "**/.claude/**", // Claude Code agent data
  ],
};

/**
 * Minimal ESLint config — only rules oxlint cannot handle.
 *
 * @type {import("eslint").Linter.Config}
 */
export default [
  // TypeScript parser for naming-convention (type-aware)
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    // Only keep the parser setup, disable all rules from recommended
    rules: {},
  })),
  // Type-aware parsing for TS files (needed for naming-convention)
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      jsdoc: jsdocPlugin,
      unicorn: unicornPlugin,
    },
    rules: {
      // --- Rules oxlint cannot implement ---

      // 1. @typescript-eslint/naming-convention — interface PascalCase, no I prefix
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

      // 2. require-atomic-updates — race condition detection
      "require-atomic-updates": "error",

      // 3. no-restricted-syntax — blocks Object.prototype.hasOwnProperty.call()
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.type='MemberExpression'][callee.object.object.object.name='Object'][callee.object.object.property.name='hasOwnProperty'][callee.object.property.name='call']",
          message: "Use Object.hasOwn() instead of Object.prototype.hasOwnProperty.call()",
        },
      ],

      // 4. jsdoc/require-file-overview — requires @module tag
      "jsdoc/require-file-overview": [
        "error",
        {
          tags: {
            module: {
              initialCommentsOnly: true,
              mustExist: true,
              preventDuplicates: true,
            },
          },
        },
      ],

      // 5. jsdoc/check-tag-names — validates @module and @category tags
      "jsdoc/check-tag-names": [
        "error",
        {
          definedTags: ["module", "category"],
        },
      ],

      // 6. jsdoc/empty-tags — @module should be empty (TypeDoc requirement)
      "jsdoc/empty-tags": [
        "error",
        {
          tags: ["module"],
        },
      ],

      // 7. unicorn/prefer-export-from — re-export pattern
      "unicorn/prefer-export-from": ["error", { ignoreUsedVariables: true }],
    },
  },
  // JS/config files — only jsdoc rules (no type-aware rules)
  {
    files: ["**/*.js", "**/*.mjs", "**/*.config.*"],
    plugins: {
      jsdoc: jsdocPlugin,
    },
    languageOptions: {
      parserOptions: {
        allowDefaultProject: true,
      },
    },
    rules: {
      "jsdoc/require-file-overview": [
        "error",
        {
          tags: {
            module: {
              initialCommentsOnly: true,
              mustExist: true,
              preventDuplicates: true,
            },
          },
        },
      ],
      "jsdoc/check-tag-names": [
        "error",
        {
          definedTags: ["module", "category"],
        },
      ],
      "jsdoc/empty-tags": [
        "error",
        {
          tags: ["module"],
        },
      ],
    },
  },
];
