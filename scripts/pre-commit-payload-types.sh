#!/usr/bin/env bash
# Pre-commit hook script to regenerate Payload types when Payload config changes

set -e

# Get the list of staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

# Check if any staged files affect Payload configuration
# - migrations: Database schema changes
# - lib/collections: Collection schema definitions
# - lib/config: Payload configuration (jobs, globals, etc.)
# - payload.config.ts: Root Payload configuration
MIGRATIONS_CHANGED=$(echo "$STAGED_FILES" | grep -c "^apps/web/migrations/" || true)
COLLECTIONS_CHANGED=$(echo "$STAGED_FILES" | grep -c "^apps/web/lib/collections/" || true)
CONFIG_CHANGED=$(echo "$STAGED_FILES" | grep -c "^apps/web/lib/config/" || true)
PAYLOAD_CONFIG_CHANGED=$(echo "$STAGED_FILES" | grep -c "^apps/web/payload.config.ts" || true)

# If any Payload config changed, regenerate types
TOTAL_CHANGES=$((MIGRATIONS_CHANGED + COLLECTIONS_CHANGED + CONFIG_CHANGED + PAYLOAD_CONFIG_CHANGED))

if [ "$TOTAL_CHANGES" -gt 0 ]; then
  echo "🔄 Detected Payload configuration changes, regenerating types..."

  # Change to web app directory and generate types
  cd apps/web
  pnpm payload generate:types --silent
  cd ../..

  # Stage the regenerated types file
  git add apps/web/payload-types.ts

  echo "✅ Payload types regenerated and staged"
fi
