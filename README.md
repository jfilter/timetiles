<picture>
  <source media="(prefers-color-scheme: dark)" srcset="packages/assets/logos/latest/dark/no-grid/wordmark_horizontal.svg">
  <source media="(prefers-color-scheme: light)" srcset="packages/assets/logos/latest/light/no-grid/wordmark_horizontal.svg">
  <img alt="TimeTiles" src="packages/assets/logos/latest/light/no-grid/wordmark_horizontal.svg" height="56">
</picture>

### Transform your data into interactive, explorable timelines on a map

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

TimeTiles is an open-source platform for visualizing events across time and space. Upload a spreadsheet, and it becomes an interactive map with timeline controls, filters, and rich visualizations — making complex stories accessible to everyone.

Built for **journalists** documenting events across regions, **researchers** analyzing historical patterns, **activists** tracking environmental or social issues, and **organizations** presenting data-driven narratives.

---

## Features

**Import & Processing** — CSV, Excel, ODS, and JSON API sources with automatic format detection. Multi-provider geocoding (Nominatim, Google Maps, OpenCage) with fallback. Scheduled URL imports, batch processing with real-time progress, intelligent caching, and optional web scrapers running in isolated containers.

**Visualization** — Interactive maps with clustering, timeline scrubbing, dynamic filters by category/date/location, automatic histograms, and customizable light/dark themes.

**Sharing** — Shareable URLs with filter state preserved, multi-user collaboration, public or private access control, embeddable views, and full data export.

## Quick Start

```bash
git clone https://github.com/jfilter/timetiles.git
cd timetiles
make init          # setup + database + seed + dev server
```

Open [localhost:3000](http://localhost:3000). Go to [localhost:3000/ingest](http://localhost:3000/ingest), drop a CSV with `title`, `date`, and `location` columns, and watch your data come alive on the map.

## Documentation

Full docs at **[docs.timetiles.io](https://docs.timetiles.io)**.

|                                                                        |                          |
| ---------------------------------------------------------------------- | ------------------------ |
| [Getting Started](https://docs.timetiles.io/guide/getting-started)     | Overview and first steps |
| [Use Cases](https://docs.timetiles.io/guide/use-cases)                 | Real-world examples      |
| [Development Guide](https://docs.timetiles.io/development/development) | Setup and workflows      |
| [Architecture](https://docs.timetiles.io/development/architecture)     | Technical deep dive      |
| [REST API](https://docs.timetiles.io/development/rest-api)             | API reference            |
| [Contributing](CONTRIBUTING.md)                                        | How to contribute        |

## Tech Stack

| Layer     | Technology                                    |
| --------- | --------------------------------------------- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| CMS       | Payload CMS 3 (integrated mode)               |
| Database  | PostgreSQL 17 + PostGIS 3.5                   |
| Maps      | MapLibre GL JS                                |
| UI        | Tailwind CSS, Radix UI, shadcn/ui             |
| i18n      | next-intl (English, German)                   |
| Testing   | Vitest, Playwright                            |

## Development

### Prerequisites

- Node.js 24+, pnpm 10.12+
- Docker & Docker Compose **or** local PostgreSQL 17+ with PostGIS
- Git, Git LFS, Make

```bash
# macOS
brew install git git-lfs node pnpm docker postgresql jq curl
```

### Commands

```bash
make dev            # Start dev server (auto-starts database)
make check          # Lint + typecheck
make test           # Run tests
make test-e2e       # Run E2E tests
make format         # Format code
make migrate        # Run database migrations
make seed           # Seed database
make fresh          # Clean reset: database + migrate + seed
make status         # Check environment health
make help           # Show all commands
```

### Database Mode

Docker is the default. For local Homebrew PostgreSQL, set in `.env`:

```bash
PG_MODE=local
DATABASE_URL=postgresql://timetiles_user:timetiles_password@localhost:5433/timetiles
```

## Project Structure

```
apps/
  web/              Next.js app, Payload CMS, API routes, components
  scraper/          TimeScrape runner (optional, Podman-isolated)
  docs/             Documentation site (Nextra)

packages/
  ui/               Shared UI components (shadcn/ui)
  assets/           Logos and static assets
  payload-schema-detection/   CSV/Excel schema detection
  eslint-config/    Shared ESLint config
  typescript-config/ Shared TypeScript config
  prettier-config/  Shared Prettier config
```

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[GNU Affero General Public License v3.0](LICENSE)

## Acknowledgments

Funded by the [Prototype Fund](https://prototypefund.de) from the German Federal Ministry of Education and Research.

## Contact

- **Issues**: [GitHub Issues](https://github.com/jfilter/timetiles/issues)
- **Discussions**: [GitHub Discussions](https://github.com/jfilter/timetiles/discussions)
- **Security**: [hi@timetiles.io](mailto:hi@timetiles.io)
