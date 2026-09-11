/**
 * Test database setup utilities.
 *
 * Creates worker test databases.
 * Uses shared database utilities for consistency with E2E setup.
 *
 * @module
 * @category Tests
 */

import { setupDatabase } from "../../../lib/database/setup";
import { logger } from "../../../lib/logger";

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
