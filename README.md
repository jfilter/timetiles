# TimeTiles

> Transform your data into interactive, explorable timelines on a map

**TimeTiles** is an open-source platform that helps journalists, researchers, activists, and organizations visualize events across time and space. Upload your data, and TimeTiles automatically creates an interactive map with timeline controls, filters, and rich visualizations that make complex stories accessible to everyone.

## 🎯 What TimeTiles Does

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

Built with Next.js, React, PostgreSQL/PostGIS, and Payload CMS. Funded by the [Prototype Fund](https://prototypefund.de).

## ✨ Key Features

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
# Clone and setup
git clone https://github.com/jfilter/timetiles.git
cd timetiles

# Start with Docker (recommended)
make setup  # One-time setup
make dev    # Start everything

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

### For Users
- [Getting Started](apps/docs/pages/getting-started/index.mdx) - Overview and first steps
- [Data Preparation Guide](apps/docs/pages/users/guides/data-preparation.mdx) - Format your data correctly
- [Creating Chronicles](apps/docs/pages/users/guides/creating-chronicles.mdx) - Step-by-step guide
- [Sharing & Embedding](apps/docs/pages/users/guides/sharing.mdx) - Share your stories

### For Developers
- [Installation Guide](apps/docs/pages/getting-started/installation.mdx) - Deployment options
- [Architecture Overview](apps/docs/pages/developers/architecture/index.mdx) - Technical deep dive
- [API Reference](apps/docs/pages/reference/api/) - REST API documentation
- [Contributing Guide](CONTRIBUTING.md) - How to contribute

## 🛠️ Development

### Prerequisites
- Node.js 20+ (we recommend Node.js 24)
- pnpm package manager
- Docker & Docker Compose
- PostgreSQL 17 with PostGIS extension (handled by Docker)

### Installation

```bash
# Clone the repository
git clone https://github.com/jfilter/timetiles.git
cd timetiles

# Install dependencies
pnpm install

# Setup environment
cp apps/web/.env.example apps/web/.env.local

# Start PostgreSQL with PostGIS
make up

# Run database migrations
cd apps/web && pnpm payload:migrate && cd ../..

# Start development server
pnpm dev
```

### Development Commands

```bash
make dev        # Start development environment
make test-ai    # Run tests with AI-friendly output
make db-query   # Execute SQL queries
pnpm lint       # Lint code
pnpm typecheck  # Type checking
pnpm format     # Format code
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### How to Contribute
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup
See our [Development Guide](apps/docs/pages/developers/development/index.mdx) for detailed setup instructions.

## 📝 License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Funded by the [Prototype Fund](https://prototypefund.de) from the German Federal Ministry of Education and Research
- Built with amazing open-source projects including Next.js, React, PostgreSQL, and Payload CMS
- Special thanks to all contributors and early testers

## 📧 Contact & Support

- **Issues**: [GitHub Issues](https://github.com/jfilter/timetiles/issues)
- **Discussions**: [GitHub Discussions](https://github.com/jfilter/timetiles/discussions)
- **Security**: Please report security vulnerabilities to [security@timetiles.org](mailto:security@timetiles.org)

## 🚦 Project Status

TimeTiles is actively developed and maintained. We're working towards a stable v1.0 release.

- ✅ Core functionality complete
- 🚧 Documentation improvements in progress
- 🚧 Cloud hosting options coming soon
- 📋 See our [Roadmap](apps/docs/pages/reference/roadmap.mdx) for planned features

---

<p align="center">
  Made with ❤️ for data storytellers everywhere
</p>
