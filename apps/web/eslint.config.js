import baseConfig from "@workspace/eslint-config/next-js";

/** @type {import("eslint").Linter.Config} */
export default [
  ...baseConfig,
  // Override parserOptions to point to this project's tsconfig
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "sonarjs/no-unused-vars": "error",
      // Allow unused variables with _ prefix (in some cases not found by SonarJS)
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_", // Allow _ prefix for intentionally unused args
          varsIgnorePattern: "^_", // Allow _ prefix for intentionally unused vars
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_", // Allow _ prefix for unused caught errors
          ignoreRestSiblings: true, // Allow unused rest siblings in destructuring
        },
      ],
    },
  },
  // Migration files - allow long functions for SQL/schema changes
  {
    files: ["migrations/**/*.ts", "**/migrations/**/*.ts"],
    rules: {
      "sonarjs/max-lines-per-function": "off", // Migrations often need long functions
      "sonarjs/max-lines": "off", // Migration files can be very long
      "sonarjs/no-duplicate-string": "off", // SQL strings often repeat
      "@typescript-eslint/require-await": "off", // Migration functions may not use await
    },
  },
  // Generated files - disable most rules
  {
    files: ["**/payload-types.ts", "**/payload-generated-schema.ts", "**/*-generated.ts"],
    rules: {
      "sonarjs/max-lines": "off", // Generated files are often very long
      "sonarjs/max-lines-per-function": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "sonarjs/no-duplicate-string": "off",
    },
  },
  // Config files - relax strict typing and allow environment variables
  {
    files: ["**/*.config.{ts,js}", "**/playwright.config.ts", "**/vitest.config.ts", "**/eslint.config.js"],
    rules: {
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off", // Can't use type-aware rules on config files
      "turbo/no-undeclared-env-vars": "off", // Config files often use env vars
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-assignment": "off", // Config files often have dynamic imports
      "@typescript-eslint/no-unsafe-member-access": "off",
      "sonarjs/no-all-duplicated-branches": "off", // Common in config conditionals
      "sonarjs/no-hardcoded-passwords": "off", // Config files may have test credentials
      "sonarjs/no-duplicate-string": "off", // Config files often repeat strings
      "sonarjs/os-command": "off", // Config/scripts legitimately use OS commands
      "sonarjs/no-os-command-from-path": "off", // Config files may use PATH commands
    },
  },
  // Script files - relax rules for build/setup scripts
  {
    files: ["scripts/**/*.ts", "**/scripts/**/*.ts"],
    rules: {
      "sonarjs/max-lines-per-function": ["error", { maximum: 150 }], // Scripts often need longer functions
      "sonarjs/no-hardcoded-passwords": "off", // Scripts may have test passwords
      "sonarjs/os-command": "warn", // Scripts legitimately use OS commands
      "sonarjs/no-os-command-from-path": "off", // Scripts may use PATH commands
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/require-await": "off", // Scripts may have async functions without await
      "turbo/no-undeclared-env-vars": "off", // Scripts often use env vars
    },
  },
  // Test-specific overrides
  {
    files: ["tests/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      // Relax file size limits for test files
      "sonarjs/max-lines": ["error", { maximum: 2000 }], // Increased for integration tests
      "sonarjs/max-lines-per-function": ["error", { maximum: 1500 }], // Allow longer test functions for complex scenarios
      "sonarjs/cognitive-complexity": ["error", 30], // More complex test setups allowed
      // Allow longer functions in tests (setup, teardown, comprehensive test scenarios)
      complexity: ["error", 25], // Increase from 20 to 25 for tests
      "max-nested-callbacks": ["error", 6], // Increase from 5 to 6 for test nesting
      "sonarjs/no-nested-functions": "off", // Common in test scenarios
      // Relax some strict rules that are less important in tests
      "@typescript-eslint/no-explicit-any": "off", // Allow any in tests for mocking and flexibility
      // Allow relative imports in tests (common pattern for test utilities)
      "no-restricted-imports": "off",
      // Pseudorandom is often OK in tests
      "sonarjs/pseudo-random": "off", // Allow Math.random() in tests for test data generation
      // Test utilities often have duplicate functions for different scenarios
      "sonarjs/no-identical-functions": "off",
      "sonarjs/no-hardcoded-passwords": "off", // Test data may have mock passwords
      "sonarjs/no-duplicate-string": "off", // Test files often repeat strings for clarity
      // React performance rules are less critical in tests
      "react-perf/jsx-no-new-array-as-prop": "off", // Allow inline arrays in test JSX
      // Enforce kebab-case for test files (override base config exemption)
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
            "^README\\.md$",
            "^CLAUDE\\.md$",
            "^\\d{8}_.*\\.ts$",
            // Note: Removed \.test\.tsx?$ to enforce kebab-case for test files
            // Note: \.spec\.tsx?$ files are not allowed - use .test. instead
          ],
        },
      ],
    },
  },
  // Disallow .spec. files - use .test. instead
  {
    files: ["**/*.spec.{ts,tsx,js,jsx}"],
    rules: {
      "unicorn/filename-case": [
        "error",
        {
          case: "kebabCase",
          // This will always fail for .spec files, effectively disallowing them
          ignore: ["$^"], // Matches nothing, so all .spec files will be flagged
        },
      ],
    },
  },
  // Ignore patterns for performance
  {
    ignores: [
      "**/.next/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/uploads/**",
      "**/.turbo/**",
      "**/dist/**",
      "**/.eslintcache",
      "**/*.min.js",
      "**/*.bundle.js",
      "**/payload-generated-schema.ts", // Already handled above but also ignore for performance
      "**/payload-types.ts", // Already handled above but also ignore for performance
      "**/migrations/**", // Ignore migrations folder
    ],
  },
];
