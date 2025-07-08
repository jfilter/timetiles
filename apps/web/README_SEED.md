# Seed System Quick Reference

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Run database migrations
pnpm run payload:migrate

# Seed development data
pnpm run seed:dev

# Or seed all collections for development
pnpm run seed

# Seed test data
pnpm run seed:test

# Seed specific collections
pnpm run seed development users catalogs

# Truncate all data
pnpm run seed:truncate

# Truncate specific collections
pnpm run seed:truncate users catalogs
```

## 📋 Available Commands

| Command                                   | Description                               |
| ----------------------------------------- | ----------------------------------------- |
| `pnpm run seed`                           | Seed all collections for development      |
| `pnpm run seed:dev`                       | Seed all collections for development      |
| `pnpm run seed:test`                      | Seed all collections for test environment |
| `pnpm run seed:truncate`                  | Truncate all collections                  |
| `pnpm run seed [env] [collections...]`    | Seed specific collections for environment |
| `pnpm run seed:truncate [collections...]` | Truncate specific collections             |

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run seed validation tests
npx tsx __tests__/seed-validation.ts

# Run integration tests
./scripts/test-seed-system.sh

# Run with coverage
pnpm run test:coverage
```

## 🔧 Configuration

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
PAYLOAD_SECRET=your-secret-key

# Optional
NODE_ENV=development|test|production
```

### Database Setup

```bash
# Create database
createdb timetiles

# Create test database
createdb timetiles_test

# Run migrations
pnpm run payload:migrate
```

## 📊 Data Overview

### Collections Seeded

- **Users**: Admin, analyst, and regular user accounts
- **Catalogs**: Data classification and organization
- **Datasets**: Data schema definitions and metadata
- **Events**: Time-series data points and measurements
- **Imports**: Data import history and processing logs

### Environment Differences

| Environment | Users | Catalogs | Datasets | Events | Imports |
| ----------- | ----- | -------- | -------- | ------ | ------- |
| Development | 5     | 4        | 4        | 6      | 4       |
| Test        | 3     | 3        | 3        | 6      | 3       |
| Production  | 2     | 2        | 2        | 4      | 2       |

## 🏗️ Architecture

```
SeedManager
├── Seeds Data Files
│   ├── users.ts
│   ├── catalogs.ts
│   ├── datasets.ts
│   ├── events.ts
│   └── imports.ts
├── CLI Scripts
│   └── seed.ts
├── Tests
│   ├── seed-validation.ts
│   ├── seed.test.ts
│   └── test-seed-system.sh
└── Documentation
    └── SEED_SYSTEM.md
```

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Error**

   ```bash
   # Check database is running
   pg_isready -h localhost -p 5432

   # Check connection string
   echo $DATABASE_URL
   ```

2. **Migration Issues**

   ```bash
   # Run migrations
   pnpm run payload:migrate

   # Check migration status
   pnpm run payload:migrate:status
   ```

3. **Relationship Errors**

   ```bash
   # Seed in correct order
   pnpm run seed development users catalogs datasets events imports
   ```

4. **Permission Errors**
   ```bash
   # Check database user permissions
   psql $DATABASE_URL -c "SELECT current_user, current_database();"
   ```

## 📝 Development

### Adding New Collections

1. Create seed data file in `lib/seed/seeds/`
2. Update `SeedManager.getSeedData()`
3. Update dependency order in `seedOrder`
4. Add tests
5. Update documentation

### Modifying Existing Data

1. Edit the appropriate seed file
2. Run validation tests
3. Update tests if needed
4. Test with all environments

## 🔍 Validation

The system includes comprehensive validation:

- **Data Structure**: Validates all seed data matches expected interfaces
- **Relationships**: Ensures foreign key references are valid
- **Environment Consistency**: Verifies different environments work correctly
- **Database Operations**: Tests actual seeding and truncation operations

## 📚 Full Documentation

For complete documentation, see [SEED_SYSTEM.md](./SEED_SYSTEM.md)

## 🤝 Contributing

1. Add tests for new functionality
2. Update documentation
3. Ensure CI passes
4. Follow existing patterns
5. Test with all environments
