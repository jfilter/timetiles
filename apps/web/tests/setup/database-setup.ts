/**
 * Test database setup utilities.
 *
 * Provides functions for creating, truncating, and dropping worker test databases.
 * Uses shared database utilities for consistency with E2E setup.
 *
 * @module
 * @category Tests
 */

import { dropDatabase, truncateTables } from "../../lib/database/operations";
import { setupDatabase } from "../../lib/database/setup";
import { parseDatabaseUrl } from "../../lib/database/url";
import { logger } from "../../lib/logger";

/**
 * Creates isolated test database for each worker.
 *
 * Uses the shared setupDatabase utility with worker-specific configuration.
 *
 * @param dbName - Name of the database to create
 *
 * @example
 * ```typescript
 * await createTestDatabase('timetiles_test_1');
 * ```
 */
export const createTestDatabase = async (dbName: string): Promise<void> => {
  try {
    await setupDatabase({
      databaseName: dbName,
      enablePostGIS: true,
      createPayloadSchema: true,
      runMigrations: false, // Migrations run separately via verifyDatabaseSchema
      skipIfExists: true, // Don't recreate if already exists
      verbose: false, // Quiet mode for tests
    });

    logger.debug(`Test database ready: ${dbName}`);
  } catch (error) {
    logger.error({ err: error, dbName }, `Failed to create test database ${dbName}`);
    throw error;
  }
};

/**
 * Truncates all tables in the test database.
 *
 * Useful for cleaning up between test runs without dropping the entire database.
 * Uses shared truncateTables utility from lib/database/operations.
 *
 * @param dbUrl - Database connection URL (defaults to process.env.DATABASE_URL)
 *
 * @example
 * ```typescript
 * await truncateAllTables('postgresql://user:pass@localhost:5432/timetiles_test_1');
 * ```
 */
export const truncateAllTables = async (dbUrl?: string): Promise<void> => {
  const connectionString = dbUrl ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("No database URL provided");
  }

  try {
    const tableCount = await truncateTables(connectionString, {
      schema: "payload",
      excludePatterns: ["payload_migrations%"],
    });
    logger.debug(`Truncated ${tableCount} tables in test database`);
  } catch (error) {
    logger.error({ err: error }, "Failed to truncate tables");
    throw error;
  }
};

/**
 * Drops a test database.
 *
 * Uses shared dropDatabase utility which handles connection termination.
 *
 * @param dbName - Name of the database to drop
 *
 * @example
 * ```typescript
 * await dropTestDatabase('timetiles_test_1');
 * ```
 */
export const dropTestDatabase = async (dbName: string): Promise<void> => {
  try {
    await dropDatabase(dbName, { ifExists: true });
    logger.debug(`Dropped test database: ${dbName}`);
  } catch (error) {
    logger.warn({ err: error, dbName }, `Failed to drop test database ${dbName}`);
  }
};

/**
 * Extract database name from connection URL.
 *
 * Uses shared parseDatabaseUrl utility for consistency.
 *
 * @param url - Database connection URL
 * @returns Database name
 *
 * @example
 * ```typescript
 * const dbName = getDatabaseName('postgresql://user:pass@localhost:5432/timetiles_test_1');
 * // Returns: 'timetiles_test_1'
 * ```
 */
export const getDatabaseName = (url: string): string => {
  try {
    const parsed = parseDatabaseUrl(url);
    return parsed.database;
  } catch {
    // Fallback to default if parsing fails
    return "timetiles_test";
  }
};
