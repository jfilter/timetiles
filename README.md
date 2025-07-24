# TimeTiles

Welcome to the TimeTiles monorepo!

**TimeTiles is an open-source platform for creating interactive chronicles of geospatial events.** Designed for journalists, researchers, activists, and the general public, TimeTiles transforms datasets with location, time, and metadata into compelling, explorable stories that anyone can understand.

This project is built with Next.js, Payload CMS, and PostgreSQL/PostGIS for spatial data management and content administration.

This project is funded by the Prototype Fund.

## 🚀 Key Features

### 📤 Event Data Import System

A comprehensive event data import system with real-time processing and automatic geocoding:

- **Multi-format Support**: Upload CSV and Excel files (.xlsx, .xls)
- **Automatic Geocoding**: Address geocoding with Google Maps API and OpenStreetMap fallback
- **Real-time Progress**: Live updates with detailed processing stages
- **Public Access**: Full functionality for unauthenticated users with rate limiting
- **Batch Processing**: Efficient handling of large datasets
- **Smart Caching**: Intelligent geocoding cache to reduce API calls

#### Quick Start Example

```bash
# Upload a CSV file via API
curl -X POST http://localhost:3000/api/import/upload \
  -F "file=@events.csv" \
  -F "catalogId=your-catalog-id"

# Track progress
curl http://localhost:3000/api/import/{importId}/progress
```

Or use the web interface at `/import` for drag-and-drop file uploads.

**📚 Detailed Documentation**: [`apps/web/docs/IMPORT_SYSTEM.md`](apps/web/docs/IMPORT_SYSTEM.md)

## 📖 Documentation

For full documentation, setup instructions, and guides, please visit our documentation site:

👉 [TimeTiles Documentation](./apps/docs)

### Quick Links

- [Development Setup](apps/docs/pages/development/setup.mdx)
- [Architecture & Tech Stack](apps/docs/pages/architecture.mdx) - Complete technology overview and design decisions
- [Import System Documentation](apps/web/docs/IMPORT_SYSTEM.md)
- [API Reference](apps/web/docs/API.md)
- [Troubleshooting Guide](apps/web/docs/TROUBLESHOOTING.md)
