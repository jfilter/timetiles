# Contributing to TimeTiles

Thank you for your interest in contributing to TimeTiles!

## Quick Start

```bash
# Clone and initialize
git clone https://github.com/jfilter/timetiles.git
cd timetiles
make init             # Complete setup + start dev server

# Before committing
make check-ai         # Linting & typecheck (AI-friendly)
make test-ai          # Run tests (AI-friendly)
make test-e2e         # Run E2E tests
```

## Documentation

See our full documentation at **[docs.timetiles.io](https://docs.timetiles.io)**:

- [Development Guide](https://docs.timetiles.io/developer-guide/development)
- [Architecture](https://docs.timetiles.io/developer-guide/architecture)
- [Commit Guidelines](https://docs.timetiles.io/developer-guide/development/commit-guidelines)
- [Testing Guidelines](https://docs.timetiles.io/developer-guide/development/testing-guidelines)

## Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes following our code standards
4. Run `make check-ai` and fix any issues
5. Run `make test-ai` to ensure tests pass
6. Submit a PR with a clear description

We use [Conventional Commits](https://docs.timetiles.io/developer-guide/development/commit-guidelines) for commit messages.

## Need Help?

- [GitHub Issues](https://github.com/jfilter/timetiles/issues) - Bug reports and feature requests
- [GitHub Discussions](https://github.com/jfilter/timetiles/discussions) - Questions and community
- [Documentation](https://docs.timetiles.io) - Full guides and references

## License

By contributing, you agree to license your contributions under AGPL-3.0.
