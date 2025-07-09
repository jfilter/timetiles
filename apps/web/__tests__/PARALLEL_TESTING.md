# Test Isolation Guide for Parallel Execution

This guide explains how to properly isolate tests to enable parallel execution in your test suite.

## Overview

The main issues preventing parallel test execution were:

1. **Shared Database State**: Tests using the same database
2. **Global Resources**: Shared services and connections
3. **File System Conflicts**: Tests creating files with conflicting names
4. **Improper Configuration**: Vitest not configured for parallel execution

## Solutions Implemented

### 1. Updated Vitest Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false, // Enable parallel forks
        isolate: true, // Isolate each test file
      },
    },
    fileParallelism: true, // Enable parallel file execution
    maxWorkers: 4, // Limit concurrent workers
    sequence: {
      concurrent: true, // Allow concurrent test execution
    },
    testTimeout: 30000, // Increased timeout for database operations
  },
});
```

### 2. Test Environment Isolation

Each test file now gets:

- **Isolated Database**: `timetiles_test_${workerId}_${testId}`
- **Isolated Temp Directory**: `/tmp/timetiles-test-${workerId}-${testId}`
- **Isolated Services**: Rate limiting, caching, etc.

### 3. Helper Functions

#### `createIsolatedTestEnvironment()`

Creates a completely isolated test environment:

```typescript
import { createIsolatedTestEnvironment } from "./test-helpers";

describe("My Test Suite", () => {
  let testEnv: Awaited<ReturnType<typeof createIsolatedTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await createIsolatedTestEnvironment();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    // Clean up before each test - this is now isolated per test file
    await testEnv.seedManager.truncate();
  });

  it("should work in isolation", async () => {
    // Use testEnv.payload, testEnv.seedManager, testEnv.tempDir
  });
});
```

## Migration Guide

### Step 1: Update Existing Tests

Replace the old pattern:

```typescript
// OLD - Shared resources
describe("My Test", () => {
  let seedManager: SeedManager;
  let payload: any;

  beforeAll(async () => {
    seedManager = createSeedManager();
    payload = await seedManager.initialize();
  });

  afterAll(async () => {
    await seedManager.cleanup();
  });
});
```

With the new pattern:

```typescript
// NEW - Isolated environment
describe("My Test", () => {
  let testEnv: Awaited<ReturnType<typeof createIsolatedTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await createIsolatedTestEnvironment();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate();
  });
});
```

### Step 2: Update File Operations

For file operations, use the isolated temp directory:

```typescript
it("should create test files", async () => {
  const fs = await import("fs");
  const path = await import("path");

  const testFile = path.join(testEnv.tempDir, "test.csv");
  await fs.promises.writeFile(testFile, "data");

  // File is automatically cleaned up
});
```

### Step 3: Update Database Operations

Use the isolated payload instance:

```typescript
it("should create records", async () => {
  const record = await testEnv.payload.create({
    collection: "catalogs",
    data: { name: "Test Catalog" },
  });

  expect(record.id).toBeDefined();
});
```

## Best Practices

### 1. Test Isolation

- Each test file should be completely independent
- Use `beforeEach` to clean up state, not `beforeAll`
- Don't share state between test files

### 2. Resource Management

- Always use `testEnv.cleanup()` in `afterAll`
- Use isolated temp directories for file operations
- Don't hardcode file paths or database names

### 3. Error Handling

- Handle cleanup errors gracefully
- Use timeouts appropriate for database operations
- Log warnings for non-critical cleanup failures

### 4. Performance

- Limit `maxWorkers` to prevent resource exhaustion
- Use appropriate test timeouts
- Consider test file organization for better parallelization

## Running Tests

```bash
# Run tests in parallel (default)
pnpm test

# Run tests sequentially (debugging)
pnpm test:sequential

# Run with verbose output
pnpm test:parallel

# Watch mode (automatically isolates)
pnpm test:watch
```

## Debugging

### Check Database Isolation

```sql
-- List all test databases
SELECT datname FROM pg_database WHERE datname LIKE 'timetiles_test_%';
```

### Check File Isolation

```bash
# Check temp directories
ls -la /tmp/timetiles-test-*
```

### Enable Debug Logging

```typescript
// In test files
console.log("Database:", process.env.DATABASE_URL);
console.log("Temp Dir:", testEnv.tempDir);
```

## Common Issues

### 1. Database Connection Errors

If you see connection errors, check:

- PostgreSQL is running
- Database credentials are correct
- Too many concurrent connections (reduce `maxWorkers`)

### 2. File System Conflicts

If you see file conflicts:

- Use `testEnv.tempDir` for all file operations
- Use unique file names with `createTestId()`
- Don't use global temp directories

### 3. Test Timeouts

If tests timeout:

- Increase `testTimeout` in vitest config
- Check for hanging database connections
- Verify cleanup is working properly

## Migration Checklist

- [ ] Update vitest.config.ts with parallel configuration
- [ ] Update test setup files to use isolation helpers
- [ ] Replace shared SeedManager with isolated environments
- [ ] Update file operations to use isolated temp directories
- [ ] Add proper cleanup in afterAll hooks
- [ ] Test both parallel and sequential execution
- [ ] Verify database isolation is working
- [ ] Check for any remaining shared resources

## Examples

See the following files for complete examples:

- `__tests__/seed-isolated.test.ts` - Isolated seed system tests
- `__tests__/isolated-seed-example.test.ts` - Simple example
- `__tests__/test-helpers.ts` - Helper functions
- `__tests__/database-setup.ts` - Database isolation utilities
