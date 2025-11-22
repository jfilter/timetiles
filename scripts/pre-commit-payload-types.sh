#!/usr/bin/env bash
# Pre-commit hook script to regenerate Payload types when migrations or collections change

set -e

# Get the list of staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

# Check if any staged files are migrations or collection schemas
MIGRATIONS_CHANGED=$(echo "$STAGED_FILES" | grep -c "^apps/web/migrations/" || true)
COLLECTIONS_CHANGED=$(echo "$STAGED_FILES" | grep -c "^apps/web/lib/collections/" || true)

# If migrations or collections changed, regenerate types
if [ "$MIGRATIONS_CHANGED" -gt 0 ] || [ "$COLLECTIONS_CHANGED" -gt 0 ]; then
  echo "🔄 Detected changes to migrations or collections, regenerating Payload types..."

  # Change to web app directory and generate types
  cd apps/web
  pnpm payload generate:types --silent
  cd ../..

  # Stage the regenerated types file
  git add apps/web/payload-types.ts

  echo "✅ Payload types regenerated and staged"
fi
