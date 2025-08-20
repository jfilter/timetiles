# Contributing to TimeTiles

Thank you for your interest in contributing to TimeTiles!

## Quick Start

```bash
# Fork and clone
git clone https://github.com/YOUR-USERNAME/timetiles.git
cd timetiles

# Setup (one-time)
pnpm install
make setup

# Start development
make dev
```

## Before You Submit

Always run these commands before committing:

```bash
pnpm lint         # Fix linting issues
pnpm typecheck    # Check TypeScript types
pnpm test         # Run tests
```

## Commit Messages

We use conventional commits. See our [detailed commit guidelines](apps/docs/pages/developers/development/commit-guidelines.mdx).

**Quick reference:**
```
feat(web): add dark mode support
fix(import): handle empty CSV files
docs(api): update endpoint examples
refactor(geocoding): extract provider logic
test(events): add validation tests
```

## Project Structure

```
timetiles/
├── apps/
│   ├── web/          # Main Next.js app
│   └── docs/         # Documentation site
├── packages/         # Shared packages
└── Makefile          # Common commands
```

## Development Commands

```bash
make dev              # Start everything
make test-ai          # Run tests (AI-friendly output)
make test-e2e         # Run E2E tests
make db-reset         # Reset database
```

## Code Standards

- **TypeScript**: Strict mode, no `any`
- **Imports**: Named imports only
- **Logging**: Use `logger`, never `console.log`
- **React**: Functional components with hooks
- **Data**: Use React Query for fetching
- **Tests**: Write real tests, no mocks

## Need Help?

- Check existing [issues](https://github.com/jfilter/timetiles/issues)
- Read package-specific `CLAUDE.md` files
- See full [documentation](https://timetiles.org/docs)

## Pull Requests

1. Fork the repo
2. Create feature branch
3. Make your changes
4. Run `pnpm lint && pnpm typecheck`
5. Submit PR to `main` branch

## License

By contributing, you agree to license your contributions under AGPL-3.0.