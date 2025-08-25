#!/usr/bin/env tsx

/**
 * Test Database Setup Script.
 *
 * This script ensures a clean, consistent test database is available for E2E tests.
 * It handles:
 * - Database creation
 * - PostGIS extension setup
 * - Schema migrations
 * - Basic validation.
 *
 * @module
 * @category Scripts
 */

import { execSync } from "child_process";

import { createLogger } from "../lib/logger";
import { deriveTestDatabaseUrl, getDatabaseUrl, parseDatabaseUrl } from "../lib/utils/database-url";
import { resetTestDatabase, validateTestDatabaseSchema } from "./validate-test-db-schema";

const logger = createLogger("test-db-setup");

// Get DATABASE_URL from environment - required
const DATABASE_URL = getDatabaseUrl(true)!;

// Derive test database URL
const TEST_DATABASE_URL = deriveTestDatabaseUrl(DATABASE_URL);
const {
  username: DB_USER,
  password: DB_PASSWORD,
  host: DB_HOST,
  port: _DB_PORT,
  database: TEST_DB_NAME,
} = parseDatabaseUrl(TEST_DATABASE_URL);

const runCommand = (command: string, description: string): string => {
  try {
    logger.info(`${description}...`);
    // eslint-disable-next-line sonarjs/os-command -- Safe command execution in script
    const result = execSync(command, { stdio: "pipe", encoding: "utf8" });
    logger.info(`✓ ${description} completed`);
    if (result) {
      logger.debug(`Command output: ${result}`);
    }
    return result;
  } catch (error) {
    logger.error(`✗ ${description} failed:`);
    if (error && typeof error === "object" && "stdout" in error) {
      logger.error(`stdout: ${String(error.stdout)}`);
    }
    if (error && typeof error === "object" && "stderr" in error) {
      logger.error(`stderr: ${String(error.stderr)}`);
    }
    logger.error(`Command: ${command}`);
    throw error;
  }
};

// Utility function for make commands (currently unused but may be needed)
// const _runMakeCommand = (target: string, description: string): void => {
//   runCommand(`make ${target}`, description);
// };

const runDatabaseQuery = (dbName: string, sql: string, description: string): string => {
  // Detect CI environment - use direct psql commands instead of Docker-based make commands
  const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true" || process.env.PGPASSWORD;

  if (isCI) {
    // In CI, use direct psql commands since database runs as service container
    const command = `PGPASSWORD=${DB_PASSWORD} psql -h ${DB_HOST} -U ${DB_USER} -d ${dbName} -c "${sql}"`;
    return runCommand(command, `${description} (CI mode)`);
  } else {
    // Local development - use make commands with Docker
    const command = `cd ../.. && make db-query DB_NAME=${dbName} SQL="${sql}"`;
    return runCommand(command, `${description} (local mode)`);
  }
};

const setupTestDatabase = async (options: { forceReset?: boolean } = {}): Promise<void> => {
  logger.info("🗄️  Setting up test database for E2E tests");

  try {
    // Step 0: Validate existing schema if database exists
    logger.info("Step 0: Validating existing database schema");

    const validationResult = await validateTestDatabaseSchema();

    if (!validationResult.isValid && validationResult.migrationState.hasPayloadSchema) {
      logger.warn("❌ Detected inconsistent database schema:");
      validationResult.issues.forEach((issue) => logger.warn(`  • ${issue}`));

      if (options.forceReset) {
        logger.info("🔄 Force reset enabled - dropping and recreating database");
        await resetTestDatabase(true);
      } else {
        logger.info("💡 Consider using --force-reset to automatically fix schema issues");
        logger.info("🔧 Auto-recovering by dropping and recreating database");
        await resetTestDatabase(true);
      }
    } else if (!validationResult.isValid && !validationResult.migrationState.hasPayloadSchema) {
      logger.info("📝 Database doesn't exist or has no schema - will create fresh");
    } else {
      logger.info("✅ Existing database schema is valid");
    }

    // Step 1: Ensure test database exists (no forced cleanup)
    logger.info("Step 1: Ensuring test database exists");

    try {
      // Try to create database - will fail gracefully if it exists
      runDatabaseQuery("postgres", `CREATE DATABASE ${TEST_DB_NAME}`, "Create test database if not exists");
    } catch (error) {
      // Database likely already exists, which is fine
      logger.info("Test database already exists, continuing with setup");
      logger.debug("Database creation error (expected if exists):", error);
    }

    // Step 2: Set up PostGIS extension
    logger.info("Step 2: Setting up PostGIS extension");
    runDatabaseQuery(TEST_DB_NAME, "CREATE EXTENSION IF NOT EXISTS postgis;", "Enable PostGIS extension");

    // Step 3: Run migrations
    logger.info("Step 3: Running database migrations");
    try {
      runCommand(`DATABASE_URL="${TEST_DATABASE_URL}" pnpm payload migrate`, "Run Payload migrations");
    } catch {
      logger.error("❌ Migration failed - this usually indicates schema conflicts");
      logger.info("🔧 Attempting automatic recovery by resetting database");

      try {
        await resetTestDatabase(true);

        // Recreate database and retry migration
        runDatabaseQuery("postgres", `CREATE DATABASE ${TEST_DB_NAME}`, "Recreate test database");
        runDatabaseQuery(TEST_DB_NAME, "CREATE EXTENSION IF NOT EXISTS postgis;", "Re-enable PostGIS extension");
        runCommand(`DATABASE_URL="${TEST_DATABASE_URL}" pnpm payload migrate`, "Retry Payload migrations");

        logger.info("✅ Database reset and migration completed successfully");
      } catch (recoveryError) {
        logger.error("❌ Failed to recover from migration error:", recoveryError);
        throw recoveryError;
      }
    }

    // Step 4: Final validation
    logger.info("Step 4: Final database validation");
    const finalValidation = await validateTestDatabaseSchema();

    if (!finalValidation.isValid) {
      logger.error("❌ Database setup completed but validation failed:");
      finalValidation.issues.forEach((issue) => logger.error(`  • ${issue}`));
      throw new Error("Database setup validation failed");
    }

    logger.info("✅ Test database setup completed successfully");
    logger.info(`🔗 Test database URL: ${TEST_DATABASE_URL}`);
    logger.info(`📊 Schema contains ${finalValidation.migrationState.completedMigrations.length} completed migrations`);
  } catch (error) {
    logger.error("❌ Test database setup failed:", error);
    process.exit(1);
  }
};

// Allow running as standalone script
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const forceReset = args.includes("--force-reset") || args.includes("--force");

  void setupTestDatabase({ forceReset });
}

export { setupTestDatabase, TEST_DATABASE_URL };
