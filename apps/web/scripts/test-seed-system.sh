#!/usr/bin/env bash

# Integration test script for seed system
# This script tests the complete seed system functionality with Turborepo

set -e

echo "🧪 Starting Seed System Integration Tests (Turborepo)"

# Change to project root directory
cd "$(dirname "$0")/../../.."

# Check if we're in the right directory
if [ ! -f "Makefile" ] || [ ! -f "turbo.json" ]; then
  echo "❌ Please run this script from the project root directory"
  exit 1
fi

# Start PostgreSQL if not running (skip in CI)
echo "🐳 Checking Docker infrastructure..."
if [ "$CI" = "true" ]; then
  echo "🏗️  Running in CI environment, skipping Docker startup..."
elif ! docker compose -f docker-compose.dev.yml ps --services --filter status=running | grep -q postgres; then
  echo "🚀 Starting PostgreSQL infrastructure..."
  make up
  echo "⏳ Waiting for PostgreSQL to be ready..."
  sleep 10
fi

# Run migrations (skip in CI as they're already run)
if [ "$CI" = "true" ]; then
  echo "🏗️  Running in CI environment, skipping migrations (already run)..."
else
  echo "🔄 Running database migrations..."
  cd apps/web
  pnpm run payload:migrate
  cd ../..
fi

# Clean up database before starting tests
echo "🧹 Cleaning up database before tests..."
cd apps/web
pnpm run seed truncate
cd ../..

# Check if database is available
echo "📋 Checking database connection..."
if ! pnpm turbo run --filter=web seed -- --help >/dev/null 2>&1; then
  echo "❌ Seed system not available"
  exit 1
fi

# Test 1: Seed data validation
echo "🔍 Test 1: Validating seed data structure..."
cd apps/web
pnpm run seed:validate
cd ../..

# Test 2: Full seed operation using Turborepo
echo "🌱 Test 2: Testing full seed operation with Turborepo..."
pnpm turbo run seed:test

# Test 3: Verify seeded data
echo "🔍 Test 3: Verifying seeded data..."
cd apps/web
npx tsx scripts/verify-seeded-data.ts
cd ../..

# Test 4: Truncate operation using direct command
echo "🗑️ Test 4: Testing truncate operation..."
cd apps/web
pnpm run seed truncate users
cd ../..

# Test 5: Verify truncation
echo "🔍 Test 5: Verifying truncation..."
cd apps/web
npx tsx scripts/verify-truncation.ts
cd ../..

# Test 6: Specific collection seeding using direct command
echo "🌱 Test 6: Testing specific collection seeding..."
cd apps/web
# Clear database first to avoid unique constraint conflicts
pnpm run seed truncate
pnpm run seed test users catalogs
cd ../..

# Test 7: Error handling (seeding datasets without catalogs)
echo "🚨 Test 7: Testing error handling..."
cd apps/web
# Clear all data first to ensure catalogs are not present
pnpm run seed truncate
if pnpm run seed test datasets 2>/dev/null; then
  echo "❌ Should have failed when seeding datasets without catalogs"
  exit 1
else
  echo "✅ Correctly failed when seeding datasets without catalogs"
fi
cd ../..

# Test 8: Full cleanup using Turborepo
echo "🧹 Test 8: Testing full cleanup with Turborepo..."
pnpm turbo run seed:truncate

# Test 9: Verify full cleanup
echo "🔍 Test 9: Verifying full cleanup..."
cd apps/web
npx tsx scripts/verify-cleanup.ts
cd ../..

echo "🎉 All integration tests passed!"
echo ""
echo "📊 Test Summary:"
echo "  ✅ Database connection"
echo "  ✅ Seed data validation"
echo "  ✅ Full seed operation (Turborepo)"
echo "  ✅ Data verification"
echo "  ✅ Truncate operation (Turborepo)"
echo "  ✅ Truncation verification"
echo "  ✅ Specific collection seeding (Turborepo)"
echo "  ✅ Error handling"
echo "  ✅ Full cleanup (Turborepo)"
echo "  ✅ Cleanup verification"
echo ""
echo "🚀 Seed system is ready for production use with Turborepo!"

# Test 9: Verify full cleanup
echo "🔍 Test 9: Verifying full cleanup..."
cd apps/web
npx tsx scripts/verify-cleanup.ts
cd ../..

echo "🎉 All integration tests passed!"
echo ""
echo "📊 Test Summary:"
echo "  ✅ Database connection"
echo "  ✅ Seed data validation"
echo "  ✅ Full seed operation (Turborepo)"
echo "  ✅ Data verification"
echo "  ✅ Truncate operation (Turborepo)"
echo "  ✅ Truncation verification"
echo "  ✅ Specific collection seeding (Turborepo)"
echo "  ✅ Error handling"
echo "  ✅ Full cleanup (Turborepo)"
echo "  ✅ Cleanup verification"
echo ""
echo "🚀 Seed system is ready for production use with Turborepo!"
