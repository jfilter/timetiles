# Web App Makefile - Proxies commands to root Makefile
# Run make commands from apps/web/ directory

# Path to root Makefile
ROOT := ../..

.PHONY: all selftest status up down logs db-reset db-shell db-query db-logs clean setup seed init ensure-infra dev kill-dev fresh reset build lint typecheck format test test-ai test-e2e test-coverage coverage coverage-check migrate migrate-create check check-ai help

# Default target
all: help

# Proxy all commands to root Makefile
selftest:
	@$(MAKE) -C $(ROOT) selftest

status:
	@$(MAKE) -C $(ROOT) status

up:
	@$(MAKE) -C $(ROOT) up

down:
	@$(MAKE) -C $(ROOT) down

logs:
	@$(MAKE) -C $(ROOT) logs

db-reset:
	@$(MAKE) -C $(ROOT) db-reset

db-shell:
	@$(MAKE) -C $(ROOT) db-shell

db-query:
	@$(MAKE) -C $(ROOT) db-query SQL='$(SQL)' $(if $(DB_NAME),DB_NAME=$(DB_NAME))

db-logs:
	@$(MAKE) -C $(ROOT) db-logs

clean:
	@$(MAKE) -C $(ROOT) clean

setup:
	@$(MAKE) -C $(ROOT) setup

seed:
	@$(MAKE) -C $(ROOT) seed $(if $(ARGS),ARGS='$(ARGS)')

init:
	@$(MAKE) -C $(ROOT) init

ensure-infra:
	@$(MAKE) -C $(ROOT) ensure-infra

dev:
	@$(MAKE) -C $(ROOT) dev

kill-dev:
	@$(MAKE) -C $(ROOT) kill-dev

fresh:
	@$(MAKE) -C $(ROOT) fresh

reset:
	@$(MAKE) -C $(ROOT) reset

build:
	@$(MAKE) -C $(ROOT) build

lint:
	@$(MAKE) -C $(ROOT) lint

typecheck:
	@$(MAKE) -C $(ROOT) typecheck

format:
	@$(MAKE) -C $(ROOT) format

test:
	@$(MAKE) -C $(ROOT) test

test-ai:
	@$(MAKE) -C $(ROOT) test-ai $(if $(FILTER),FILTER='$(FILTER)')

test-e2e:
	@$(MAKE) -C $(ROOT) test-e2e

test-coverage:
	@$(MAKE) -C $(ROOT) test-coverage

coverage:
	@$(MAKE) -C $(ROOT) coverage

coverage-check:
	@$(MAKE) -C $(ROOT) coverage-check

migrate:
	@$(MAKE) -C $(ROOT) migrate

migrate-create:
	@$(MAKE) -C $(ROOT) migrate-create

check:
	@$(MAKE) -C $(ROOT) check

check-ai:
	@$(MAKE) -C $(ROOT) check-ai $(if $(PACKAGE),PACKAGE=$(PACKAGE))

help:
	@echo "📋 Web App Makefile (proxies to root Makefile)"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo ""
	@echo "Run any root Makefile command from apps/web/ directory:"
	@echo ""
	@echo "  make dev              - Start development server"
	@echo "  make test-ai          - Run tests with AI-friendly output"
	@echo "  make check-ai         - Run code quality checks"
	@echo "  make reset            - Reset database + migrate + seed"
	@echo "  make db-shell         - Open PostgreSQL shell"
	@echo "  make help             - Show this help"
	@echo ""
	@echo "For full command list, run: make -C $(ROOT) help"
	@echo ""
