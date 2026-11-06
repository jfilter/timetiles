/**
 * Architectural boundaries between apps, packages and the layers of `apps/web/lib`,
 * packaged as an oxlint JS plugin.
 *
 * oxlint configuration is plain JSON, so this wrapper supplies what JSON cannot: an
 * absolute repo root and absolute tsconfig paths. Element patterns and `@/` aliases
 * then resolve the same way whichever directory oxlint runs from.
 *
 * @module
 */
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import boundaries from "eslint-plugin-boundaries";

const MONOREPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Listed as plain paths: the resolver's own globbing drops the tsconfig of the current directory.
const TSCONFIGS = ["apps", "packages"]
  .flatMap((group) =>
    readdirSync(join(MONOREPO_ROOT, group)).map((name) => join(MONOREPO_ROOT, group, name, "tsconfig.json"))
  )
  .concat(join(MONOREPO_ROOT, "scripts", "tsconfig.json"))
  .filter((path) => existsSync(path));

/** Element types, classified by folder. */
const FOUNDATION = "web-lib-foundation";
const INFRA = "web-lib-infra";
const DOMAIN = "web-lib-domain";
const WEB_LIB = "web-lib";
const WEB_API = "web-api";
const WEB_COMPONENTS = "web-components";
const APP_WEB = "app-web";
const APP_DOCS = "app-docs";
const PACKAGE = "package";
const ROOT = "root";
/** File categories, for single files that need their own permission set. */
const FOUNDATION_FILE = "web-lib-foundation-file";
const CONFIG_FILE = "web-config-file";
const ROOT_CONFIG_FILE = "root-config-file";
const DEV_SCRIPT = "web-dev-script";
const TOOLING_TEST = "web-tooling-test";

const settings = {
  "boundaries/root-path": MONOREPO_ROOT,
  // Resolve TS path aliases (@/...) and workspace packages so boundaries can classify
  // the import target; each file uses the nearest of these tsconfigs.
  "import/resolver": {
    typescript: { alwaysTryTypes: true, noWarnOnMultipleProjects: true, project: TSCONFIGS },
    node: { extensions: [".js", ".jsx", ".ts", ".tsx", ".d.ts"] },
  },
  "boundaries/elements": [
    // Layer 0 — Foundation (pure functions, no service/domain deps)
    {
      type: FOUNDATION,
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
      type: INFRA,
      partialMatch: false,
      pattern: ["apps/web/lib/services", "apps/web/lib/database", "apps/web/lib/middleware"],
    },
    // Layer 2 — Domain (ingest pipeline, account, export, email, collections)
    {
      type: DOMAIN,
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
    { type: WEB_LIB, partialMatch: false, pattern: "apps/web/lib" },
    { type: WEB_API, partialMatch: false, pattern: "apps/web/app/api" },
    { type: WEB_COMPONENTS, partialMatch: false, pattern: "apps/web/components" },
    // No dedicated "web-pages" type: page.tsx files already fall through to
    // "app-web" below, which grants the identical permission set.
    { type: APP_WEB, partialMatch: false, pattern: "apps/web" },
    { type: APP_DOCS, partialMatch: false, pattern: "apps/docs" },
    // No "apps/*" catch-all for other apps (e.g. timescrape): a folder-prefix
    // pattern would newly classify their files, and since no policy grants that
    // type any permissions, default:"disallow" would reject every import in
    // them. Leaving them unclassified keeps today's behavior (ignored).
    { type: PACKAGE, partialMatch: false, pattern: "packages/*" },
    { type: ROOT, partialMatch: false, pattern: "scripts" },
  ],
  // Files that classification-by-folder can't reach: single files living inside a
  // higher (or unrelated) folder that still need their own layer/permission set.
  // Orthogonal to `boundaries/elements` — a file can carry both an element type
  // (from its folder) and a category (from here) at once.
  "boundaries/files": [
    {
      category: CONFIG_FILE,
      pattern: [
        "apps/web/payload.config.ts",
        "apps/web/lib/config/payload-config-factory.ts",
        "apps/web/lib/config/payload-shared-config.ts",
      ],
    },
    {
      category: FOUNDATION_FILE,
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
    { category: ROOT_CONFIG_FILE, pattern: ["*.js", "*.ts", "*.json"] },
    // Dev-only runners that share the repo-root script helpers.
    { category: DEV_SCRIPT, pattern: ["apps/web/scripts/*.ts"] },
    // Tests of repo tooling hosted in the web Vitest suite.
    { category: TOOLING_TEST, pattern: ["apps/web/tests/unit/scripts/*.ts"] },
  ],
};

const dependencies = {
  default: "disallow",
  // `policies` is the boundaries v7 name for what v6 called `rules`; selectors
  // are wrapped in `{ element: ... }` / `{ file: ... }` per the v7 selector syntax.
  policies: [
    // Apps can use their own modules and packages, but not other apps.
    { from: { element: { type: APP_DOCS } }, allow: { to: { element: { types: [APP_DOCS, PACKAGE] } } } },
    // Packages can only use other packages.
    { from: { element: { type: PACKAGE } }, allow: { to: { element: { type: PACKAGE } } } },

    // ── Layered Architecture (lib/) — each layer imports only same-or-below ──
    // Every "to" list below also admits the "*-file" categories from
    // boundaries/files: those are files (e.g. lib/logger.ts, lib/config/env.ts)
    // that live inside a higher-layer folder but belong to a lower layer, so
    // they can't be matched by a folder pattern — see boundaries/files above.
    // Layer 0: Foundation → Foundation + packages only
    {
      from: { element: { type: FOUNDATION } },
      allow: { to: [{ element: { types: [FOUNDATION, PACKAGE] } }, { file: { categories: FOUNDATION_FILE } }] },
    },
    // Layer 1: Infrastructure → Foundation + Infrastructure + packages (+ config root for the Payload instance)
    {
      from: { element: { type: INFRA } },
      allow: {
        to: [
          { element: { types: [FOUNDATION, INFRA, PACKAGE] } },
          { file: { categories: [FOUNDATION_FILE, CONFIG_FILE] } },
        ],
      },
    },
    // Layer 2: Domain → Foundation + Infrastructure + Domain + packages
    {
      from: { element: { type: DOMAIN } },
      allow: {
        to: [{ element: { types: [FOUNDATION, INFRA, DOMAIN, PACKAGE] } }, { file: { categories: FOUNDATION_FILE } }],
      },
    },
    // Layer 3: Application lib → all lib layers + packages (+ config root)
    {
      from: { element: { type: WEB_LIB } },
      allow: {
        to: [
          { element: { types: [WEB_LIB, FOUNDATION, INFRA, DOMAIN, PACKAGE] } },
          { file: { categories: [FOUNDATION_FILE, CONFIG_FILE] } },
        ],
      },
    },

    // ── Web application tier (pages, route handlers, components, app shell) ──
    // One cohesive layer above lib: may use any lib layer, each other, packages,
    // and the config root — but NOT lib→app-shell (enforced by the lib rules above)
    // and NOT other apps. Page files (app/**/page.tsx) fall under "app-web" too,
    // since a dedicated type would need the same permissions anyway.
    {
      from: { element: { types: [APP_WEB, WEB_COMPONENTS, WEB_API] } },
      allow: {
        to: [
          { element: { types: [APP_WEB, WEB_COMPONENTS, WEB_API, WEB_LIB, FOUNDATION, INFRA, DOMAIN, PACKAGE] } },
          { file: { categories: [FOUNDATION_FILE, CONFIG_FILE] } },
        ],
      },
    },

    // Root-level build/config scripts can access everything.
    { from: { element: { type: ROOT } }, allow: { to: { element: { type: "*" } } } },

    // ── boundaries/files exceptions (must stay last — see below) ──
    // The composition root and bare root config files aren't a folder, so they're
    // classified by boundaries/files instead of boundaries/elements (above). Every
    // file below also carries a folder-based element type from its containing
    // directory (e.g. lib/logger.ts falls under the "web-lib" catch-all), so these
    // policies must be evaluated last: boundaries/dependencies keeps the LAST
    // matching policy for a given pair, and these need to win over — or in the
    // foundation-file case, narrow down from — that folder-based classification.
    { from: { file: { categories: CONFIG_FILE } }, allow: { to: { element: { type: "*" } } } },
    { from: { file: { categories: ROOT_CONFIG_FILE } }, allow: { to: { element: { type: "*" } } } },
    { from: { file: { categories: DEV_SCRIPT } }, allow: { to: { element: { type: ROOT } } } },
    { from: { file: { categories: TOOLING_TEST } }, allow: { to: { element: { type: [ROOT, APP_DOCS] } } } },
    // Foundational modules living in higher-layer folders (lib/logger.ts,
    // lib/config/env.ts, payload-types.ts, ...) must be as restricted as any other
    // Foundation file, not as permissive as their folder's fallback type — so first
    // revoke everything the fallback type granted, then re-grant exactly what
    // Foundation is allowed. Order between these two matters.
    { from: { file: { categories: FOUNDATION_FILE } }, disallow: { to: { element: { type: "*" } } } },
    {
      from: { file: { categories: FOUNDATION_FILE } },
      allow: { to: [{ element: { types: [FOUNDATION, PACKAGE] } }, { file: { categories: FOUNDATION_FILE } }] },
    },
  ],
};

/** The rule with this module's settings and policies, which `.oxlintrc.json` only switches on. */
const dependenciesRule = {
  ...boundaries.rules.dependencies,
  create: (context) =>
    boundaries.rules.dependencies.create(
      Object.create(context, { settings: { value: settings }, options: { value: [dependencies] } })
    ),
};

const plugin = { meta: { name: "boundaries" }, rules: { dependencies: dependenciesRule } };

export default plugin;
