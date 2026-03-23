# Contributing to TimeTiles

Thank you for your interest in contributing! This guide covers everything you need to get started.

## Quick Start

```bash
git clone https://github.com/jfilter/timetiles.git
cd timetiles
make init        # setup + database + seed + dev server
```

Open [localhost:3000](http://localhost:3000) to verify everything works. See the [Development Guide](https://docs.timetiles.io/development/development) for detailed setup instructions.

## Development Workflow

### Before you start

- Check [open issues](https://github.com/jfilter/timetiles/issues) for something to work on
- For larger changes, open an issue first to discuss the approach

### Making changes

1. Fork the repository and create a branch from `main`
2. Make your changes
3. Run checks before committing:

```bash
make check       # lint + typecheck
make test        # unit + integration tests
make test-e2e    # end-to-end tests (optional for non-UI changes)
```

4. Commit using [conventional commits](https://docs.timetiles.io/development/development/commit-guidelines):

```
feat(import): add support for JSON API sources
fix(geocoding): handle addresses with special characters
docs: update API endpoint examples
```

5. Push and open a pull request against `main`

### Database

Docker is the default. For local PostgreSQL, set `PG_MODE=local` in your `.env`. All `make` commands respect this automatically.

```bash
make dev         # start dev server (auto-starts database)
make db-reset    # reset database
make fresh       # clean reset: database + migrate + seed
make status      # check environment health
```

## Project Structure

```
apps/
  web/           Next.js application, Payload CMS, API routes
  scraper/       Scraper runner (optional, requires Podman)
  docs/          Documentation site (Nextra)

packages/
  ui/            Shared UI components (shadcn/ui)
  assets/        Logos and static assets (Git LFS)
  payload-schema-detection/  CSV/Excel schema detection
  eslint-config/ Shared ESLint config
  typescript-config/  Shared TypeScript config
  prettier-config/    Shared Prettier config
```

## Code Standards

- **TypeScript strict mode** throughout
- **Named imports** only: `import { foo } from 'bar'`
- **No `console.log`** — use `logger.info()` / `logError()` from `@/lib/logger`
- **React Query** for all data fetching — never fetch directly in components
- **Coordinates** always in `[longitude, latitude]` order (GeoJSON standard)
- **PostGIS** for all spatial queries — no client-side geo computations

## Testing

We use real implementations, not mocks. See the [Testing Guidelines](https://docs.timetiles.io/development/development/testing-guidelines) for details.

| Type        | Location             | Framework           | What to test                                       |
| ----------- | -------------------- | ------------------- | -------------------------------------------------- |
| Unit        | `tests/unit/`        | Vitest              | Pure functions, business logic                     |
| Integration | `tests/integration/` | Vitest + PostgreSQL | API endpoints, job processing, database operations |
| E2E         | `tests/e2e/`         | Playwright          | User workflows in the browser                      |

## Pull Requests

- Keep PRs focused on a single concern
- Include tests for new functionality
- Update documentation if you change public APIs or user-facing behavior
- All checks must pass (`make check` + `make test`)
- Describe what changed and why in the PR description

## Need Help?

- [GitHub Discussions](https://github.com/jfilter/timetiles/discussions) — questions and ideas
- [GitHub Issues](https://github.com/jfilter/timetiles/issues) — bug reports and feature requests
- [Documentation](https://docs.timetiles.io) — architecture, API reference, guides

## License

By contributing, you agree to license your contributions under the [AGPL-3.0](LICENSE).
