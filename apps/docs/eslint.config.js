import mdxConfig, { defaultIgnores, oxlintBridge } from "@timetiles/eslint-config/mdx";

/** @type {import("eslint").Linter.Config[]} */
export default [
  // Global ignores from shared config + app-specific ignores
  defaultIgnores,
  // Apply MDX config to all MDX/MD files
  ...mdxConfig,
  // Override for MDX files to handle JSX imports
  {
    files: ["**/*.mdx"],
    rules: {
      "unused-imports/no-unused-imports": "off", // MDX imports are used in JSX components
      "sonarjs/max-lines": ["error", { maximum: 1000 }], // Documentation files can be longer
    },
  },
  // Override for _meta.js files - simple config files don't need JSDoc
  { files: ["**/_meta.js"], rules: { "jsdoc/require-file-overview": "off" } },
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
      "no-undef": "off", // Node.js globals are available
      "sonarjs/slow-regex": "off", // Scripts may need complex regex patterns
      "regexp/no-super-linear-backtracking": "off", // Allow complex regex for scripts
      "sonarjs/cognitive-complexity": "off", // Scripts can be complex
      "sonarjs/no-ignored-exceptions": "off", // Scripts can have catch-all error handling
      "sonarjs/anchor-precedence": "off", // Allow regex patterns as needed
      "sonarjs/updated-loop-counter": "off", // Allow loop counter updates
      "sonarjs/prefer-regexp-exec": "off", // Allow match method
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
  // Must stay last, see oxlintBridge.
  ...oxlintBridge,
];
