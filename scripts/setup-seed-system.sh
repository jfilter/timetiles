#!/usr/bin/env bash

# Development setup script for seed system
# This script integrates with your existing Docker + Make + Turborepo setup

set -e

echo "🌱 Setting up seed system for development..."

# Check if we're in the right directory
if [ ! -f "Makefile" ] || [ ! -f "turbo.json" ]; then
  echo "❌ Please run this script from the project root directory"
  exit 1
fi

# Start infrastructure if not already running
echo "🐳 Checking Docker infrastructure..."
if ! docker compose -f docker-compose.dev.yml ps --services --filter status=running | grep -q postgres; then
  echo "🚀 Starting PostgreSQL infrastructure..."
  make up
  echo "⏳ Waiting for PostgreSQL to be ready..."
  sleep 10
else
  echo "✅ PostgreSQL is already running"
fi

# Run database migrations
echo "🔄 Running database migrations..."
cd apps/web
pnpm run payload:migrate

# Seed development data
echo "🌱 Seeding development data..."
pnpm run seed:dev

# Verify the setup
echo "🔍 Verifying seed setup..."
npx tsx -e "
import { createSeedManager } from './lib/seed/index.js';

async function verify() {
  const seedManager = createSeedManager();
  const payload = await seedManager.initialize();

  const collections = ['users', 'catalogs', 'datasets', 'events', 'imports'];

  for (const collection of collections) {
    const result = await payload.find({ collection, limit: 1 });
    console.log(\`✅ \${collection}: \${result.docs.length} items\`);
  }

  await seedManager.cleanup();
}

verify().catch(err => {
  console.error('❌ Verification failed:', err.message);
  process.exit(1);
});
"

cd ..

echo ""
echo "🎉 Seed system setup complete!"
echo ""
echo "📋 Available commands:"
echo "  make seed            - Seed development data"
echo "  make seed-test       - Seed test data"
echo "  make seed-truncate   - Truncate all data"
echo "  make seed-integration - Run integration tests"
echo ""
echo "🚀 You can now start development with: make dev"
