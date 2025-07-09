# Seed and Fixture Data System

This document describes the comprehensive seed and fixture data system for the Timetiles application. The system provides a robust, configurable solution for populating the database with test and sample data for development, testing, and automated CI environments.

## Overview

The seed system consists of:

- **Seed Manager**: Core functionality for seeding and truncating data
- **Seed Data Files**: Configurable data generators for different environments
- **CLI Scripts**: Command-line interface for easy usage
- **Automated Tests**: Comprehensive test suite for validation
- **GitHub Actions**: CI integration for automated testing

## Quick Start

### Basic Usage

```bash
# Seed all collections for development environment
pnpm run seed

# Seed specific environment
pnpm run seed:dev    # development environment
pnpm run seed:test   # test environment

# Seed specific collections
pnpm run seed development users catalogs

# Truncate all data
pnpm run seed:truncate

# Truncate specific collections
pnpm run seed:truncate users catalogs
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run seed validation tests
npx tsx __tests__/seed-validation.ts

# Run tests with coverage
pnpm run test:coverage
```

## Architecture

### Core Components

#### SeedManager (`lib/seed/index.ts`)

The main class that handles all seeding operations:

```typescript
import { createSeedManager } from "./lib/seed/index";

const seedManager = createSeedManager();

// Seed data
await seedManager.seed({
  environment: "development",
  collections: ["users", "catalogs"],
  truncate: false,
});

// Truncate data
await seedManager.truncate(["users"]);

// Cleanup
await seedManager.cleanup();
```

#### Seed Data Files (`lib/seed/seeds/`)

Each collection has its own seed data file:

- `users.ts` - User accounts and authentication data
- `catalogs.ts` - Data catalogs and classifications
- `datasets.ts` - Dataset definitions and schemas
- `events.ts` - Event data and measurements
- `imports.ts` - Import history and metadata

### Data Relationships

The system automatically resolves relationships between collections:

```
Users (independent)
  ↓
Catalogs (independent)
  ↓
Datasets (requires catalogs)
  ↓
Events (requires datasets)
  ↓
Imports (requires catalogs)
```

## Environment-Specific Data

### Development Environment

Includes comprehensive sample data for local development:

- Multiple user accounts with different roles
- Rich catalog data with descriptions
- Sample datasets with realistic schemas
- Event data with geographic locations
- Import history with various statuses

### Test Environment

Minimal, predictable data for automated testing:

- Basic user accounts (admin, analyst, test user)
- Simple test catalog and dataset
- Controlled event data for validation
- Known import scenarios (success and failure)

### Production Environment

Minimal essential data for production bootstrapping:

- Admin and analyst accounts only
- Basic catalog structure
- Essential dataset definitions

## CLI Interface

### Seed Command

```bash
# General format
pnpm run seed [environment] [collections...]

# Examples
pnpm run seed                        # dev environment, all collections
pnpm run seed test                   # test environment, all collections
pnpm run seed development users      # dev environment, users only
pnpm run seed test users catalogs    # test environment, specific collections
```

### Truncate Command

```bash
# General format
pnpm run seed:truncate [collections...]

# Examples
pnpm run seed:truncate              # truncate all collections
pnpm run seed:truncate users        # truncate users only
pnpm run seed:truncate users catalogs  # truncate specific collections
```

## Configuration

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
PAYLOAD_SECRET=your-secret-key

# Optional
NODE_ENV=development|test|production
```

### Seed Options

```typescript
interface SeedOptions {
  collections?: string[]; // Collections to seed
  truncate?: boolean; // Truncate before seeding
  environment?: "development" | "test" | "production";
}
```

## Testing

### Test Structure

```
__tests__/
├── setup.ts              # Test environment setup
├── seed-validation.ts     # Seed data validation tests
├── seed.test.ts          # Full integration tests (Vitest)
└── vitest.d.ts           # Type definitions
```

### Test Categories

1. **Data Validation Tests** - Verify seed data structure and consistency
2. **Seeding Operation Tests** - Test actual database operations
3. **Relationship Tests** - Verify foreign key relationships
4. **Error Handling Tests** - Test failure scenarios
5. **Truncation Tests** - Verify cleanup operations

### Running Tests Locally

```bash
# All tests
pnpm test

# Watch mode
pnpm run test:watch

# With coverage
pnpm run test:coverage

# Seed validation only
npx tsx __tests__/seed-validation.ts
```

## GitHub Actions Integration

### Workflow: `.github/workflows/seed-tests.yml`

The CI pipeline includes:

1. **Database Setup** - PostgreSQL with PostGIS extensions
2. **Dependency Installation** - Node.js and pnpm setup
3. **Migration Execution** - Payload CMS schema setup
4. **Seed Validation** - Data structure validation
5. **Seed Operations** - Full seeding and truncation tests
6. **Data Integrity** - Verification of seeded data

### CI Environment

```yaml
services:
  postgres:
    image: postgis/postgis:15-3.3
    env:
      POSTGRES_DB: timetiles_test
      POSTGRES_USER: timetiles_user
      POSTGRES_PASSWORD: timetiles_password
```

## Extending the System

### Adding New Collections

1. **Create Seed Data File**:

   ```typescript
   // lib/seed/seeds/mycollection.ts
   export function myCollectionSeeds(environment: string): MyCollectionSeed[] {
     // Return seed data based on environment
   }
   ```

2. **Update Seed Manager**:

   ```typescript
   // Add to getSeedData() method
   case 'mycollection':
     return myCollectionSeeds(environment)
   ```

3. **Update Dependency Order**:
   ```typescript
   // Update seedOrder and truncateOrder arrays
   const seedOrder = ["users", "catalogs", "mycollection", "..."];
   ```

### Adding New Environments

1. **Update Environment Type**:

   ```typescript
   environment?: 'development' | 'test' | 'production' | 'mynewenv'
   ```

2. **Add Environment-Specific Data**:
   ```typescript
   if (environment === "mynewenv") {
     return [
       /* specific data */
     ];
   }
   ```

### Custom Seed Data

You can create custom seed data by:

1. Creating a new seed file in `lib/seed/seeds/`
2. Implementing the appropriate interface
3. Adding environment-specific logic
4. Updating the seed manager

## Best Practices

### Data Design

- **Deterministic**: Same seed run should produce identical results
- **Minimal**: Only include necessary data for the environment
- **Realistic**: Use realistic data formats and values
- **Relationships**: Ensure proper foreign key references

### Testing

- **Isolation**: Each test should be independent
- **Cleanup**: Always truncate before tests
- **Validation**: Verify both data structure and relationships
- **Coverage**: Test both success and failure scenarios

### Performance

- **Batch Operations**: Seed multiple items efficiently
- **Relationship Resolution**: Cache lookup results when possible
- **Truncation Order**: Respect foreign key constraints
- **Connection Management**: Properly initialize and cleanup connections

## Troubleshooting

### Common Issues

1. **Relationship Errors**: Ensure parent collections are seeded first
2. **Database Connection**: Verify DATABASE_URL and database is running
3. **Migration Issues**: Run `pnpm run payload:migrate` first
4. **Permission Errors**: Check database user permissions
5. **Type Errors**: Ensure TypeScript types match Payload schemas

### Debug Mode

Enable verbose logging:

```bash
NODE_ENV=development pnpm run seed
```

### Database Inspection

```bash
# Connect to database
psql $DATABASE_URL

# Check seeded data
SELECT * FROM payload.users;
SELECT * FROM payload.catalogs;
```

## API Reference

### SeedManager Methods

```typescript
class SeedManager {
  async initialize(): Promise<Payload>;
  async seed(options: SeedOptions): Promise<void>;
  async truncate(collections: string[]): Promise<void>;
  async cleanup(): Promise<void>;
}
```

### Seed Data Interfaces

```typescript
interface UserSeed {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: "user" | "admin" | "analyst";
  isActive: boolean;
}

interface CatalogSeed {
  name: string;
  description?: any;
  slug?: string;
  status: "active" | "archived";
}

// ... other interfaces
```

## Contributing

When contributing to the seed system:

1. Add tests for new functionality
2. Update documentation
3. Ensure CI passes
4. Follow naming conventions
5. Maintain backward compatibility

## License

This seed system is part of the Timetiles project and follows the same license terms.
