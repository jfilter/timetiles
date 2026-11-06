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
      // Disable overly strict type-aware rules that cause noise
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "interface", format: ["PascalCase"], custom: { regex: "^I[A-Z]", match: false } },
      ],
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
      // `partialMatch: false` matches each pattern as a folder prefix (the pattern gets a
      // `/**/*` suffix appended internally) so files directly inside a layer folder
      // (e.g. lib/ingest/x.ts) are classified, not just files in sub-folders. The first
      // matching element wins, so more specific layers are listed before the catch-alls.
      // Patterns must NOT keep their own trailing `/**/*` — the plugin appends it, so a
      // pattern that already ends in `/**/*` silently stops matching anything (doubled
      // globstar). See https://github.com/jfilter/timetiles/issues/165.
      "boundaries/elements": [
        // Layer 0 — Foundation (pure functions, no service/domain deps)
        {
          type: "web-lib-foundation",
          partialMatch: false,
          pattern: [
            "apps/web/lib/utils",
            "apps/web/lib/security",
            "apps/web/lib/types",
            "apps/web/lib/constants",
            "apps/web/lib/geospatial",
            "apps/web/lib/filters",
            "apps/web/lib/definitions",
            "apps/web/lib/schemas",
          ],
        },
        // Layer 1 — Infrastructure (cross-cutting services, DB, middleware)
        {
          type: "web-lib-infra",
          partialMatch: false,
          pattern: ["apps/web/lib/services", "apps/web/lib/database", "apps/web/lib/middleware"],
        },
        // Layer 2 — Domain (ingest pipeline, account, export, email, collections)
        {
          type: "web-lib-domain",
          partialMatch: false,
          pattern: [
            "apps/web/lib/ingest",
            "apps/web/lib/account",
            "apps/web/lib/export",
            "apps/web/lib/email",
            "apps/web/lib/collections",
            "apps/web/lib/blocks",
          ],
        },
        // Layer 3 — Application (hooks, api helpers, jobs, seed, etc.)
        { type: "web-lib", partialMatch: false, pattern: "apps/web/lib" },
        { type: "web-api", partialMatch: false, pattern: "apps/web/app/api" },
        { type: "web-components", partialMatch: false, pattern: "apps/web/components" },
        // No dedicated "web-pages" type: page.tsx files already fall through to
        // "app-web" below, which grants the identical permission set.
        { type: "app-web", partialMatch: false, pattern: "apps/web" },
        { type: "app-docs", partialMatch: false, pattern: "apps/docs" },
        // No "apps/*" catch-all for other apps (e.g. timescrape): a folder-prefix
        // pattern would newly classify their files, and since no policy grants that
        // type any permissions, default:"disallow" would reject every import in
        // them. Leaving them unclassified keeps today's behavior (ignored).
        { type: "package", partialMatch: false, pattern: "packages/*" },
        { type: "root", partialMatch: false, pattern: "scripts" },
      ],
      // Files that classification-by-folder can't reach: single files living inside a
      // higher (or unrelated) folder that still need their own layer/permission set.
      // Orthogonal to `boundaries/elements` — a file can carry both an element type
      // (from its folder) and a category (from here) at once.
      "boundaries/files": [
        {
          category: "web-config-file",
          pattern: [
            "apps/web/payload.config.ts",
            "apps/web/lib/config/payload-config-factory.ts",
            "apps/web/lib/config/payload-shared-config.ts",
          ],
        },
        {
          category: "web-lib-foundation-file",
          pattern: [
            "apps/web/lib/logger.ts",
            "apps/web/lib/config/env.ts",
            "apps/web/lib/config/app-config.ts",
            "apps/web/lib/api/errors.ts",
            "apps/web/lib/api/http-error.ts",
            "apps/web/i18n/config.ts",
            "apps/web/payload-types.ts",
            "apps/web/payload-generated-schema.ts",
          ],
        },
        { category: "root-config-file", pattern: ["*.js", "*.ts", "*.json"] },
        // Dev-only runners that share the repo-root script helpers.
        { category: "web-dev-script", pattern: ["apps/web/scripts/*.ts"] },
        // Tests of repo tooling hosted in the web Vitest suite.
        { category: "web-tooling-test", pattern: ["apps/web/tests/unit/scripts/*.ts"] },
      ],
    },
    rules: {
      // ESLint Core
      "require-atomic-updates": "error",

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
      "promise/no-return-in-finally": "error",

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
      "import/no-default-export": "off",
      // Disable import/order in favor of simple-import-sort
      "import/order": "off",

      // Boundaries (Monorepo Architecture + Layered lib/ Architecture)
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          // `policies` is the boundaries v7 name for what v6 called `rules`; selectors
          // are wrapped in `{ element: ... }` / `{ file: ... }` per the v7 selector syntax.
          policies: [
            // Apps can use their own modules and packages, but not other apps.
            { from: { element: { type: "app-docs" } }, allow: { to: { element: { types: ["app-docs", "package"] } } } },
            // Packages can only use other packages.
            { from: { element: { type: "package" } }, allow: { to: { element: { type: "package" } } } },

            // ── Layered Architecture (lib/) — each layer imports only same-or-below ──
            // Every "to" list below also admits the "*-file" categories from
            // boundaries/files: those are files (e.g. lib/logger.ts, lib/config/env.ts)
            // that live inside a higher-layer folder but belong to a lower layer, so
            // they can't be matched by a folder pattern — see boundaries/files above.
            // Layer 0: Foundation → Foundation + packages only
            {
              from: { element: { type: "web-lib-foundation" } },
              allow: {
                to: [
                  { element: { types: ["web-lib-foundation", "package"] } },
                  { file: { categories: "web-lib-foundation-file" } },
                ],
              },
            },
            // Layer 1: Infrastructure → Foundation + Infrastructure + packages (+ config root for the Payload instance)
            {
              from: { element: { type: "web-lib-infra" } },
              allow: {
                to: [
                  { element: { types: ["web-lib-foundation", "web-lib-infra", "package"] } },
                  { file: { categories: ["web-lib-foundation-file", "web-config-file"] } },
                ],
              },
            },
            // Layer 2: Domain → Foundation + Infrastructure + Domain + packages
            {
              from: { element: { type: "web-lib-domain" } },
              allow: {
                to: [
                  { element: { types: ["web-lib-foundation", "web-lib-infra", "web-lib-domain", "package"] } },
                  { file: { categories: "web-lib-foundation-file" } },
                ],
              },
            },
            // Layer 3: Application lib → all lib layers + packages (+ config root)
            {
              from: { element: { type: "web-lib" } },
              allow: {
                to: [
                  {
                    element: { types: ["web-lib", "web-lib-foundation", "web-lib-infra", "web-lib-domain", "package"] },
                  },
                  { file: { categories: ["web-lib-foundation-file", "web-config-file"] } },
                ],
              },
            },

            // ── Web application tier (pages, route handlers, components, app shell) ──
            // One cohesive layer above lib: may use any lib layer, each other, packages,
            // and the config root — but NOT lib→app-shell (enforced by the lib rules above)
            // and NOT other apps. Page files (app/**/page.tsx) fall under "app-web" too,
            // since a dedicated type would need the same permissions anyway.
            {
              from: { element: { types: ["app-web", "web-components", "web-api"] } },
              allow: {
                to: [
                  {
                    element: {
                      types: [
                        "app-web",
                        "web-components",
                        "web-api",
                        "web-lib",
                        "web-lib-foundation",
                        "web-lib-infra",
                        "web-lib-domain",
                        "package",
                      ],
                    },
                  },
                  { file: { categories: ["web-lib-foundation-file", "web-config-file"] } },
                ],
              },
            },

            // Root-level build/config scripts can access everything.
            { from: { element: { type: "root" } }, allow: { to: { element: { type: "*" } } } },

            // ── boundaries/files exceptions (must stay last — see below) ──
            // The composition root and bare root config files aren't a folder, so they're
            // classified by boundaries/files instead of boundaries/elements (above). Every
            // file below also carries a folder-based element type from its containing
            // directory (e.g. lib/logger.ts falls under the "web-lib" catch-all), so these
            // policies must be evaluated last: boundaries/dependencies keeps the LAST
            // matching policy for a given pair, and these need to win over — or in the
            // foundation-file case, narrow down from — that folder-based classification.
            { from: { file: { categories: "web-config-file" } }, allow: { to: { element: { type: "*" } } } },
            { from: { file: { categories: "root-config-file" } }, allow: { to: { element: { type: "*" } } } },
            { from: { file: { categories: "web-dev-script" } }, allow: { to: { element: { type: "root" } } } },
            {
              from: { file: { categories: "web-tooling-test" } },
              allow: { to: { element: { type: ["root", "app-docs"] } } },
            },
            // Foundational modules living in higher-layer folders (lib/logger.ts,
            // lib/config/env.ts, payload-types.ts, ...) must be as restricted as any other
            // Foundation file, not as permissive as their folder's fallback type — so first
            // revoke everything the fallback type granted, then re-grant exactly what
            // Foundation is allowed. Order between these two matters.
            { from: { file: { categories: "web-lib-foundation-file" } }, disallow: { to: { element: { type: "*" } } } },
            {
              from: { file: { categories: "web-lib-foundation-file" } },
              allow: {
                to: [
                  { element: { types: ["web-lib-foundation", "package"] } },
                  { file: { categories: "web-lib-foundation-file" } },
                ],
              },
            },
          ],
        },
      ],

      // Unicorn
      // unicorn 65 renamed `ignoreUsedVariables` to `checkUsedVariables` AND inverted its
      // polarity, so the value flips too: `checkUsedVariables: false` is what
      // `ignoreUsedVariables: true` used to mean (skip imports that have other references).
      "unicorn/prefer-export-from": ["error", { checkUsedVariables: false }],

      // Function declaration consistency
      "prefer-arrow-functions/prefer-arrow-functions": [
        "error",
        { classPropertiesAllowed: false, disallowPrototype: false, returnStyle: "unchanged", singleReturnOnly: false },
      ],

      // Project-specific
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
];

/**
 * Turns off every ESLint rule that `.oxlintrc.json` enables, so oxlint alone runs it.
 * Every eslint.config must spread this LAST: a later block would switch rules back on.
 * A package that skips the oxlint step in its lint script enforces none of these rules.
 */
export const oxlintBridge = oxlint.buildFromOxlintConfigFile(resolve(MONOREPO_ROOT, ".oxlintrc.json"));
