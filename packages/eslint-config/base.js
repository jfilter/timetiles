/* eslint-disable sonarjs/no-duplicate-string -- Config file with inherent path repetition */
/**
 * This file contains the base ESLint configuration for the entire monorepo.
 *
 * It sets up a comprehensive set of rules and plugins to enforce a consistent and high-quality
 * code style. This includes configurations for TypeScript, import sorting, security,
 * promises, and more. It also defines architectural boundaries between different parts of the
 * monorepo to prevent incorrect dependencies.
 *
 * The configuration uses eslint-plugin-oxlint to automatically disable ESLint rules that
 * oxlint already handles, enabling a hybrid linting approach (oxlint for speed + ESLint
 * for specialized plugins).
 *
 * VERSION LOCKSTEP: eslint-plugin-oxlint declares a `~X.Y.0` peer on oxlint and is
 * published one minor BEHIND the linter, so the newest oxlint is routinely unusable.
 * `oxlint` is therefore tilde-pinned in the root package.json to the minor the plugin
 * supports — do not widen it to `^` or chase oxlint's latest, or install breaks the peer.
 * Both packages appear in the root package.json AND in this package: bump them together.
 *
 * @module
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import boundariesPlugin from "eslint-plugin-boundaries";
import importPlugin from "eslint-plugin-import";
import jsdocPlugin from "eslint-plugin-jsdoc";
import oxlint from "eslint-plugin-oxlint";
import preferArrowFunctions from "eslint-plugin-prefer-arrow-functions";
import promisePlugin from "eslint-plugin-promise";
import regexpPlugin from "eslint-plugin-regexp";
import securityPlugin from "eslint-plugin-security";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import sonarPlugin from "eslint-plugin-sonarjs";
import turboPlugin from "eslint-plugin-turbo";
import unicornPlugin from "eslint-plugin-unicorn";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

// Monorepo root, derived from this file's location (packages/eslint-config/base.js).
// boundaries/element patterns are written relative to the repo root, so pin the
// root path here instead of letting it default to process.cwd() — otherwise the
// layered-architecture rules silently match nothing when eslint runs from a package dir.
const MONOREPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

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
 * A shared ESLint configuration for the repository.
 *
 * @type {import("eslint").Linter.Config}
 * */
export default [
  js.configs.recommended,
  sonarPlugin.configs.recommended,
  ...tseslint.configs.recommended,
  // Apply type-aware rules only to TypeScript files
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({ ...config, files: ["**/*.ts", "**/*.tsx"] })),
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      // Type-aware rules that require TypeScript project information
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/return-await": "error",
      // Disable overly strict type-aware rules that cause noise
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-redundant-type-constituents": "warn",

      // Phase 2: TypeScript Enhancements
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/prefer-nullish-coalescing": [
        "error",
        { ignoreTernaryTests: false, ignoreConditionalTests: false, ignoreMixedLogicalExpressions: false },
      ],
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "interface", format: ["PascalCase"], custom: { regex: "^I[A-Z]", match: false } },
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
    languageOptions: { parserOptions: { allowDefaultProject: true } },
  },
  {
    plugins: {
      turbo: turboPlugin,
      import: importPlugin,
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
      boundaries: boundariesPlugin,
      unicorn: unicornPlugin,
      security: securityPlugin,
      promise: promisePlugin,
      regexp: regexpPlugin,
      "prefer-arrow-functions": preferArrowFunctions,
      jsdoc: jsdocPlugin,
    },
    settings: {
      // Match boundaries/element patterns relative to the repo root, not the
      // (per-package) eslint cwd.
      "boundaries/root-path": MONOREPO_ROOT,
      // Resolve TS path aliases (@/...) and workspace packages so boundaries
      // (and import/no-cycle) can classify the import target. Without this the
      // layered-architecture rules are silently inert for @/ imports.
      "import/resolver": {
        typescript: { alwaysTryTypes: true },
        node: { extensions: [".js", ".jsx", ".ts", ".tsx", ".d.ts"] },
      },
      // `mode: "full"` matches each pattern against the whole file path (relative
      // to root-path) so files directly inside a layer folder (e.g. lib/ingest/x.ts)
      // are classified, not just files in sub-folders. The first matching element
      // wins, so more specific layers are listed before the catch-alls.
      //
      // DO NOT follow boundaries v7's deprecation hint to replace this with
      // `partialMatch: false`. It is NOT equivalent: with `partialMatch` the elements stop
      // being classified, every layer rule finds nothing, and the architecture checks pass
      // vacuously — no error, no warning, just silently inert. Verified empirically against a
      // known violation (apps/web/lib/geospatial/patterns.ts), which is reported with
      // `mode: "full"` and NOT reported with `partialMatch: false`. The deprecation warning is
      // accepted for now; see https://github.com/jfilter/timetiles/issues/165
      "boundaries/elements": [
        // Composition root — the Payload config assembly wires collections, jobs,
        // globals and migrations together, so it is allowed to import anything.
        {
          type: "web-config",
          mode: "full",
          pattern: [
            "apps/web/payload.config.ts",
            "apps/web/lib/config/payload-config-factory.ts",
            "apps/web/lib/config/payload-shared-config.ts",
          ],
        },
        // Layer 0 — Foundation (pure functions, no service/domain deps)
        {
          type: "web-lib-foundation",
          mode: "full",
          pattern: [
            "apps/web/lib/utils/**/*",
            "apps/web/lib/security/**/*",
            "apps/web/lib/types/**/*",
            "apps/web/lib/constants/**/*",
            "apps/web/lib/geospatial/**/*",
            "apps/web/lib/filters/**/*",
            "apps/web/lib/definitions/**/*",
            "apps/web/lib/schemas/**/*",
            // Foundational modules that live in otherwise-higher-layer folders:
            "apps/web/lib/logger.ts",
            "apps/web/lib/config/env.ts",
            "apps/web/lib/config/app-config.ts",
            "apps/web/lib/api/errors.ts",
            "apps/web/lib/api/http-error.ts",
            "apps/web/i18n/config.ts",
            // Generated Payload artifacts — imported throughout every layer.
            "apps/web/payload-types.ts",
            "apps/web/payload-generated-schema.ts",
          ],
        },
        // Layer 1 — Infrastructure (cross-cutting services, DB, middleware)
        {
          type: "web-lib-infra",
          mode: "full",
          pattern: ["apps/web/lib/services/**/*", "apps/web/lib/database/**/*", "apps/web/lib/middleware/**/*"],
        },
        // Layer 2 — Domain (ingest pipeline, account, export, email, collections)
        {
          type: "web-lib-domain",
          mode: "full",
          pattern: [
            "apps/web/lib/ingest/**/*",
            "apps/web/lib/account/**/*",
            "apps/web/lib/export/**/*",
            "apps/web/lib/email/**/*",
            "apps/web/lib/collections/**/*",
            "apps/web/lib/blocks/**/*",
          ],
        },
        // Layer 3 — Application (hooks, api helpers, blocks, jobs, etc.)
        { type: "web-lib", mode: "full", pattern: "apps/web/lib/**/*" },
        { type: "web-api", mode: "full", pattern: "apps/web/app/api/**/*" },
        { type: "web-components", mode: "full", pattern: "apps/web/components/**/*" },
        { type: "web-pages", mode: "full", pattern: "apps/web/app/**/page.tsx" },
        { type: "app-web", mode: "full", pattern: "apps/web/**/*" },
        { type: "app-docs", mode: "full", pattern: "apps/docs/**/*" },
        { type: "app", mode: "full", pattern: "apps/*" },
        { type: "package", mode: "full", pattern: "packages/*/**/*" },
        { type: "root", mode: "full", pattern: ["*.js", "*.ts", "*.json", "scripts/**/*"] },
      ],
    },
    rules: {
      // ESLint Core
      "no-async-promise-executor": "error",
      "no-case-declarations": "error",
      "no-console": "error",
      "prefer-const": "error",
      "require-atomic-updates": "error",
      "max-params": ["error", 7],
      complexity: ["error", 20],
      "max-nested-callbacks": ["error", 5],
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-unused-expressions": "error",

      // TypeScript
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { varsIgnorePattern: "^_" }],

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

      // SonarJS
      "sonarjs/cognitive-complexity": ["error", 20],
      "sonarjs/max-lines": ["error", { maximum: 500 }],
      "sonarjs/max-lines-per-function": ["error", { maximum: 100 }],
      "sonarjs/no-collapsible-if": "error",
      "sonarjs/no-duplicate-string": ["error", { threshold: 5 }],
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
      "import/no-cycle": "error",
      "import/no-default-export": "off",
      "import/no-self-import": "error",
      // Disable import/order in favor of simple-import-sort
      "import/order": "off",

      // Boundaries (Monorepo Architecture + Layered lib/ Architecture)
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          // `policies` is the boundaries v7 name for what v6 called `rules`.
          policies: [
            // Composition root assembles the whole app — it may import anything.
            { from: "web-config", allow: "*" },
            // Apps can use their own modules and packages, but not other apps.
            { from: "app-docs", allow: ["app-docs", "package"] },
            // Packages can only use other packages.
            { from: "package", allow: ["package"] },

            // ── Layered Architecture (lib/) — each layer imports only same-or-below ──
            // Layer 0: Foundation → Foundation + packages only
            { from: "web-lib-foundation", allow: ["web-lib-foundation", "package"] },
            // Layer 1: Infrastructure → Foundation + Infrastructure + packages (+ config root for the Payload instance)
            { from: "web-lib-infra", allow: ["web-lib-foundation", "web-lib-infra", "package", "web-config"] },
            // Layer 2: Domain → Foundation + Infrastructure + Domain + packages
            { from: "web-lib-domain", allow: ["web-lib-foundation", "web-lib-infra", "web-lib-domain", "package"] },
            // Layer 3: Application lib → all lib layers + packages (+ config root)
            {
              from: "web-lib",
              allow: ["web-lib", "web-lib-foundation", "web-lib-infra", "web-lib-domain", "package", "web-config"],
            },

            // ── Web application tier (pages, route handlers, components, app shell) ──
            // One cohesive layer above lib: may use any lib layer, each other, packages,
            // and the config root — but NOT lib→app-shell (enforced by the lib rules above)
            // and NOT other apps.
            {
              from: ["app-web", "web-pages", "web-components", "web-api"],
              allow: [
                "app-web",
                "web-pages",
                "web-components",
                "web-api",
                "web-lib",
                "web-lib-foundation",
                "web-lib-infra",
                "web-lib-domain",
                "web-config",
                "package",
              ],
            },

            // Root can access everything
            { from: "root", allow: "*" },
          ],
        },
      ],
      "boundaries/external": ["error", { default: "allow", policies: [] }],

      // Unicorn
      "unicorn/filename-case": [
        "error",
        {
          case: "kebabCase",
          ignore: [
            String.raw`^page\.tsx?$`,
            String.raw`^layout\.tsx?$`,
            String.raw`^loading\.tsx?$`,
            String.raw`^error\.tsx?$`,
            String.raw`^not-found\.tsx?$`,
            String.raw`^route\.ts$`,
            String.raw`^middleware\.ts$`,
            String.raw`^instrumentation\.ts$`,
            String.raw`^\[\[\w+-?\w*\]\.tsx?$`,
            String.raw`^\[\[\.\.\.\w+\]\]\.tsx?$`,
            String.raw`\.config\.(js|ts|mjs)$`,
            String.raw`\.d\.ts$`,
            String.raw`\.test\.tsx?$`,
            String.raw`^README\.md$`,
            String.raw`^CLAUDE\.md$`,
            String.raw`^\d{8}_.*\.ts$`,
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
        { classPropertiesAllowed: false, disallowPrototype: false, returnStyle: "unchanged", singleReturnOnly: false },
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
              group: ["../../../../*", "../../../../../*"],
              message: "Use @/ path alias instead of deep relative imports (more than 3 levels)",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.type='MemberExpression'][callee.object.object.object.name='Object'][callee.object.object.property.name='hasOwnProperty'][callee.object.property.name='call']",
          message: "Use Object.hasOwn() instead of Object.prototype.hasOwnProperty.call()",
        },
      ],
      "turbo/no-undeclared-env-vars": "error",

      // JSDoc - File overview validation
      "jsdoc/require-file-overview": [
        "error",
        { tags: { module: { initialCommentsOnly: true, mustExist: true, preventDuplicates: true } } },
      ],
      // Ensure @module tag doesn't have inline descriptions (TypeDoc requirement)
      "jsdoc/check-tag-names": ["error", { definedTags: ["module", "category"] }],
      // @module should be empty for TypeDoc
      "jsdoc/empty-tags": ["error", { tags: ["module"] }],
      // Disable the sentence completion rules - they're too strict for property descriptions
      "jsdoc/require-description-complete-sentence": "off",
      // Disable match-description - too strict for inline comments
      "jsdoc/match-description": "off",
      "jsdoc/no-types": "off", // We use TypeScript for types
      "jsdoc/require-jsdoc": "off", // Don't require JSDoc on everything
    },
  },
  // Allow default exports for config files
  {
    files: ["**/*.config.{js,ts,mjs}", "**/eslint.config.{js,ts}", "packages/eslint-config/*.js"],
    rules: { "import/no-default-export": "off" },
  },
  // Add oxlint bridge at the END to auto-disable ESLint rules that oxlint handles
  // Uses buildFromOxlintConfigFile to only disable rules actually enabled in .oxlintrc.json
  ...oxlint.buildFromOxlintConfigFile("../../.oxlintrc.json"),
];
