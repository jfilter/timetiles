import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import importPlugin from "eslint-plugin-import"
import onlyWarn from "eslint-plugin-only-warn"
import prettierPlugin from "eslint-plugin-prettier"
import promisePlugin from "eslint-plugin-promise"
import regexpPlugin from "eslint-plugin-regexp"
import securityPlugin from "eslint-plugin-security"
import sonarPlugin from "eslint-plugin-sonarjs"
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
      
      // 2024 TypeScript Enhancements
      "@typescript-eslint/no-base-to-string": "error",
      "@typescript-eslint/no-meaningless-void-operator": "error",
      "@typescript-eslint/no-mixed-enums": "error",
      "@typescript-eslint/no-unnecessary-template-expression": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/prefer-find": "error",
      "@typescript-eslint/prefer-promise-reject-errors": "error",
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
      security: securityPlugin,
      promise: promisePlugin,
      sonarjs: sonarPlugin,
      regexp: regexpPlugin,
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
      
      // Security Rules (Critical for production)
      "security/detect-object-injection": "error",
      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "error",
      "security/detect-disable-mustache-escape": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-possible-timing-attacks": "warn",
      "security/detect-pseudoRandomBytes": "error",
      "security/detect-unsafe-regex": "error",
      
      // Promise Best Practices
      "promise/always-return": "error",
      "promise/no-return-wrap": "error",
      "promise/param-names": "error",
      "promise/catch-or-return": "error",
      "promise/no-new-statics": "error",
      "promise/no-return-in-finally": "error",
      "promise/valid-params": "error",
      "promise/prefer-await-to-then": "warn",
      
      // Code Quality (SonarJS)
      "sonarjs/cognitive-complexity": ["error", 15],
      "sonarjs/no-duplicate-string": ["error", { "threshold": 3 }],
      "sonarjs/no-small-switch": "error",
      "sonarjs/prefer-single-boolean-return": "error",
      "sonarjs/no-redundant-boolean": "error",
      "sonarjs/no-identical-functions": "error",
      "sonarjs/no-inverted-boolean-check": "error",
      "sonarjs/prefer-while": "error",
      
      // RegExp Safety & Performance
      "regexp/no-super-linear-backtracking": "error",
      "regexp/no-potentially-useless-backreference": "error",
      "regexp/optimal-quantifier-concatenation": "error",
      "regexp/prefer-regexp-exec": "error",
      "regexp/no-useless-escape": "error",
      "regexp/no-empty-capturing-group": "error",
      
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
      "import/no-namespace": "warn", // Discourages import * as foo
      "import/no-self-import": "error", // Prevent importing from self
      
      // Phase 4: Monorepo Governance
      "no-restricted-imports": ["error", {
        "patterns": [
          {
            "group": ["../**/apps/*"],
            "message": "Don't import across app boundaries"
          },
          {
            "group": [
              "*/index", 
              "*/index.js", 
              "*/index.ts", 
              "*/index.tsx"
            ],
            "message": "Avoid barrel imports. Import directly from source files for better tree-shaking and clearer dependencies."
          },
          {
            "group": [
              "./index", 
              "./index.js", 
              "./index.ts", 
              "./index.tsx"
            ],
            "message": "Avoid importing from local index files. Import directly from the source file."
          }
        ]
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
      
      // Unicorn rules that prevent barrel file patterns
      "unicorn/prefer-export-from": ["error", {"ignoreUsedVariables": true}], // Prevent unnecessary re-export patterns
      
      // High-value unicorn rules for code quality
      "unicorn/prefer-includes": "error", // arr.includes(x) vs arr.indexOf(x) !== -1
      "unicorn/prefer-string-starts-ends-with": "error", // str.startsWith() vs str.indexOf() === 0
      "unicorn/throw-new-error": "error", // throw new Error() vs throw "string"  
      "unicorn/no-instanceof-array": "error", // Array.isArray() vs instanceof Array
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
