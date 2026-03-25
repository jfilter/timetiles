# TimeTiles Development & Testing Commands
# This Makefile provides commands for LOCAL DEVELOPMENT AND TESTING ONLY (not production)

.PHONY: all selftest status up down logs db-reset wait-db db-shell db-query db-logs db-reset-tests clean setup seed demo-data setup-site demo-berlin init ensure-infra jobs dev storybook check-cva timescrape-dev timescrape-images timescrape-test kill-dev fresh reset build lint typecheck typecheck-full format test test-ai test-e2e test-e2e-debug test-deploy-unit test-deploy-integration test-deploy-ci test-deploy test-coverage coverage coverage-check migrate migrate-create check check-full check-ai check-theme images worktree worktree-rm worktree-ls worktree-setup help

# Load PG_MODE from .env (default: docker)
-include .env
PG_MODE ?= docker
PG_PORT := $(if $(filter local,$(PG_MODE)),5433,5432)

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

# Reset database
db-reset:
	@if [ "$(PG_MODE)" = "local" ]; then \
		echo "🔄 Resetting local database..."; \
		psql -p 5433 -d postgres -c "DROP DATABASE IF EXISTS timetiles;" && \
		psql -p 5433 -d postgres -c "CREATE DATABASE timetiles OWNER timetiles_user;" && \
		psql -p 5433 -d timetiles -c "CREATE SCHEMA IF NOT EXISTS payload;" && \
		psql -p 5433 -d timetiles -c "CREATE EXTENSION IF NOT EXISTS postgis;"; \
	else \
		docker compose -f docker-compose.dev.yml down -v; \
		docker compose -f docker-compose.dev.yml up -d postgres; \
	fi
	@echo "🔄 Database reset complete!"

# Wait for database to be ready (requires pg_isready)
wait-db:
	@echo "⏳ Waiting for database to be ready (port $(PG_PORT))..."
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do \
		if pg_isready -h localhost -p $(PG_PORT) >/dev/null 2>&1; then \
			echo "✅ Database is ready!"; \
			exit 0; \
		fi; \
		echo "  Attempt $$i/20 - waiting..."; \
		sleep 2; \
	done; \
	echo "❌ Database failed to become ready"; \
	exit 1

# Open a PostgreSQL shell
db-shell:
	@if [ "$(PG_MODE)" = "local" ]; then \
		psql -p 5433 -U timetiles_user -d timetiles; \
	else \
		docker exec -it timetiles-postgres psql -U timetiles_user -d timetiles; \
	fi

# Execute SQL query non-interactively
db-query:
	@if [ -z "$(SQL)" ]; then \
		echo "Usage: make db-query SQL='SELECT * FROM your_table' [DB_NAME=database_name]"; \
		echo "Example: make db-query SQL='SELECT COUNT(*) FROM events'"; \
		echo "Example: make db-query SQL='SELECT COUNT(*) FROM events' DB_NAME=timetiles_test"; \
		exit 1; \
	fi
	@if [ "$(PG_MODE)" = "local" ]; then \
		PGPASSWORD=timetiles_password psql -h localhost -p 5433 -U timetiles_user -d $(if $(DB_NAME),$(DB_NAME),timetiles) -c "$(SQL)"; \
	else \
		docker exec -e PGPASSWORD=timetiles_password timetiles-postgres psql -h localhost -U timetiles_user -d $(if $(DB_NAME),$(DB_NAME),timetiles) -c "$(SQL)"; \
	fi

# View PostgreSQL logs
db-logs:
	@if [ "$(PG_MODE)" = "local" ]; then \
		tail -f /tmp/pg.log; \
	else \
		docker compose -f docker-compose.dev.yml logs postgres -f --tail=100; \
	fi

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

# Clean up everything
clean:
	@if [ "$(PG_MODE)" = "local" ]; then \
		echo "🧹 Cleaning local database..."; \
		psql -p 5433 -d postgres -c "DROP DATABASE IF EXISTS timetiles;" 2>/dev/null || true; \
	else \
		docker compose -f docker-compose.dev.yml down -v --remove-orphans; \
		docker system prune -f; \
	fi

# Complete first-time development setup
# Runs comprehensive setup: env files, dependencies, Git LFS, Git config
setup:
	@./scripts/setup.sh

# Complete fresh start (clean slate)
fresh: clean
	@if [ "$(PG_MODE)" = "local" ]; then \
		echo "🐘 Creating local database..."; \
		psql -p 5433 -d postgres -c "CREATE DATABASE timetiles OWNER timetiles_user;"; \
		psql -p 5433 -d timetiles -c "CREATE SCHEMA IF NOT EXISTS payload;"; \
		psql -p 5433 -d timetiles -c "CREATE EXTENSION IF NOT EXISTS postgis;"; \
	else \
		$(MAKE) up; \
	fi
	@$(MAKE) wait-db
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

# Ensure infrastructure is running (respects PG_MODE from .env)
ensure-infra:
	@if pg_isready -h localhost -p $(PG_PORT) >/dev/null 2>&1; then \
		true; \
	elif [ "$(PG_MODE)" = "local" ]; then \
		echo "🐘 Starting local PostgreSQL (port 5433)..."; \
		LC_ALL=en_US.UTF-8 pg_ctl start -D /opt/homebrew/var/postgresql@17 -l /tmp/pg.log; \
		$(MAKE) wait-db; \
	else \
		echo "🐳 Starting Docker PostgreSQL (port 5432)..."; \
		$(MAKE) up && $(MAKE) wait-db; \
	fi

# Check development environment status
status:
	@./scripts/status.sh

# Run background job worker (alternative to autoRun for testing worker isolation)
jobs: ensure-infra
	@echo "🔄 Starting job worker..."
	cd apps/web && pnpm payload jobs:run --cron "* * * * *" --all-queues --handle-schedules

# Start development server (requires infrastructure)
# Only starts the web app; use `make timescrape-dev` or `pnpm dev` for all packages
dev: ensure-infra
	@echo "🚀 Starting development server..."
	exec pnpm --filter web dev

# Start Storybook component explorer for the UI package
storybook:
	pnpm --filter @timetiles/ui storybook

# Start scraper runner in dev mode (separate from main dev server)
timescrape-dev:
	@echo "🔧 Starting TimeScrape runner..."
	@if [ ! -f apps/timescrape/.env ]; then \
		echo "⚠️  No apps/timescrape/.env found. Copying from .env.example..."; \
		cp apps/timescrape/.env.example apps/timescrape/.env; \
		echo "⚠️  Please update SCRAPER_API_KEY in apps/timescrape/.env"; \
	fi
	pnpm --filter timescrape dev

# Build scraper base container images (requires Podman)
timescrape-images:
	@echo "🐳 Building scraper base images..."
	podman build -t timescrape-python apps/timescrape/images/python/
	podman build -t timescrape-node apps/timescrape/images/node/
	@echo "✅ Base images built: timescrape-python, timescrape-node"

# Run scraper tests
timescrape-test:
	pnpm --filter timescrape test

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

# Run linting (oxlint + ESLint)
# oxlint handles native rules (~3s), ESLint handles specialized plugins
lint:
	pnpm lint

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
		TEST_WORKERS="$(or $(WORKERS),)" \
		pnpm turbo run test:ai --filter=web --filter=timescrape; \
	else \
		TEST_WORKERS="$(or $(WORKERS),)" \
		bash -c 'cd apps/web && pnpm test:ai "$(FILTER)"'; \
	fi

# Run combined code quality checks with AI-friendly output (lint + typecheck)
# Usage:
#   make check-ai                                       # Check all packages
#   make check-ai PACKAGE=web                           # Check only apps/web
#   make check-ai PACKAGE=docs                          # Check only apps/docs
#   make check-ai FILES="lib/foo.ts components/bar.tsx" # Check specific files (defaults to web)
#   make check-ai PACKAGE=ui FILES="src/index.ts"       # Check files in specific package
# Verify no hardcoded theme colors leaked into components
check-theme:
	@./scripts/check-theme-abstraction.sh

# Check for CVA variants with duplicate values
check-cva:
	@./scripts/check-cva-variants.sh packages/ui/src

check-ai:
	@if [ -n "$(FILES)" ]; then \
		PKG=$${PACKAGE:-web}; \
		case "$$PKG" in \
			web) PKG_DIR="apps/web" ;; \
			docs) PKG_DIR="apps/docs" ;; \
			ui) PKG_DIR="packages/ui" ;; \
			timescrape|scraper) PKG_DIR="apps/timescrape" ;; \
			*) echo "❌ Unknown package: $$PKG"; exit 1 ;; \
		esac; \
		pnpm exec tsx scripts/check-ai-files.ts "$$PKG_DIR" $(FILES); \
	elif [ -z "$(PACKAGE)" ]; then \
		pnpm exec tsx scripts/check-ai.ts; \
	elif [ "$(PACKAGE)" = "web" ]; then \
		cd apps/web && pnpm check:ai; \
	elif [ "$(PACKAGE)" = "docs" ]; then \
		pnpm --filter docs lint && pnpm --filter docs typecheck; \
	elif [ "$(PACKAGE)" = "ui" ]; then \
		pnpm --filter ui lint && pnpm --filter ui typecheck; \
	elif [ "$(PACKAGE)" = "timescrape" ]; then \
		pnpm --filter timescrape lint && pnpm --filter timescrape typecheck; \
	else \
		echo "❌ Unknown package: $(PACKAGE)"; \
		echo "Available packages: web, docs, ui, timescrape"; \
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

# Load public demo datasets from Berlin Open Data (daten.berlin.de)
# Usage: make demo-data               # Create catalog + scheduled ingests
#        make demo-data ARGS="--trigger"  # Also trigger immediate import
#        make demo-data ARGS="--clean"    # Remove demo data
demo-data:
	@LOG_LEVEL=info pnpm --filter web demo-data $(ARGS)

# Set up a functional site (navigation, pages, branding, footer)
# Usage: make setup-site               # Create site configuration
#        make setup-site ARGS="--clean"  # Remove site configuration
setup-site:
	@LOG_LEVEL=info pnpm --filter web setup-site $(ARGS)

# Full Berlin demo: site setup + 10 public datasets from daten.berlin.de
demo-berlin: setup-site
	@$(MAKE) demo-data ARGS="--trigger"

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

# Download and view Playwright HTML report from latest failed CI run
# Usage: make test-e2e-debug [RUN_ID=<github-actions-run-id>]
test-e2e-debug:
	@rm -rf /tmp/playwright-ci-report
	@echo "📥 Downloading E2E report from CI..."
ifdef RUN_ID
	@gh run download $(RUN_ID) --name playwright-report --dir /tmp/playwright-ci-report 2>/dev/null || \
		(echo "❌ No playwright-report artifact found for run $(RUN_ID)" && exit 1)
else
	@RUN=$$(gh run list --workflow ci.yml --limit 10 --json databaseId,conclusion \
		--jq '[.[] | select(.conclusion=="failure")][0].databaseId') && \
		if [ -z "$$RUN" ] || [ "$$RUN" = "null" ]; then \
			echo "❌ No recent failed CI runs found"; exit 1; fi && \
		echo "  Using latest failed run: $$RUN" && \
		gh run download "$$RUN" --name playwright-report --dir /tmp/playwright-ci-report 2>/dev/null || \
		(echo "❌ No playwright-report artifact found" && exit 1)
endif
	@echo "🔍 Opening Playwright report in browser..."
	@pnpm --filter web exec playwright show-report /tmp/playwright-ci-report

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
# Docker Images
# =============================================================================

# Configuration (override via environment or command line)
IMAGE_REGISTRY ?= ghcr.io/jfilter/timetiles
IMAGE_TAG ?= edge
IMAGE_PLATFORMS ?= linux/amd64,linux/arm64
IMAGE ?= both
PUSH ?= true

# Load GHCR_TOKEN from .env if present
-include .env
export GHCR_TOKEN

## Build and push Docker images to GHCR
## Usage: make images [IMAGE=main|allinone|both] [IMAGE_TAG=edge] [PUSH=true|false]
##        make images IMAGE_PLATFORMS=linux/arm64 IMAGE_TAG=1.2.0
##        make images PUSH=false  # local build only
images:
	@# Ensure buildx builder exists
	@docker buildx inspect multiplatform >/dev/null 2>&1 || \
		docker buildx create --name multiplatform --use
	@docker buildx use multiplatform
	@# Login to GHCR if pushing
	@if [ "$(PUSH)" = "true" ]; then \
		if [ -z "$(GHCR_TOKEN)" ]; then \
			echo "❌ GHCR_TOKEN not set. Add it to .env or export it."; \
			echo "   Create a PAT with write:packages at:"; \
			echo "   https://github.com/settings/tokens/new?scopes=write:packages"; \
			exit 1; \
		fi; \
		echo "$(GHCR_TOKEN)" | docker login ghcr.io -u $(shell gh api user -q .login 2>/dev/null || echo jfilter) --password-stdin; \
	fi
	@# Build main image
	@if [ "$(IMAGE)" = "main" ] || [ "$(IMAGE)" = "both" ]; then \
		echo "📦 Building main image ($(IMAGE_PLATFORMS))..."; \
		docker buildx build \
			--platform $(IMAGE_PLATFORMS) \
			-f deployment/Dockerfile.prod \
			-t $(IMAGE_REGISTRY):$(IMAGE_TAG) \
			$(if $(filter true,$(PUSH)),--push,--load) .; \
	fi
	@# Build all-in-one image
	@if [ "$(IMAGE)" = "allinone" ] || [ "$(IMAGE)" = "both" ]; then \
		echo "📦 Building all-in-one image ($(IMAGE_PLATFORMS))..."; \
		docker buildx build \
			--platform $(IMAGE_PLATFORMS) \
			-f deployment/Dockerfile.allinone \
			-t $(IMAGE_REGISTRY):$(IMAGE_TAG)-allinone \
			$(if $(filter true,$(PUSH)),--push,--load) .; \
	fi
	@echo "✅ Done!"

# =============================================================================
# Worktrees
# =============================================================================

## Create a new worktree with env files and dependencies
## Usage: make worktree NAME=my-feature [BRANCH=branch-name]
worktree:
	@if [ -z "$(NAME)" ]; then \
		echo "Usage: make worktree NAME=my-feature [BRANCH=branch-name]"; \
		echo ""; \
		echo "Creates a worktree in .worktrees/<NAME> with env files + deps."; \
		echo "Creates branch <NAME> from main (or BRANCH if given)."; \
		exit 1; \
	fi
	@./scripts/worktree.sh create "$(NAME)" "$(BRANCH)"

## Remove a worktree
## Usage: make worktree-rm NAME=my-feature
worktree-rm:
	@if [ -z "$(NAME)" ]; then \
		echo "Usage: make worktree-rm NAME=my-feature"; \
		exit 1; \
	fi
	@./scripts/worktree.sh remove "$(NAME)"

## List all worktrees and their status
worktree-ls:
	@./scripts/worktree.sh list

## Set up env/deps in an existing worktree
## Usage: make worktree-setup PATH=.worktrees/my-feature
worktree-setup:
	@if [ -z "$(PATH_ARG)" ]; then \
		echo "Usage: make worktree-setup PATH_ARG=.worktrees/my-feature"; \
		exit 1; \
	fi
	@./scripts/worktree.sh setup "$(PATH_ARG)"

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
		'  storybook   - Start Storybook UI component explorer (port 6006)' \
		'  status      - Check development environment health' \
		'  kill-dev    - Stop all development servers and processes' \
		'  reset       - Reset database (wipe db + migrate + seed)' \
		'  build       - Build the project' '' \
		'🔍 Code Quality:' \
		'  lint        - Run linting (oxlint + ESLint)' \
		'  typecheck   - Run tsgo (fast, ~15s for dev)' \
		'  typecheck-full - Run tsc (thorough, for CI)' \
		'  check       - Run lint + typecheck' \
		'  check-ai    - Run code quality checks with AI-friendly output' \
		'                Usage: make check-ai [PACKAGE=web|docs|ui|scraper] [FILES="..."]' \
		'  check-cva   - Check for duplicate/empty CVA variant values' \
		'  format      - Format code with oxfmt' '' \
		'🧪 Testing:' \
		'  test        - Run tests (standard output)' \
		'  test-ai     - Run tests with AI-friendly output (web app only)' \
		'                Usage: make test-ai [FILTER=pattern]' \
		'                Full runs use Turbo caching, filtered runs bypass cache' \
		'                Examples:' \
		'                  make test-ai                    # All tests (Turbo cached)' \
		'                  make test-ai FILTER=date.test   # Pattern match (fastest)' \
		'                  make test-ai FILTER=tests/unit  # Directory' \
		'  test-e2e       - Run E2E tests with automatic database setup' \
		'  test-e2e-debug - Download and view CI E2E failure traces/screenshots' \
		'                   Usage: make test-e2e-debug [RUN_ID=<run-id>]' \
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
		'🌿 Worktrees:' \
		'  worktree       - Create worktree with env files + deps' \
		'                   Usage: make worktree NAME=my-feature [BRANCH=branch]' \
		'  worktree-rm    - Remove a worktree' \
		'                   Usage: make worktree-rm NAME=my-feature' \
		'  worktree-ls    - List all worktrees and their status' \
		'  worktree-setup - Set up env/deps in existing worktree' \
		'                   Usage: make worktree-setup PATH_ARG=.worktrees/foo' '' \
		'📦 Docker Images:' \
		'  images         - Build and push Docker images to GHCR' \
		'                   Usage: make images [IMAGE=main|allinone|both]' \
		'                   Options: IMAGE_TAG=edge, PUSH=true|false' \
		'                   Platforms: IMAGE_PLATFORMS=linux/amd64,linux/arm64' '' \
		'🐳 Infrastructure:' \
		'  up          - Start development environment (docker compose)' \
		'  down        - Stop development environment' \
		'  logs        - View all container logs' \
		'  clean       - Clean up everything (containers, volumes, networks)' '' \
		'📖 Parameters:' \
		'  FILTER=pattern   - Filter tests by pattern (use with test-ai)' \
		'                     Examples: FILTER=date.test, FILTER=tests/unit' \
		'  PACKAGE=name     - Target specific package (use with check-ai)' \
		'                     Options: web, docs, ui, scraper' \
		'  FILES="..."      - Check specific files only (use with check-ai)' \
		'                     Paths relative to package dir, defaults to PACKAGE=web' \
		'                     Example: FILES="lib/foo.ts components/bar.tsx"' \
		'  SQL=query        - SQL query to execute (use with db-query)' \
		'                     Example: SQL='"'"'SELECT COUNT(*) FROM events'"'"'' \
		'  DB_NAME=name     - Database name (use with db-query)' \
		'                     Default: timetiles' \
		'  ARGS=args        - Arguments for command (use with seed)' \
		'                     Example: ARGS='"'"'development users catalogs'"'"'' '' \
		'🐘 Database Mode (PG_MODE in .env):' \
		'  docker (default) - Uses Docker PostgreSQL on port 5432' \
		'  local            - Uses Homebrew PostgreSQL on port 5433' '' \
		'💡 Quick Start:' \
		'  make selftest   # Validate environment readiness' \
		'  make init       # Complete initialization + start dev' \
		'  make status     # Check running services' '' \
		'ℹ️  This Makefile is for LOCAL DEVELOPMENT AND TESTING ONLY'
