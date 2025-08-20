.PHONY: up down logs db-reset db-shell db-query clean setup seed dev build lint typecheck format test test-e2e help

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
	docker compose -f docker-compose.dev.yml logs

# Reset database (remove volumes and restart)
db-reset:
	docker compose -f docker-compose.dev.yml down -v
	docker compose -f docker-compose.dev.yml up -d postgres
	@echo "🔄 Database reset complete!"

# Open a shell in the PostgreSQL container
db-shell:
	docker exec -it timetiles-postgres psql -U timetiles_user -d timetiles

# Execute SQL query non-interactively
db-query:
	@if [ -z "$(SQL)" ]; then \
		echo "Usage: make db-query SQL='SELECT * FROM your_table' [DB_NAME=database_name]"; \
		echo "Example: make db-query SQL='SELECT COUNT(*) FROM events'"; \
		echo "Example: make db-query SQL='SELECT COUNT(*) FROM events' DB_NAME=timetiles_test"; \
		exit 1; \
	fi
	@docker exec timetiles-postgres psql -U timetiles_user -d $(if $(DB_NAME),$(DB_NAME),timetiles) -c "$(SQL)"

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

# Run typecheck
typecheck:
	pnpm typecheck

# Format code
format:
	pnpm format

# Run tests (if you have them)
test:
	pnpm test

# Run tests with AI-friendly output
test-ai:
	cd apps/web && pnpm test:ai

# Run tests with coverage report
test-coverage:
	pnpm test:coverage

# Show coverage summary
coverage:
	@npx tsx scripts/coverage-summary.ts --details

# Seed database
seed:
	pnpm seed

# Full development setup (infrastructure + dev server)
dev-full: up
	@echo "⏳ Waiting for services to be ready..."
	@sleep 5
	@echo "🚀 Starting development server..."
	pnpm dev

# Run E2E tests (handles database setup automatically)
test-e2e:
	@echo "🧪 Running E2E tests with automatic database setup..."
	cd apps/web && pnpm test:e2e

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
	@echo "  typecheck   - Run typecheck"
	@echo "  format      - Format code with Prettier"
	@echo ""
	@echo "🧪 Testing:"
	@echo "  test        - Run tests"
	@echo "  test-coverage - Run tests and generate coverage"
	@echo "  coverage    - Show last coverage summary (quick)"
	@echo "  test-e2e    - Run E2E tests with automatic database setup"
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
	@echo "  db-query    - Execute SQL query (usage: make db-query SQL='SELECT ...')"
	@echo "  clean       - Clean up everything"
