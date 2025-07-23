import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import importPlugin from "eslint-plugin-import"
import onlyWarn from "eslint-plugin-only-warn"
import prettierPlugin from "eslint-plugin-prettier"
import turboPlugin from "eslint-plugin-turbo"
import unicornPlugin from "eslint-plugin-unicorn"
import tseslint from "typescript-eslint"

/**
 * A shared ESLint configuration for the repository.
 *
 * @type {import("eslint").Linter.Config}
 * */
export default [
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  // Apply type-aware rules only to TypeScript files
  ...tseslint.configs.recommendedTypeChecked.map(config => ({
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
      "@typescript-eslint/naming-convention": ["error", {
        "selector": "interface",
        "format": ["PascalCase"],
        "custom": {
          "regex": "^I[A-Z]",
          "match": false
        }
      }],
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
      unicorn: unicornPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "error",
      "prettier/prettier": "error",
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "prefer-const": "error",
      "no-case-declarations": "error",
      
      // Phase 1: Database Operation Safety
      "no-async-promise-executor": "error",
      "require-atomic-updates": "error",
      
      // Phase 2: Import/Export Organization
      "import/order": ["error", {
        "groups": [
          ["builtin", "external"],
          ["internal", "parent", "sibling", "index"]
        ],
        "newlines-between": "always",
        "alphabetize": { "order": "asc" }
      }],
      "import/no-default-export": "warn",
      "import/no-cycle": "error",
      
      // Phase 4: Monorepo Governance
      "no-restricted-imports": ["error", {
        "patterns": [{
          "group": ["../**/apps/*"],
          "message": "Don't import across app boundaries"
        }]
      }],
      
      // File naming convention
      "unicorn/filename-case": [
        "error",
        {
          case: "kebabCase",
          ignore: [
            // Next.js App Router conventions
            "^page\\.tsx?$",
            "^layout\\.tsx?$",
            "^loading\\.tsx?$",
            "^error\\.tsx?$",
            "^not-found\\.tsx?$",
            "^route\\.ts$",
            "^middleware\\.ts$",
            "^instrumentation\\.ts$",
            
            // Dynamic routes
            "^\\[[\\w-]+\\]\\.tsx?$",
            "^\\[\\[\\.\\.\\.\\w+\\]\\]\\.tsx?$",
            
            // Configuration files
            "\\.config\\.(js|ts|mjs)$",
            
            // Type declarations
            "\\.d\\.ts$",
            
            // Test files (if you prefer .test.ts over -test.ts)
            "\\.test\\.tsx?$",
            "\\.spec\\.tsx?$",
            
            // Documentation
            "^README\\.md$",
            "^CLAUDE\\.md$",
          ]
        }
      ],
    },
  },
  {
    plugins: {
      onlyWarn,
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", ".next/**", "coverage/**"],
  },
]
