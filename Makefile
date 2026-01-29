# TimeTiles Development & Testing Commands
# This Makefile provides commands for LOCAL DEVELOPMENT AND TESTING ONLY (not production)

.PHONY: all selftest status up down logs db-reset wait-db db-shell db-query db-logs db-reset-tests clean setup seed init ensure-infra dev kill-dev fresh reset build lint lint-full typecheck typecheck-full format test test-ai test-e2e test-deploy-unit test-deploy-integration test-deploy-ci test-deploy test-coverage coverage coverage-check migrate migrate-create check check-full check-ai image image-allinone help

all: help

# Validate environment prerequisites and setup completion
selftest:
	@./scripts/selftest.sh

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

# Wait for database to be ready (requires pg_isready - see README for prerequisites)
wait-db:
	@echo "⏳ Waiting for database to be ready..."
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do \
		if pg_isready -h localhost -p 5432 -U timetiles_user >/dev/null 2>&1; then \
			echo "✅ Database is ready!"; \
			exit 0; \
		fi; \
		echo "  Attempt $$i/20 - waiting..."; \
		sleep 2; \
	done; \
	echo "❌ Database failed to become ready"; \
	exit 1

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
	@docker exec -e PGPASSWORD=timetiles_password timetiles-postgres psql -h localhost -U timetiles_user -d $(if $(DB_NAME),$(DB_NAME),timetiles) -c "$(SQL)"

# View PostgreSQL logs
db-logs:
	docker compose -f docker-compose.dev.yml logs postgres -f --tail=100

# Reset all test databases (drop all + recreate e2e database)
# Vitest databases are created on-demand when tests run
db-reset-tests:
	@echo "🧹 Dropping all test databases (timetiles_test_*)..."
	@docker exec timetiles-postgres psql -U timetiles_user -d postgres -t -c \
		"SELECT datname FROM pg_database WHERE datname LIKE 'timetiles_test_%'" | \
		while read db; do \
			if [ -n "$$db" ]; then \
				echo "  Dropping $$db..."; \
				docker exec timetiles-postgres psql -U timetiles_user -d postgres -c "DROP DATABASE \"$$db\"" 2>/dev/null || true; \
			fi; \
		done
	@echo "🔄 Recreating E2E test database..."
	@cd apps/web && pnpm exec tsx scripts/e2e-setup-database.ts
	@echo "✅ Test databases reset complete"

# Clean up everything (containers, volumes, networks)
clean:
	docker compose -f docker-compose.dev.yml down -v --remove-orphans
	docker system prune -f

# Complete first-time development setup
# Runs comprehensive setup: env files, dependencies, Git LFS, Git config
setup:
	@./scripts/setup.sh

# Complete fresh start (clean slate)
fresh: clean up wait-db
	@echo "🔄 Running migrations..."
	@$(MAKE) migrate
	@echo "🌱 Seeding database..."
	@$(MAKE) seed ARGS="development"
	@echo ""
	@echo "✅ Fresh environment ready!"
	@echo "🚀 Run 'make dev' to start development server"

# Quick reset (preserves Docker images)
reset: kill-dev db-reset wait-db
	@echo "🔄 Running migrations..."
	@$(MAKE) migrate
	@echo "🌱 Seeding database..."
	@$(MAKE) seed ARGS="development"
	@echo ""
	@echo "✅ Environment reset complete!"
	@echo "🚀 Starting development server..."
	@echo ""
	@exec $(MAKE) dev

# Ensure infrastructure is running
ensure-infra:
	@if ! docker compose -f docker-compose.dev.yml ps --services --filter status=running | grep -q postgres; then \
		echo "❌ PostgreSQL not running. Starting infrastructure..."; \
		$(MAKE) up && $(MAKE) wait-db; \
	fi

# Check development environment status
status:
	@./scripts/status.sh

# Start development server (requires infrastructure)
dev: ensure-infra
	@echo "🚀 Starting development server..."
	exec pnpm dev

# Kill all development servers and processes
kill-dev:
	@echo "🛑 Stopping all development servers..."
	@# Kill Next.js dev servers
	@pkill -f "next dev" 2>/dev/null || true
	@# Kill Turbo
	@pkill -f "turbo" 2>/dev/null || true
	@# Kill any node processes running in the project directory
	@pkill -f "node.*timetiles" 2>/dev/null || true
	@# Kill Playwright test server if running
	@pkill -f "playwright.*test-server" 2>/dev/null || true
	@# Kill pnpm dev processes
	@pkill -f "pnpm dev" 2>/dev/null || true
	@# Clear any turbo daemon
	@pnpm turbo daemon stop 2>/dev/null || true
	@echo "✅ All development servers stopped"

# Build the project
build:
	pnpm build

# Run linting with oxlint (fast, for development)
# ~165x faster than ESLint
lint:
	pnpm lint

# Run full linting with ESLint (for CI)
# Includes specialized plugins: boundaries, jsdoc, sonarjs, react-compiler, etc.
lint-full:
	pnpm lint:full

# Run typecheck with tsgo (fast, for development)
# ~10x faster than tsc
typecheck:
	pnpm typecheck

# Run full typecheck with tsc (for CI)
typecheck-full:
	pnpm typecheck:full

# Format code
format:
	pnpm format

# Run tests (if you have them)
test:
	pnpm test

# Run tests with AI-friendly output
# Usage: make test-ai [FILTER=pattern]
# Examples:
#   make test-ai                                    # Run all tests (Turbo cached)
#   make test-ai FILTER=tests/unit                  # Run unit tests directory
#   make test-ai FILTER=date.test                   # Run tests matching pattern (faster)
#   make test-ai FILTER=store.test                  # Run store tests
#   make test-ai FILTER=tests/unit/lib              # Run specific directory
#   make test-ai FILTER="date|store|geo"            # Run multiple patterns (pipe-separated)
#   make test-ai FILTER="date store geo"            # Run multiple patterns (space-separated)
# Note: Full runs (no FILTER) use Turbo caching. Filtered runs bypass Turbo.
test-ai:
	@if [ -z "$(FILTER)" ]; then \
		pnpm turbo run test:ai --filter=web; \
	else \
		cd apps/web && pnpm test:ai "$(FILTER)"; \
	fi

# Run combined code quality checks with AI-friendly output (lint + typecheck)
# Usage:
#   make check-ai              # Check all packages with consistent summary
#   make check-ai PACKAGE=web  # Check only apps/web with detailed output
#   make check-ai PACKAGE=docs # Check only apps/docs
check-ai:
	@if [ -z "$(PACKAGE)" ]; then \
		pnpm exec tsx scripts/check-ai.ts; \
	elif [ "$(PACKAGE)" = "web" ]; then \
		cd apps/web && pnpm check:ai; \
	elif [ "$(PACKAGE)" = "docs" ]; then \
		pnpm --filter docs lint && pnpm --filter docs typecheck; \
	elif [ "$(PACKAGE)" = "ui" ]; then \
		pnpm --filter ui lint && pnpm --filter ui typecheck; \
	else \
		echo "❌ Unknown package: $(PACKAGE)"; \
		echo "Available packages: web, docs, ui"; \
		exit 1; \
	fi

# Run tests with coverage report
test-coverage:
	pnpm test:coverage

# Show coverage summary
coverage:
	pnpm test:coverage:summary

# Check coverage threshold (files below 80%) - bypasses turbo (app-specific with arguments)
coverage-check:
	pnpm --filter web test:coverage:check

# Seed database (web-specific with arguments)
# Usage: make seed ARGS="development users catalogs"
# Set LOG_LEVEL=info by default for cleaner output (use LOG_LEVEL=debug for verbose)
seed:
	@LOG_LEVEL=info pnpm --filter web seed $(ARGS)

# Complete first-time initialization (setup + database + seed + start dev)
init: setup up wait-db
	@echo "🔄 Running migrations..."
	@$(MAKE) migrate
	@echo "🌱 Seeding development data..."
	@$(MAKE) seed ARGS="development"
	@echo ""
	@echo "✅ Initialization complete!"
	@echo "🚀 Starting development server..."
	@echo ""
	@$(MAKE) dev

# Run E2E tests (handles database setup automatically) - web-specific, bypasses turbo
# Usage: make test-e2e FILTER="test name pattern"
test-e2e:
	@echo "🧪 Running E2E tests with automatic database setup..."
ifdef FILTER
	pnpm --filter web exec playwright test -g "$(FILTER)"
else
	pnpm --filter web test:e2e
endif

# =============================================================================
# Deployment Tests
# =============================================================================

## Run deployment unit tests (fast, no Docker)
test-deploy-unit:
	@cd deployment/tests && ./run-unit.sh

## Run deployment integration tests (requires Docker)
test-deploy-integration:
	@cd deployment/tests && ./run-integration.sh

## Run all deployment tests (for CI - no VM)
test-deploy-ci:
	@cd deployment/tests && ./run-all.sh

## Run all deployment tests in Multipass VM
test-deploy:
	@cd deployment/tests && ./run-vm.sh

# Run database migrations (web-specific, bypasses turbo)
migrate:
	@echo "🔄 Running database migrations..."
	pnpm --filter web payload:migrate

# Create a new database migration (bypasses turbo - interactive command)
migrate-create:
	@echo "📝 Creating new database migration..."
	pnpm --filter web payload:migrate:create

# Run combined lint + typecheck (fast, for development)
check:
	pnpm check

# Run combined full lint + typecheck (for CI)
check-full:
	pnpm check:full

# =============================================================================
# Docker Images (local builds)
# =============================================================================

# Default image name and tag
IMAGE_REGISTRY ?= ghcr.io/jfilter/timetiles
IMAGE_TAG ?= local

## Build main production Docker image locally
## Usage: make image [IMAGE_TAG=...] [PLATFORM=linux/amd64]
image:
ifdef PLATFORM
	docker build --platform $(PLATFORM) -f deployment/Dockerfile.prod -t $(IMAGE_REGISTRY):$(IMAGE_TAG) .
else
	docker build -f deployment/Dockerfile.prod -t $(IMAGE_REGISTRY):$(IMAGE_TAG) .
endif

## Build all-in-one Docker image locally
## Usage: make image-allinone [IMAGE_TAG=...] [PLATFORM=linux/amd64]
image-allinone:
ifdef PLATFORM
	docker build --platform $(PLATFORM) -f deployment/Dockerfile.allinone -t $(IMAGE_REGISTRY):$(IMAGE_TAG)-allinone .
else
	docker build -f deployment/Dockerfile.allinone -t $(IMAGE_REGISTRY):$(IMAGE_TAG)-allinone .
endif

# Show help
help:
	@printf '%s\n' \
		'📋 TimeTiles Makefile Commands' \
		'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' '' \
		'🏁 Getting Started:' \
		'  selftest    - Validate environment (prerequisites + setup completion)' \
		'  setup       - First-time setup (deps, .env files, Git LFS, Git config)' \
		'  init        - Complete initialization (setup + db + seed + start dev)' \
		'  fresh       - Nuclear reset (wipes everything + rebuild)' '' \
		'🚀 Daily Development:' \
		'  dev         - Start development server (auto-starts infrastructure)' \
		'  status      - Check development environment health' \
		'  kill-dev    - Stop all development servers and processes' \
		'  reset       - Reset database (wipe db + migrate + seed)' \
		'  build       - Build the project' '' \
		'🔍 Code Quality:' \
		'  lint        - Run oxlint (fast, ~1s for dev)' \
		'  lint-full   - Run ESLint (thorough, ~3min for CI)' \
		'  typecheck   - Run tsgo (fast, ~15s for dev)' \
		'  typecheck-full - Run tsc (thorough, for CI)' \
		'  check       - Run lint + typecheck (fast, for dev)' \
		'  check-full  - Run lint-full + typecheck-full (for CI)' \
		'  check-ai    - Run code quality checks with AI-friendly output' \
		'                Usage: make check-ai [PACKAGE=web|docs|ui]' \
		'  format      - Format code with Prettier' '' \
		'🧪 Testing:' \
		'  test        - Run tests (standard output)' \
		'  test-ai     - Run tests with AI-friendly output (web app only)' \
		'                Usage: make test-ai [FILTER=pattern]' \
		'                Full runs use Turbo caching, filtered runs bypass cache' \
		'                Examples:' \
		'                  make test-ai                    # All tests (Turbo cached)' \
		'                  make test-ai FILTER=date.test   # Pattern match (fastest)' \
		'                  make test-ai FILTER=tests/unit  # Directory' \
		'  test-e2e      - Run E2E tests with automatic database setup' \
		'  test-coverage - Run tests and generate coverage report' \
		'  coverage      - Show last coverage summary (quick)' \
		'  coverage-check - Show files below 80% coverage threshold' '' \
		'🚀 Deployment Tests:' \
		'  test-deploy-unit        - Run unit tests (fast, no Docker)' \
		'  test-deploy-integration - Run integration tests (requires Docker)' \
		'  test-deploy-ci          - Run all tests for CI (no VM)' \
		'  test-deploy             - Run all tests in Multipass VM' '' \
		'🌱 Database:' \
		'  seed          - Seed database with sample data' \
		'                  Usage: make seed ARGS='"'"'development users'"'"'' \
		'  migrate       - Run pending database migrations' \
		'  migrate-create - Create a new database migration' \
		'  db-shell      - Open PostgreSQL shell (interactive)' \
		'  db-query      - Execute SQL query (non-interactive)' \
		'                  Usage: make db-query SQL='"'"'SELECT ...'"'"' [DB_NAME=database_name]' \
		'  db-logs       - View PostgreSQL logs (live tail)' \
		'  db-reset      - Reset database (removes all data)' \
		'  db-reset-tests - Reset all test databases (drop + recreate e2e)' '' \
		'📦 Docker Images:' \
		'  image          - Build main production image locally' \
		'  image-allinone - Build all-in-one image locally' \
		'                   Override defaults: IMAGE_REGISTRY=... IMAGE_TAG=...' \
		'                   Cross-build: PLATFORM=linux/amd64' '' \
		'🐳 Infrastructure:' \
		'  up          - Start development environment (docker compose)' \
		'  down        - Stop development environment' \
		'  logs        - View all container logs' \
		'  clean       - Clean up everything (containers, volumes, networks)' '' \
		'📖 Parameters:' \
		'  FILTER=pattern   - Filter tests by pattern (use with test-ai)' \
		'                     Examples: FILTER=date.test, FILTER=tests/unit' \
		'  PACKAGE=name     - Target specific package (use with check-ai)' \
		'                     Options: web, docs, ui' \
		'  SQL=query        - SQL query to execute (use with db-query)' \
		'                     Example: SQL='"'"'SELECT COUNT(*) FROM events'"'"'' \
		'  DB_NAME=name     - Database name (use with db-query)' \
		'                     Default: timetiles' \
		'  ARGS=args        - Arguments for command (use with seed)' \
		'                     Example: ARGS='"'"'development users catalogs'"'"'' '' \
		'💡 Quick Start:' \
		'  make selftest   # Validate environment readiness' \
		'  make init       # Complete initialization + start dev' \
		'  make status     # Check running services' '' \
		'ℹ️  This Makefile is for LOCAL DEVELOPMENT AND TESTING ONLY'
