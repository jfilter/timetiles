# Development Setup

This project uses Docker Compose for the development environment with PostgreSQL 17 + PostGIS.

## Quick Start

1. **Setup environment**:

   ```bash
   make setup
   ```

2. **Start development (infrastructure + server)**:

   ```bash
   make dev
   ```

That's it! The `make dev` command will:

- Check if infrastructure is running
- Start Docker services if needed
- Launch the Next.js development server

## Alternative Workflows

If you prefer to manage services separately:

```bash
# Start only infrastructure
make up

# Start only the development server
pnpm dev

# Or force-restart infrastructure first
make dev-full
```

## Services

### PostgreSQL with PostGIS

- **Host**: localhost:5432
- **Database**: timetiles
- **Username**: timetiles_user
- **Password**: timetiles_password
- **Extensions**: PostGIS, PostGIS Topology

## Available Commands

### 🚀 Development

```bash
make setup      # Install dependencies and create .env file
make dev        # Start development server (auto-starts infrastructure)
make dev-full   # Start infrastructure and development server
make build      # Build the project
```

### 🔍 Code Quality

```bash
make lint       # Run ESLint
make format     # Format code with Prettier
make test       # Run tests
```

### 🐳 Infrastructure

```bash
make up         # Start development environment
make down       # Stop development environment
make logs       # View container logs
make db-reset   # Reset database (removes all data)
make db-shell   # Open PostgreSQL shell
make clean      # Clean up everything
```

## Database Schema

The project uses Payload CMS with PostgreSQL + PostGIS for spatial data management:

- PostGIS geometry support for spatial data
- JSONB fields for flexible data storage
- Payload CMS collections for structured content management
- GraphQL and REST APIs automatically generated

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

```bash
cp .env.example .env
```

Key variables:

- `DATABASE_URL`: PostgreSQL connection string

## Troubleshooting

### ARM64/Apple Silicon Compatibility

The Docker Compose setup uses `platform: linux/amd64` for PostgreSQL to ensure PostGIS compatibility across all platforms.

### Reset everything

```bash
make clean
make setup
make up
```

### View logs

```bash
make logs
```

### Check service health

```bash
docker compose -f docker-compose.dev.yml ps
```
