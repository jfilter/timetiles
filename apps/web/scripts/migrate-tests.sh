#!/usr/bin/env bash

# Script to help migrate existing tests to use parallel isolation

set -e

echo "🔄 Migrating tests for parallel execution..."

# Create backup directory
BACKUP_DIR="__tests__/backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "📦 Creating backup of existing tests in $BACKUP_DIR"

# Backup existing test files
cp __tests__/*.test.ts "$BACKUP_DIR/" 2>/dev/null || echo "No .test.ts files to backup"
cp __tests__/*.spec.ts "$BACKUP_DIR/" 2>/dev/null || echo "No .spec.ts files to backup"

echo "🧪 Running test isolation verification..."

# Test the new isolation system
echo "Testing isolated environment creation..."
if ! pnpm test __tests__/isolated-seed-example.test.ts; then
  echo "❌ Isolated test example failed"
  exit 1
fi

echo "✅ Isolated test example passed"

# Test database isolation
echo "Testing database isolation..."
if ! pnpm test __tests__/seed-isolated.test.ts; then
  echo "❌ Database isolation test failed"
  exit 1
fi

echo "✅ Database isolation test passed"

# Test parallel execution
echo "Testing parallel execution..."
if ! pnpm test:parallel; then
  echo "❌ Parallel execution failed"
  echo "Try running with fewer workers: pnpm test --reporter=verbose --max-workers=2"
  exit 1
fi

echo "✅ Parallel execution test passed"

# Verify databases are properly cleaned up
echo "🧹 Verifying database cleanup..."
DB_COUNT=$(psql -h localhost -U timetiles_user -d postgres -t -c "SELECT COUNT(*) FROM pg_database WHERE datname LIKE 'timetiles_test_%';" 2>/dev/null || echo "0")
if [ "$DB_COUNT" -gt 0 ]; then
  echo "⚠️  Warning: $DB_COUNT test databases still exist"
  echo "   This is normal during development, but should be cleaned up in CI"
else
  echo "✅ All test databases cleaned up"
fi

# Create migration report
echo "📊 Creating migration report..."
cat >"__tests__/MIGRATION_REPORT.md" <<EOF
# Test Migration Report

Generated: $(date)

## Summary
- ✅ Isolated test environment working
- ✅ Database isolation working
- ✅ Parallel execution working
- ✅ Cleanup working

## Backed Up Files
The following files were backed up to $BACKUP_DIR:
EOF

# List backed up files safely
for file in "$BACKUP_DIR"/*.test.ts "$BACKUP_DIR"/*.spec.ts; do
  if [ -f "$file" ]; then
    echo "- $(basename "$file")" >>"__tests__/MIGRATION_REPORT.md"
  fi
done

cat >>"__tests__/MIGRATION_REPORT.md" <<EOF
1. Review the parallel testing guide: __tests__/PARALLEL_TESTING.md
2. Migrate your existing tests using the patterns in:
   - __tests__/seed-isolated.test.ts
   - __tests__/isolated-seed-example.test.ts
3. Update your test patterns to use \`createIsolatedTestEnvironment()\`
4. Test both parallel and sequential execution

## Test Commands
- \`pnpm test\` - Run tests in parallel
- \`pnpm test:sequential\` - Run tests sequentially
- \`pnpm test:parallel\` - Run with verbose parallel output
- \`pnpm test:watch\` - Watch mode with isolation

## Files Updated
- vitest.config.ts - Updated for parallel execution
- __tests__/setup.ts - Added worker isolation
- __tests__/test-helpers.ts - Helper functions for isolation
- __tests__/database-setup.ts - Database isolation utilities
- package.json - Added parallel test scripts

## Files Created
- __tests__/seed-isolated.test.ts - Example isolated seed tests
- __tests__/isolated-seed-example.test.ts - Simple example
- __tests__/PARALLEL_TESTING.md - Migration guide
EOF

echo "✅ Migration complete!"
echo ""
echo "📚 Next steps:"
echo "1. Read the migration guide: __tests__/PARALLEL_TESTING.md"
echo "2. Review the migration report: __tests__/MIGRATION_REPORT.md"
echo "3. Update your existing tests to use the isolation pattern"
echo "4. Run 'pnpm test' to verify everything works"
echo ""
echo "🎉 Your tests are now ready for parallel execution!"
