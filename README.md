# TimeTiles

> Transform your data into interactive, explorable timelines on a map

**TimeTiles** is an open-source platform that helps journalists, researchers, activists, and organizations visualize events across time and space. Upload your data, and TimeTiles automatically creates an interactive map with timeline controls, filters, and rich visualizations that make complex stories accessible to everyone.

## What TimeTiles Does

TimeTiles turns spreadsheets of events into interactive experiences:

- **📍 Map Visualization**: See where events happened with automatic clustering and smooth interactions
- **📅 Timeline Controls**: Navigate through time to see how stories unfold
- **🔍 Smart Filters**: Let viewers explore data by categories, dates, and locations
- **📊 Data Analysis**: Built-in histograms and charts reveal patterns in your data
- **🌐 Web-Ready**: Share your chronicles with a link or embed them in your website

Perfect for:

- **Journalists** documenting news events across regions
- **Researchers** analyzing historical patterns
- **Activists** tracking environmental or social issues
- **Organizations** presenting data-driven narratives

Built with Next.js, React, PostgreSQL/PostGIS, and Payload CMS.

## Key Features

### Data Import & Processing

- **📁 Multiple Formats**: Import CSV and Excel files with automatic format detection
- **🗺️ Smart Geocoding**: Automatically convert addresses to map coordinates
- **⚡ Real-time Progress**: Watch your data being processed with live updates
- **🔄 Batch Processing**: Handle thousands of events efficiently
- **💾 Intelligent Caching**: Reduce API costs with smart location caching

### Visualization & Exploration

- **🗺️ Interactive Maps**: Pan, zoom, and explore events spatially
- **📊 Timeline Views**: Scrub through time to see patterns emerge
- **🎛️ Dynamic Filters**: Let users explore by categories, dates, and custom fields
- **📈 Data Analysis**: Automatic histograms and statistical visualizations
- **🎨 Customizable Themes**: Light/dark modes and configurable styles

### Sharing & Collaboration

- **🔗 Shareable Links**: Each view has a unique URL with filters preserved
- **🖼️ Embeddable Widgets**: Add TimeTiles to any website with an iframe
- **👥 Multi-user Support**: Collaborate with team members on datasets
- **🔒 Access Control**: Public or private chronicles with granular permissions

## 🚀 Quick Start

### Try TimeTiles in 5 Minutes

```bash
# Clone and initialize
git clone https://github.com/jfilter/timetiles.git
cd timetiles

# Single command: setup + database + seed + start dev server
make init

# Open in browser
# Main app: http://localhost:3000
# Admin: http://localhost:3000/admin
```

Your first chronicle:

1. Navigate to http://localhost:3000/import
2. Drop a CSV file with columns: `title`, `date`, `location` (address or coordinates)
3. Watch as TimeTiles geocodes and visualizes your data
4. Share your interactive chronicle with others!

## 📖 Documentation

Full documentation at **[docs.timetiles.io](https://docs.timetiles.io)**

### For Users

- [Getting Started](https://docs.timetiles.io/user-guide/getting-started) - Overview and first steps
- [Data Preparation](https://docs.timetiles.io/user-guide/data-preparation) - Format your data correctly
- [Creating Chronicles](https://docs.timetiles.io/user-guide/creating-chronicles) - Step-by-step guide
- [Sharing & Embedding](https://docs.timetiles.io/user-guide/sharing) - Share your stories

### For Developers

- [Development Guide](https://docs.timetiles.io/developer-guide/development) - Setup and workflows
- [Architecture](https://docs.timetiles.io/developer-guide/architecture) - Technical deep dive
- [API Reference](https://docs.timetiles.io/developer-guide/rest-api) - REST API documentation
- [Contributing Guide](CONTRIBUTING.md) - How to contribute

## Development

### Prerequisites

- Bash
- Git
- Git LFS
- Make
- Node.js 24+
- pnpm 10.12.4+
- Docker & Docker Compose

### Installation

See the [Quick Start](#-quick-start) section above (`make init`). For detailed setup instructions, see our [Developer Guide](https://docs.timetiles.io/developer-guide/development).

### Development Commands

```bash
# Daily workflow
make dev        # Start development server
make status     # Check environment health
make kill-dev   # Stop all dev servers

# Code quality
make check      # Run lint + typecheck
make test       # Run tests
make test-e2e   # Run E2E tests
make format     # Format code

# Database
make migrate    # Run migrations
make seed       # Seed database
make db-shell   # PostgreSQL shell
make db-query   # Execute SQL queries
make reset      # Reset database

# All commands
make help       # Show all available commands
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Funded by the [Prototype Fund](https://prototypefund.de) from the German Federal Ministry of Education and Research

## Contact & Support

- **Issues**: [GitHub Issues](https://github.com/jfilter/timetiles/issues)
- **Discussions**: [GitHub Discussions](https://github.com/jfilter/timetiles/discussions)
- **Security**: Please report security vulnerabilities to [security@timetiles.io](mailto:security@timetiles.io)
