import baseConfig from "./base.js"

/**
 * A custom ESLint configuration for Vitest test files.
 *
 * @type {import("eslint").Linter.Config}
 * */
export default [
  ...baseConfig,
  {
    files: ["**/*.test.{js,ts,tsx}", "**/*.spec.{js,ts,tsx}", "**/tests/**/*", "**/test/**/*"],
    rules: {
      // Allow console in tests for debugging
      "no-console": "off",
      
      // Vitest-specific rules (using general JS rules since no vitest ESLint plugin exists yet)
      // Prevent common testing mistakes
      "no-focused-tests": "off", // This would be for vitest if available
      "no-disabled-tests": "off", // This would be for vitest if available
      
      // Allow any in tests for mocking
      "@typescript-eslint/no-explicit-any": "warn",
      
      // Allow unused vars in tests (test parameters, etc.)
      "@typescript-eslint/no-unused-vars": ["error", { 
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_" 
      }],
      
      // Allow default exports in test files
      "import/no-default-export": "off",
      
      // Relax some strict rules for test files
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
]