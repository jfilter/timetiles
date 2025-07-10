.PHONY: up down logs db-reset db-shell clean setup dev build lint format test seed help

# Start the development environment
up:
	docker compose -f docker-compose.dev.yml up -d
	@echo "🚀 Development environment started!"
	@echo "📊 PostgreSQL: localhost:5432 (user: timetiles_user, db: timetiles)"

# Stop the development environment
down:
	docker compose -f docker-compose.dev.yml down

# View logs
logs:
	docker compose -f docker-compose.dev.yml logs -f

# Reset database (remove volumes and restart)
db-reset:
	docker compose -f docker-compose.dev.yml down -v
	docker compose -f docker-compose.dev.yml up -d postgres
	@echo "🔄 Database reset complete!"

# Open a shell in the PostgreSQL container
db-shell:
	docker exec -it timetiles-postgres psql -U timetiles_user -d timetiles

# Clean up everything (containers, volumes, networks)
clean:
	docker compose -f docker-compose.dev.yml down -v --remove-orphans
	docker system prune -f

# Install dependencies and setup environment
setup:
	@if [ ! -f .env ]; then cp .env.example .env; echo "📝 Created .env file from template"; fi
	pnpm install
	@echo "📦 Dependencies installed!"
	@echo "🔧 Run 'make dev' to start development (infrastructure + server)"

# Start development server (requires infrastructure)
dev:
	@echo "🔍 Checking if infrastructure is running..."
	@if ! docker compose -f docker-compose.dev.yml ps --services --filter status=running | grep -q postgres; then \
		echo "❌ PostgreSQL not running. Starting infrastructure..."; \
		$(MAKE) up; \
		echo "⏳ Waiting for services to be ready..."; \
		sleep 5; \
	fi
	@echo "🚀 Starting development server..."
	pnpm dev

# Build the project
build:
	pnpm build

# Run linting
lint:
	pnpm lint

# Format code
format:
	pnpm format

# Run tests (if you have them)
test:
	pnpm test

# Seed database
seed:
	pnpm seed

# Full development setup (infrastructure + dev server)
dev-full: up
	@echo "⏳ Waiting for services to be ready..."
	@sleep 5
	@echo "🚀 Starting development server..."
	pnpm dev

# Show help
help:
	@echo "📋 Available commands:"
	@echo ""
	@echo "🚀 Development:"
	@echo "  setup       - Install dependencies and create .env file"
	@echo "  dev         - Start development server (auto-starts infrastructure)"
	@echo "  dev-full    - Start infrastructure and development server"
	@echo "  build       - Build the project"
	@echo ""
	@echo "🔍 Code Quality:"
	@echo "  lint        - Run ESLint"
	@echo "  format      - Format code with Prettier"
	@echo "  test        - Run tests"
	@echo ""
	@echo "🌱 Database:"
	@echo "  seed        - Seed database with sample data"
	@echo ""
	@echo "🐳 Infrastructure:"
	@echo "  up          - Start development environment"
	@echo "  down        - Stop development environment"
	@echo "  logs        - View container logs"
	@echo "  db-reset    - Reset database (removes all data)"
	@echo "  db-shell    - Open PostgreSQL shell"
	@echo "  clean       - Clean up everything"
