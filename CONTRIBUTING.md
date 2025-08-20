# Contributing to TimeTiles

Thank you for your interest in contributing to TimeTiles!

## Getting Started

See our documentation for:
- [Development Setup](apps/docs/pages/developers/setup/local-development.mdx)
- [Project Structure](apps/docs/pages/developers/architecture/project-structure.mdx)
- [Commit Guidelines](apps/docs/pages/developers/development/commit-guidelines.mdx)
- [Code Standards](apps/docs/pages/developers/development/code-standards.mdx)
- [Testing Guide](apps/docs/pages/developers/development/testing-guide.mdx)

## Quick Reference

```bash
# Setup
make setup            # One-time setup
make dev              # Start development

# Before committing
pnpm lint            # Fix linting issues
pnpm typecheck       # Check types
pnpm test            # Run tests

# Testing
make test-ai         # AI-friendly test output
make test-e2e        # E2E tests
```

## Pull Requests

1. Fork the repo
2. Create feature branch from `main`
3. Make your changes
4. Run `pnpm lint && pnpm typecheck`
5. Submit PR with clear description

## Need Help?

- Check [GitHub Issues](https://github.com/jfilter/timetiles/issues)
- Read package-specific `CLAUDE.md` files
- See full [documentation](https://timetiles.org/docs)

## License

By contributing, you agree to license your contributions under AGPL-3.0.