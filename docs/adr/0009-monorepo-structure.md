# ADR 0009: Monorepo Structure

## Status

Accepted

## Context

TimeTiles consists of a main web application, a documentation site, shared UI components, shared assets, and several tooling configuration packages. These need to be developed, tested, and built together while keeping clear boundaries between concerns. The project needed a monorepo strategy that supports this without introducing excessive tooling complexity.

## Decision

TimeTiles uses **pnpm workspaces** for package management and **Turborepo** for task orchestration, organized into two top-level directories: `apps/` for deployable applications and `packages/` for shared libraries.

### Repository Layout

```
timetiles/
├── apps/
│   ├── web/                          # Main application
│   └── docs/                         # Documentation site
├── packages/
│   ├── ui/                           # Shared UI component library
│   ├── assets/                       # Shared logos and images
│   ├── payload-schema-detection/     # Schema detection plugin
│   ├── eslint-config/                # Shared ESLint configuration
│   ├── typescript-config/            # Shared TypeScript configuration
│   └── prettier-config/              # Shared Prettier configuration
├── pnpm-workspace.yaml               # Workspace definition
├── turbo.json                        # Task pipeline configuration
├── Makefile                          # Developer command interface
└── package.json                      # Root scripts and shared devDependencies
```

### Workspace Packages

| Package                             | Name                                  | Purpose                                                          | Consumers              |
| ----------------------------------- | ------------------------------------- | ---------------------------------------------------------------- | ---------------------- |
| `apps/web`                          | `web`                                 | Next.js 16 + Payload CMS application, main product               | Deployed to production |
| `apps/docs`                         | `docs`                                | Nextra 4 documentation site, deployed to GitHub Pages            | Deployed separately    |
| `packages/ui`                       | `@timetiles/ui`                       | Shared UI components (Radix UI, shadcn/ui, charts, icons)        | `web`, `docs`          |
| `packages/assets`                   | `@timetiles/assets`                   | Shared logos and static assets                                   | `web`, `docs`          |
| `packages/payload-schema-detection` | `@timetiles/payload-schema-detection` | Payload CMS plugin for import schema detection                   | `web`                  |
| `packages/eslint-config`            | `@timetiles/eslint-config`            | ESLint flat configs (base, next-js, react-internal, mdx, vitest) | All packages           |
| `packages/typescript-config`        | `@timetiles/typescript-config`        | Shared `tsconfig.json` base files                                | All packages           |
| `packages/prettier-config`          | `@timetiles/prettier-config`          | Shared Prettier settings                                         | All packages           |

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
- Lerna was ruled out as it targets publishable package workflows (versioning, changelogs, npm publishing) which are unnecessary for a private monorepo

### Build Pipeline

Turborepo's `turbo.json` defines a task dependency graph. The key relationships:

```
build
  └── ^build              (build dependencies first)

lint / typecheck
  └── transit             (ensures internal packages are ready)
      └── ^transit

test / test:ai
  └── ^build              (tests depend on built packages)
```

The `transit` task is a lightweight dependency gate: it ensures packages like `@timetiles/ui` and `@timetiles/payload-schema-detection` (which have `tsc --build` as their build step) are compiled before downstream lint and typecheck tasks run. This avoids TypeScript errors from unresolved workspace imports.

When `turbo run build` executes, it:

1. Builds `packages/ui` and `packages/payload-schema-detection` (no external deps, run in parallel)
2. Builds `apps/web` (depends on `@timetiles/ui`, `@timetiles/payload-schema-detection`, `@timetiles/assets`)
3. Builds `apps/docs` (depends on `@timetiles/ui`, `@timetiles/assets`, and generates TypeDoc API docs from `apps/web` source)

Turborepo caches outputs (`.next/**`, `.test-results/**`, `coverage/**`) and skips unchanged tasks on subsequent runs.

### Shared UI Library

`packages/ui` (`@timetiles/ui`) is a private package that exports components consumed by both `apps/web` and `apps/docs`. It follows the shadcn/ui pattern:

- Components built on Radix UI primitives with Tailwind CSS styling
- Exports organized by concern: `@timetiles/ui` (components), `@timetiles/ui/charts` (ECharts wrappers), `@timetiles/ui/icons` (Lucide icons), `@timetiles/ui/lib/utils` (utility functions)
- Includes its own `DESIGN_SYSTEM.md` exported at `@timetiles/ui/design-system`
- Has its own test suite (Vitest)

### Version Catalog

`pnpm-workspace.yaml` defines a `catalog:` section that pins versions of shared dependencies across all packages:

```yaml
catalog:
  react: ^19.2.4
  react-dom: ^19.2.4
  next: ^16.1.6
  typescript: ^5.9.3
  vitest: ^4.0.18
  # ... 12 more entries
```

Packages reference these with `"react": "catalog:"` instead of hardcoded versions. This ensures a single source of truth for framework versions and eliminates version drift between apps.

### Developer Experience

A root `Makefile` wraps pnpm and Turborepo commands to provide a consistent developer interface. This serves two purposes: discoverability (run `make help` for all commands) and AI-friendly output formatting (the `check-ai` and `test-ai` targets produce structured, concise output suitable for AI assistant consumption).

Key commands and what they run:

| Make Command      | Underlying Tool                      | Scope                                                       |
| ----------------- | ------------------------------------ | ----------------------------------------------------------- |
| `make dev`        | `turbo run dev`                      | All apps in parallel                                        |
| `make check`      | `turbo run lint:fast typecheck:fast` | All packages (oxlint + tsgo)                                |
| `make check-full` | `turbo run lint typecheck`           | All packages (ESLint + tsc)                                 |
| `make check-ai`   | Custom script wrapping Turbo         | AI-formatted output, supports `PACKAGE` and `FILES` filters |
| `make test-ai`    | `turbo run test:ai` or direct Vitest | AI-formatted output, supports `FILTER` pattern              |
| `make build`      | `turbo run build`                    | Full production build                                       |
| `make lint`       | `turbo run lint:fast`                | oxlint across all packages                                  |

Fast variants (`lint:fast` using oxlint, `typecheck:fast` using tsgo) run during local development. Full variants (`lint` using ESLint, `typecheck` using tsc) run in CI.

### CI/CD Pipeline

GitHub Actions workflows are organized as reusable workflows composed by a top-level `ci.yml`:

```
ci.yml (push to main, PRs)
├── build.yml          Build & Quality Checks
│   ├── Generate API docs (TypeDoc)
│   ├── Lint (ESLint full, all packages except docs)
│   ├── Typecheck (tsc full, all packages)
│   ├── Lint infrastructure (actionlint, hadolint, checkmake, shellcheck)
│   └── Build web app (next build --experimental-build-mode compile)
│
├── check-payload-types.yml
│   └── Verify Payload CMS generated types are in sync
│
├── test-unit-integration.yml  (needs: build, check-payload-types)
│   ├── PostgreSQL 17 + PostGIS 3.5 service container
│   ├── Run tests with coverage (Vitest)
│   └── SonarCloud scan
│
└── test-e2e.yml  (needs: build, check-payload-types)
    ├── PostgreSQL 17 + PostGIS 3.5 service container
    ├── Download build artifact from build job
    ├── Playwright tests (parallel workers)
    └── Upload failure artifacts (traces, screenshots)
```

Additional standalone workflows:

| Workflow             | Trigger                        | Purpose                               |
| -------------------- | ------------------------------ | ------------------------------------- |
| `deploy-docs.yml`    | Push to main (docs paths), PRs | Build and deploy docs to GitHub Pages |
| `release-images.yml` | Manual / release               | Build and push Docker images to GHCR  |
| `security.yml`       | Scheduled / manual             | Security scanning                     |

The build artifact (`.next` directory) is shared between the build job and E2E tests via `actions/upload-artifact`, avoiding a redundant rebuild.

## Consequences

- All packages share a single `pnpm-lock.yaml`, ensuring consistent dependency resolution across the monorepo
- Adding a new package requires only creating a directory under `apps/` or `packages/` and adding a `package.json` -- Turborepo discovers it automatically via the pnpm workspace globs
- The three configuration packages (`eslint-config`, `typescript-config`, `prettier-config`) enforce consistent code style without per-package configuration duplication
- CI runs lint and typecheck across all packages in a single job, catching cross-package breakages early
- The `catalog:` version pinning means upgrading React or Next.js is a single-line change in `pnpm-workspace.yaml` rather than editing every `package.json`
- Turborepo's caching means incremental builds and test runs are fast, but the cache can occasionally serve stale results -- `turbo run build --force` bypasses it when needed
- The Makefile adds an indirection layer between developers and the underlying tools, which trades some transparency for consistency and discoverability
