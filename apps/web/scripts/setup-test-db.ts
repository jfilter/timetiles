#!/usr/bin/env tsx

/**
 * Test Database Setup Script
 * 
 * This script ensures a clean, consistent test database is available for E2E tests.
 * It handles:
 * - Database creation
 * - PostGIS extension setup
 * - Schema migrations
 * - Basic validation
 */

import { execSync } from "child_process";
import { createLogger } from "../lib/logger";

const logger = createLogger("test-db-setup");

const TEST_DB_NAME = "timetiles_test";
const DB_USER = "timetiles_user";
const DB_PASSWORD = "timetiles_password";
const DB_HOST = "localhost";
const DB_PORT = "5432";

const TEST_DATABASE_URL = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${TEST_DB_NAME}`;

function runCommand(command: string, description: string): string {
  try {
    logger.info(`${description}...`);
    const result = execSync(command, { stdio: 'pipe', encoding: 'utf8' });
    logger.info(`✓ ${description} completed`);
    if (result) {
      logger.debug(`Command output: ${result}`);
    }
    return result;
  } catch (error: any) {
    logger.error(`✗ ${description} failed:`);
    if (error.stdout) logger.error(`stdout: ${error.stdout}`);
    if (error.stderr) logger.error(`stderr: ${error.stderr}`);
    logger.error(`Command: ${command}`);
    throw error;
  }
}

function runMakeCommand(target: string, description: string): void {
  runCommand(`make ${target}`, description);
}

function runDatabaseQuery(dbName: string, sql: string, description: string): string {
  // Detect CI environment - use direct psql commands instead of Docker-based make commands
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true' || process.env.PGPASSWORD;
  
  if (isCI) {
    // In CI, use direct psql commands since database runs as service container
    const command = `PGPASSWORD=${DB_PASSWORD} psql -h ${DB_HOST} -U ${DB_USER} -d ${dbName} -c "${sql}"`;
    return runCommand(command, `${description} (CI mode)`);
  } else {
    // Local development - use make commands with Docker
    const command = `cd ../.. && make db-query DB_NAME=${dbName} SQL="${sql}"`;
    return runCommand(command, `${description} (local mode)`);
  }
}

async function setupTestDatabase(): Promise<void> {
  logger.info("🗄️  Setting up test database for E2E tests");
  
  try {
    // Step 1: Ensure test database exists (no forced cleanup)
    logger.info("Step 1: Ensuring test database exists");
    
    try {
      // Try to create database - will fail gracefully if it exists
      runDatabaseQuery(
        "postgres", 
        `CREATE DATABASE ${TEST_DB_NAME}`,
        "Create test database if not exists"
      );
    } catch (error) {
      // Database likely already exists, which is fine
      logger.info("Test database already exists, continuing with setup");
    }

    // Step 2: Set up PostGIS extension
    logger.info("Step 2: Setting up PostGIS extension");
    runDatabaseQuery(
      TEST_DB_NAME,
      "CREATE EXTENSION IF NOT EXISTS postgis;",
      "Enable PostGIS extension"
    );

    // Step 3: Run migrations
    logger.info("Step 3: Running database migrations");
    runCommand(
      `DATABASE_URL="${TEST_DATABASE_URL}" pnpm payload migrate`,
      "Run Payload migrations"
    );

    // Step 4: Validate setup
    logger.info("Step 4: Validating database setup");
    runDatabaseQuery(
      TEST_DB_NAME,
      "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'payload';",
      "Validate payload schema exists"
    );

    logger.info("✅ Test database setup completed successfully");
    logger.info(`🔗 Test database URL: ${TEST_DATABASE_URL}`);

  } catch (error) {
    logger.error("❌ Test database setup failed:", error);
    process.exit(1);
  }
}

// Allow running as standalone script
if (import.meta.url === `file://${process.argv[1]}`) {
  setupTestDatabase();
}

export { setupTestDatabase, TEST_DATABASE_URL };