import mdxConfig from "@workspace/eslint-config/mdx";

/** @type {import("eslint").Linter.Config[]} */
export default [
  // Global ignores for auto-generated API documentation
  {
    ignores: [
      "content/reference/api/**/*.md",
      "content/reference/api/**/*.mdx",
      "content/reference/api/**/_meta.js",
      // Keep manual files
      "!content/reference/api/index.mdx",
      "!content/reference/api/_meta.js",
    ],
  },
  // Apply MDX config to all MDX/MD files (except those ignored above)
  ...mdxConfig,
  // Override for MDX files to handle JSX imports
  {
    files: ["**/*.mdx"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off", // MDX imports are used in JSX
      "no-unused-vars": "off", // MDX imports are used in JSX
      "sonarjs/max-lines": ["error", { maximum: 1000 }], // Documentation files can be longer
    },
  },
  // Override for _meta.js files - simple config files don't need JSDoc
  {
    files: ["**/_meta.js"],
    rules: {
      "jsdoc/require-file-overview": "off",
    },
  },
  // Scripts configuration - Node.js environment with relaxed rules (TypeScript only)
  {
    files: ["scripts/**/*.ts"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        global: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        clearImmediate: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
      },
    },
    rules: {
      "no-console": "off", // Scripts can use console for output
      "no-undef": "off", // Node.js globals are available
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "sonarjs/slow-regex": "off", // Scripts may need complex regex patterns
      "regexp/no-super-linear-backtracking": "off", // Allow complex regex for scripts
      "sonarjs/cognitive-complexity": "off", // Scripts can be complex
      "sonarjs/no-ignored-exceptions": "off", // Scripts can have catch-all error handling
      "sonarjs/anchor-precedence": "off", // Allow regex patterns as needed
      "sonarjs/updated-loop-counter": "off", // Allow loop counter updates
      "prefer-const": "off", // Scripts may need let
      "@typescript-eslint/prefer-regexp-exec": "off", // Allow match method
      "sonarjs/prefer-regexp-exec": "off", // Allow match method
      "promise/prefer-await-to-then": "off", // Allow then/catch
      "no-useless-escape": "off", // Scripts may need escapes
      "regexp/no-useless-escape": "off", // Scripts may need escapes
    },
  },
  // Disallow JavaScript files in scripts directory
  {
    files: ["scripts/**/*.js"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "JavaScript files are not allowed in the scripts directory. Please use TypeScript (.ts) files instead.",
        },
      ],
    },
  },
];
