#!/usr/bin/env tsx

/**
 * Test Database Schema Validation Script
 *
 * This script validates the consistency and health of the test database schema.
 * It can detect:
 * - Partial/incomplete migrations
 * - Schema inconsistencies
 * - Missing required tables or extensions
 * - Migration state mismatches
 *
 * Usage:
 *   node --import tsx/esm scripts/validate-test-db-schema.ts
 *   node --import tsx/esm scripts/validate-test-db-schema.ts --fix
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import { createLogger } from "../lib/logger";

const logger = createLogger("schema-validator");

const TEST_DB_NAME = "timetiles_test";
const DB_USER = "timetiles_user";
const DB_PASSWORD = "timetiles_password";
const DB_HOST = "localhost";
const DB_PORT = "5432";

export interface SchemaValidationResult {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  migrationState: {
    hasPayloadSchema: boolean;
    hasMigrationsTable: boolean;
    completedMigrations: string[];
    expectedMigrations: string[];
    missingMigrations: string[];
  };
}

export interface DatabaseInfo {
  exists: boolean;
  hasPostGIS: boolean;
  hasPayloadSchema: boolean;
  tableCount: number;
}

const runDatabaseQuery = (dbName: string, sql: string, description?: string): string => {
  const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

  let command: string;
  if (isCI) {
    command = `PGPASSWORD=${DB_PASSWORD} psql -h ${DB_HOST} -U ${DB_USER} -d ${dbName} -t -c "${sql}"`;
  } else {
    command = `cd ../.. && make db-query DB_NAME=${dbName} SQL="${sql}"`;
  }

  try {
    const result = execSync(command, { stdio: "pipe", encoding: "utf8" });
    if (description) {
      logger.debug(`✓ ${description}: ${result.trim()}`);
    }
    return result.trim();
  } catch (error: any) {
    if (description) {
      logger.debug(`✗ ${description} failed: ${error.message}`);
    }
    throw error;
  }
};

const checkDatabaseExists = (): boolean => {
  try {
    runDatabaseQuery("postgres", `SELECT 1 FROM pg_database WHERE datname = '${TEST_DB_NAME}'`);
    return true;
  } catch {
    return false;
  }
};

const getDatabaseInfo = (): DatabaseInfo => {
  const exists = checkDatabaseExists();

  if (!exists) {
    return {
      exists: false,
      hasPostGIS: false,
      hasPayloadSchema: false,
      tableCount: 0,
    };
  }

  try {
    // Check PostGIS extension
    const postgisResult = runDatabaseQuery(
      TEST_DB_NAME,
      "SELECT COUNT(*) FROM pg_extension WHERE extname = 'postgis'",
      "Check PostGIS extension",
    );
    // Parse the count from psql table output (skip header lines)
    const postgisLines = postgisResult
      .split("\n")
      .filter((line) => line.trim() && !line.includes("---") && !line.includes("count"));
    const postgisCount = parseInt(postgisLines[0]?.trim() || "0");
    const hasPostGIS = postgisCount > 0;

    // Check payload schema
    const schemaResult = runDatabaseQuery(
      TEST_DB_NAME,
      "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = 'payload'",
      "Check payload schema",
    );
    const schemaLines = schemaResult
      .split("\n")
      .filter((line) => line.trim() && !line.includes("---") && !line.includes("count"));
    const schemaCount = parseInt(schemaLines[0]?.trim() || "0");
    const hasPayloadSchema = schemaCount > 0;

    // Count tables in payload schema
    let tableCount = 0;
    if (hasPayloadSchema) {
      const tableResult = runDatabaseQuery(
        TEST_DB_NAME,
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'payload'",
        "Count payload tables",
      );
      const tableLines = tableResult
        .split("\n")
        .filter((line) => line.trim() && !line.includes("---") && !line.includes("count"));
      tableCount = parseInt(tableLines[0]?.trim() || "0");
    }

    return {
      exists: true,
      hasPostGIS,
      hasPayloadSchema,
      tableCount,
    };
  } catch (error) {
    logger.warn("Failed to get complete database info", { error });
    return {
      exists: true,
      hasPostGIS: false,
      hasPayloadSchema: false,
      tableCount: 0,
    };
  }
};

const getExpectedMigrations = (): string[] => {
  try {
    const migrationsIndexPath = path.join(process.cwd(), "migrations", "index.ts");

    if (!fs.existsSync(migrationsIndexPath)) {
      logger.warn("No migrations/index.ts found");
      return [];
    }

    const content = fs.readFileSync(migrationsIndexPath, "utf8");

    // Extract migration names from the imports/exports
    // Look for patterns like: export { default as Migration_20250729_195546 }
    const migrationMatches = content.match(/Migration_(\d{8}_\d{6})/g) || [];

    return migrationMatches.map((match) => match.replace("Migration_", ""));
  } catch (error) {
    logger.warn("Failed to read expected migrations", { error });
    return [];
  }
};

const getCompletedMigrations = (): string[] => {
  try {
    const result = runDatabaseQuery(
      TEST_DB_NAME,
      "SELECT name FROM payload.payload_migrations ORDER BY name",
      "Get completed migrations",
    );

    return result
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("name") && line !== "---")
      .map((name) => name.replace(/^migration_/i, ""));
  } catch (error) {
    logger.debug("No completed migrations found or table doesn't exist");
    return [];
  }
};

export const validateTestDatabaseSchema = async (): Promise<SchemaValidationResult> => {
  logger.info("🔍 Validating test database schema...");

  const issues: string[] = [];
  const suggestions: string[] = [];

  // Get database info
  const dbInfo = getDatabaseInfo();

  if (!dbInfo.exists) {
    issues.push("Test database does not exist");
    suggestions.push("Run: pnpm test:db:reset");

    return {
      isValid: false,
      issues,
      suggestions,
      migrationState: {
        hasPayloadSchema: false,
        hasMigrationsTable: false,
        completedMigrations: [],
        expectedMigrations: [],
        missingMigrations: [],
      },
    };
  }

  // Check PostGIS extension
  if (!dbInfo.hasPostGIS) {
    issues.push("PostGIS extension is not installed");
    suggestions.push("PostGIS extension is required for spatial data operations");
  }

  // Get migration information
  const expectedMigrations = getExpectedMigrations();
  const completedMigrations = getCompletedMigrations();
  const missingMigrations = expectedMigrations.filter(
    (expected) => !completedMigrations.some((completed) => completed.includes(expected)),
  );

  const hasMigrationsTable = completedMigrations.length > 0 || dbInfo.hasPayloadSchema;

  // Validate schema state
  if (!dbInfo.hasPayloadSchema) {
    issues.push("Payload schema does not exist");
    suggestions.push("Database needs to be migrated or recreated");
  } else if (dbInfo.tableCount === 0) {
    issues.push("Payload schema exists but has no tables");
    suggestions.push("Schema appears to be in an incomplete state - consider reset");
  } else if (dbInfo.tableCount < 10) {
    issues.push(`Payload schema has only ${dbInfo.tableCount} tables (expected 50+)`);
    suggestions.push("Schema appears to be partially migrated - consider reset");
  } else {
    logger.debug(`Payload schema has ${dbInfo.tableCount} tables - looks good`);
  }

  // Check migration consistency
  if (expectedMigrations.length > 0 && missingMigrations.length > 0) {
    issues.push(
      `Missing ${missingMigrations.length} migrations: ${missingMigrations.slice(0, 3).join(", ")}${missingMigrations.length > 3 ? "..." : ""}`,
    );
    suggestions.push("Run migrations or reset database to resolve missing migrations");
  }

  // Check for partial migration state
  if (dbInfo.hasPayloadSchema && completedMigrations.length === 0 && expectedMigrations.length > 0) {
    issues.push("Schema exists but no completed migrations recorded");
    suggestions.push("This indicates a partial or failed migration state - reset recommended");
  }

  const migrationState = {
    hasPayloadSchema: dbInfo.hasPayloadSchema,
    hasMigrationsTable,
    completedMigrations,
    expectedMigrations,
    missingMigrations,
  };

  const isValid = issues.length === 0;

  if (isValid) {
    logger.info("✅ Test database schema is valid and consistent");
  } else {
    logger.warn(`❌ Found ${issues.length} schema issues`);
    issues.forEach((issue) => logger.warn(`  • ${issue}`));

    if (suggestions.length > 0) {
      logger.info("💡 Suggested fixes:");
      suggestions.forEach((suggestion) => logger.info(`  • ${suggestion}`));
    }
  }

  return {
    isValid,
    issues,
    suggestions,
    migrationState,
  };
};

export const resetTestDatabase = async (force: boolean = false): Promise<void> => {
  logger.info("🔄 Resetting test database...");

  if (!force) {
    logger.warn("This will completely drop and recreate the test database");
    logger.warn("Use --force flag to proceed without confirmation");
    return;
  }

  try {
    // Drop database if exists
    const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

    if (isCI) {
      execSync(
        `PGPASSWORD=${DB_PASSWORD} psql -h ${DB_HOST} -U ${DB_USER} -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB_NAME}"`,
      );
      logger.info("✓ Dropped existing test database");
    } else {
      execSync(`cd ../.. && make db-query DB_NAME=postgres SQL="DROP DATABASE IF EXISTS ${TEST_DB_NAME}"`);
      logger.info("✓ Dropped existing test database");
    }

    logger.info("✅ Test database reset completed");
    logger.info("💡 Run 'pnpm test:e2e' to recreate with proper setup");
  } catch (error) {
    logger.error("❌ Failed to reset test database:", error);
    throw error;
  }
};

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const shouldFix = args.includes("--fix") || args.includes("--force");

  (async () => {
    try {
      const result = await validateTestDatabaseSchema();

      if (!result.isValid && shouldFix) {
        logger.info("🔧 Auto-fixing detected issues...");
        await resetTestDatabase(true);
      } else if (!result.isValid) {
        logger.info("💡 Use --fix flag to automatically reset the database");
        process.exit(1);
      }
    } catch (error) {
      logger.error("Schema validation failed:", error);
      process.exit(1);
    }
  })();
}
