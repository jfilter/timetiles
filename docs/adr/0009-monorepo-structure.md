# ADR 0009: Monorepo Structure

## Status

Accepted

## Context

TimeTiles consists of a main web application, a documentation site, an optional scraper runner, shared UI components and assets, code shared between the web app and the runner, scraper SDKs, and tooling configuration packages. These need to be developed, tested, and built together while keeping clear boundaries between concerns. The project needed a monorepo strategy that supports this without introducing excessive tooling complexity.

## Decision

TimeTiles uses **pnpm workspaces** for package management and **Turborepo** for task orchestration, organized into two top-level directories: `apps/` for deployable applications and `packages/` for shared libraries.

### Repository Layout

```
timetiles/
├── apps/
│   ├── web/                          # Main application
│   ├── docs/                         # Documentation site
│   └── timescrape/                   # Optional Podman scraper runner
├── packages/
│   ├── ui/                           # Shared UI component library
│   ├── assets/                       # Shared logos and images
│   ├── shared/                       # Code shared by web and timescrape
│   ├── scraper/                      # Node.js scraper SDK and CLI
│   ├── python/                       # Python scraper SDK
│   ├── eslint-config/                # Shared ESLint configuration
│   └── typescript-config/            # Shared TypeScript configuration
├── pnpm-workspace.yaml               # Workspace definition
├── turbo.json                        # Task pipeline configuration
├── Makefile                          # Developer command interface
└── package.json                      # Root scripts and shared devDependencies
```

### Workspace Packages

| Package                      | Name                           | Purpose                                                     | Consumers                       |
| ---------------------------- | ------------------------------ | ----------------------------------------------------------- | ------------------------------- |
| `apps/web`                   | `web`                          | Next.js + Payload CMS application, main product             | Deployed to production          |
| `apps/docs`                  | `docs`                         | Nextra documentation site                                   | Deployed to GitHub Pages        |
| `apps/timescrape`            | `timescrape`                   | Runs user-defined scrapers in isolated Podman containers    | Deployed separately (optional)  |
| `packages/ui`                | `@timetiles/ui`                | Shared UI components (Radix UI, shadcn/ui, charts, icons)   | `web`, `docs`; published to npm |
| `packages/assets`            | `@timetiles/assets`            | Shared logos and static assets                              | `web`, `docs`                   |
| `packages/shared`            | `@timetiles/shared`            | SSRF address classification and the scraper run contract    | `web`, `timescrape`             |
| `packages/scraper`           | `@timetiles/scraper`           | Node.js scraper output SDK and `timetiles-scraper init` CLI | Published to npm                |
| `packages/python`            | `timetiles`                    | Python scraper output SDK                                   | Published to PyPI               |
| `packages/eslint-config`     | `@timetiles/eslint-config`     | ESLint flat configs                                         | All JavaScript packages         |
| `packages/typescript-config` | `@timetiles/typescript-config` | Shared `tsconfig.json` base files                           | All JavaScript packages         |

### Why pnpm + Turborepo

**pnpm workspaces** was chosen over npm/yarn workspaces for:

- Strict dependency isolation via content-addressable storage (no phantom dependencies)
- `workspace:*` protocol for linking internal packages without version management
- `catalog:` feature for pinning shared dependency versions (`react`, `next`, `typescript`, `vitest`, etc.) in `pnpm-workspace.yaml` so all packages stay in sync
- Fast installs through hard-linked packages

**Turborepo** was chosen over Nx and Lerna for:

- Zero configuration for basic use cases -- `turbo.json` defines the full task graph
- Remote caching support without a self-hosted server
- Incremental adoption -- each package keeps its own `package.json` scripts, Turbo just orchestrates them
- Minimal footprint -- a single `turbo` devDependency at the root, no generators or plugins required
- Nx was considered but brings a heavier runtime, plugin ecosystem, and project graph model that exceeds what TimeTiles needs
- Lerna was ruled out as it targets publishable package workflows (versioning, changelogs, npm publishing); the few published packages are released by tag-triggered GitHub Actions workflows instead

### Build Pipeline

Turborepo's `turbo.json` defines a task dependency graph. The key relationships:

```
build
  └── ^build              (build dependencies first)

typecheck
  └── ^build              (types resolve through built dist output)

lint / test / test:ai
  └── transit             (orders tasks along the workspace graph)
      └── ^transit
```

`transit` has no command of its own: depending on it orders tasks across the dependency graph without building anything. `typecheck` depends on `^build` instead, because `apps/web` and `apps/timescrape` resolve `@timetiles/shared` and `@timetiles/ui` through their built `dist` types, and a stale build would typecheck against old exports.

When `turbo run build` executes, it:

1. Builds the tsup packages (`packages/shared`, `packages/ui`, `packages/scraper`) in parallel
2. Builds `apps/web` and `apps/timescrape` against those builds
3. Builds `apps/docs` (depends on `@timetiles/ui` and `@timetiles/assets`)

Turborepo caches build outputs (`.next/**`, `dist/**`, `out/**`) and test outputs (`.test-results/**`, `coverage/**`), and skips unchanged tasks on subsequent runs.

### Shared UI Library

`packages/ui` (`@timetiles/ui`) exports components consumed by both `apps/web` and `apps/docs`, and is also published to npm. It follows the shadcn/ui pattern:

- Components built on Radix UI primitives with Tailwind CSS styling
- Exports organized by concern: `@timetiles/ui` (components), `@timetiles/ui/charts` (ECharts wrappers), `@timetiles/ui/icons` (Lucide icons), `@timetiles/ui/lib/utils` (utility functions)
- Includes its own `DESIGN_SYSTEM.md` exported at `@timetiles/ui/design-system`
- Has its own test suite (Vitest)

### Version Catalog

`pnpm-workspace.yaml` defines a `catalog:` section that pins versions of shared dependencies across all packages — the framework (React, Next.js), type definitions, build tooling, the Vitest family and shared libraries. The pinned versions live only there.

Packages reference these with `"react": "catalog:"` instead of hardcoded versions. This ensures a single source of truth for framework versions and eliminates version drift between apps.

### Developer Experience

A root `Makefile` wraps pnpm and Turborepo commands to provide a consistent developer interface. This serves two purposes: discoverability (run `make help` for all commands) and AI-friendly output formatting (the `check-ai` and `test-ai` targets produce structured, concise output suitable for AI assistant consumption).

Key commands and what they run:

| Make Command    | Underlying Tool                      | Scope                                                       |
| --------------- | ------------------------------------ | ----------------------------------------------------------- |
| `make dev`      | `turbo run dev`                      | All apps in parallel                                        |
| `make check`    | `turbo run lint typecheck`           | All packages (lint + tsgo)                                  |
| `make check-ai` | Custom script wrapping Turbo         | AI-formatted output, supports `PACKAGE` and `FILES` filters |
| `make test-ai`  | `turbo run test:ai` or direct Vitest | AI-formatted output, supports `FILTER` pattern              |
| `make build`    | `turbo run build`                    | Full production build                                       |
| `make lint`     | `turbo run lint`                     | Lint across all packages                                    |

Typechecking now runs through `tsgo` in both local development and CI. The primary commands are `make check` and `make typecheck`.

### CI/CD Pipeline

GitHub Actions workflows are organized as reusable workflows composed by a top-level `ci.yml`:

```
ci.yml (push to main, PRs)
├── build.yml          Build & Quality Checks
│   ├── Generate API docs (TypeDoc)
│   ├── Lint (ESLint full, all packages except docs)
│   ├── Typecheck (tsgo full, all packages)
│   ├── Lint infrastructure (actionlint, hadolint, checkmake, shellcheck)
│   └── Build web app (next build --experimental-build-mode compile)
│
├── check-payload-types.yml
│   └── Verify Payload CMS generated types are in sync
│
├── test-unit-integration.yml  (needs: build, check-payload-types)
│   ├── PostgreSQL + PostGIS service container
│   ├── Run tests with coverage (Vitest)
│   └── SonarCloud scan
│
└── test-e2e.yml  (needs: build, check-payload-types)
    ├── PostgreSQL + PostGIS service container
    ├── Download build artifact from build job
    ├── Playwright tests (parallel workers)
    └── Upload failure artifacts (traces, screenshots)
```

Additional standalone workflows:

| Workflow                     | Trigger                             | Purpose                                                                                             |
| ---------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| `deploy-docs.yml`            | Push to main (docs paths), PRs      | Build and deploy docs to GitHub Pages                                                               |
| `release-images.yml`         | `v*` tags, nightly, manual          | Build and push Docker images to GHCR, using the reusable `build-image.yml` and `merge-manifest.yml` |
| `security.yml`               | Push and PRs to main, daily, manual | Security scanning                                                                                   |
| `publish-ui.yml`             | `ui-v*` tags                        | Publish `@timetiles/ui` to npm                                                                      |
| `publish-scraper.yml`        | `scraper-v*` tags                   | Publish `@timetiles/scraper` to npm                                                                 |
| `publish-scraper-python.yml` | `python-v*` tags                    | Publish the Python SDK to PyPI                                                                      |
| `logo-assets.yml`            | Manual                              | Generate logo assets                                                                                |

The build artifact (`.next` directory) is shared between the build job and E2E tests via `actions/upload-artifact`, avoiding a redundant rebuild.

## Consequences

- All packages share a single `pnpm-lock.yaml`, ensuring consistent dependency resolution across the monorepo
- Adding a new package requires only creating a directory under `apps/` or `packages/` and adding a `package.json` -- Turborepo discovers it automatically via the pnpm workspace globs
- The two configuration packages (`eslint-config`, `typescript-config`) keep lint and compiler settings consistent without per-package duplication; formatting is a single root oxfmt configuration (ADR 0014)
- CI runs lint and typecheck across all packages in a single job, catching cross-package breakages early
- The `catalog:` version pinning means upgrading React or Next.js is a single-line change in `pnpm-workspace.yaml` rather than editing every `package.json`
- Turborepo's caching means incremental builds and test runs are fast, but the cache can occasionally serve stale results -- `turbo run build --force` bypasses it when needed
- The Makefile adds an indirection layer between developers and the underlying tools, which trades some transparency for consistency and discoverability
